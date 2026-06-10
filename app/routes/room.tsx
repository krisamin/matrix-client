import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  ClientEvent,
  EventType,
  MatrixEventEvent,
  MsgType,
  RoomEvent,
  SyncState,
  ThreadEvent,
  type MatrixClient,
  type MatrixEvent,
  type Room,
  type EventTimelineSet,
} from "matrix-js-sdk";
import { getReadyClient, ensureStarted, getNoThreadTimelineSet } from "../lib/matrix";
import { getMediaBlobUrl, uploadAndSendFile, type MediaSource } from "../lib/media";

export function meta() {
  return [{ title: "방 — matrix-client" }];
}

const MEDIA_MSGTYPES = [
  MsgType.Image,
  MsgType.Video,
  MsgType.Audio,
  MsgType.File,
] as string[];

/** 이미지/비디오/오디오/파일 첨부 렌더 (인증 미디어 + E2EE 복호화 처리) */
function MediaView({
  client,
  ev,
}: {
  client: MatrixClient;
  ev: MatrixEvent;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const content = ev.getContent();
  const msgtype = content.msgtype as string;

  useEffect(() => {
    const source: MediaSource = {
      url: content.url,
      file: content.file,
      mimetype: content.info?.mimetype,
    };
    const promise = getMediaBlobUrl(client, source);
    if (!promise) {
      setError("미디어 URL 없음");
      return;
    }
    let alive = true;
    promise
      .then((u) => alive && setBlobUrl(u))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [client, ev]);

  if (error) return <span className="text-sm text-red-400">⚠ {error}</span>;
  if (!blobUrl)
    return <span className="text-sm text-gray-400">미디어 로딩 중...</span>;

  switch (msgtype) {
    case MsgType.Image:
      return (
        <a href={blobUrl} target="_blank" rel="noreferrer">
          <img
            src={blobUrl}
            alt={content.body ?? "이미지"}
            className="max-h-80 max-w-full rounded-lg object-contain"
          />
        </a>
      );
    case MsgType.Video:
      return (
        <video src={blobUrl} controls className="max-h-80 max-w-full rounded-lg" />
      );
    case MsgType.Audio:
      return <audio src={blobUrl} controls />;
    default:
      return (
        <a
          href={blobUrl}
          download={content.body ?? "file"}
          className="text-blue-500 underline"
        >
          📎 {content.body ?? "파일 다운로드"}
        </a>
      );
  }
}

/** 타임라인에서 표시할 이벤트만 추림 (복호화되면 type이 m.room.message로 바뀜).
 *  스레드 답글은 메인 타임라인에서 제외 (스레드 패널에서 표시).
 *  timelineSet이 있으면 그 라이브 타임라인(MSC3874 필터드)을 사용. */
function visibleEvents(room: Room, tlSet?: EventTimelineSet | null): MatrixEvent[] {
  const timeline = tlSet?.getLiveTimeline() ?? room.getLiveTimeline();
  return timeline
    .getEvents()
    .filter(
      (ev) =>
        (ev.getType() === EventType.RoomMessage ||
          ev.getType() === EventType.RoomMessageEncrypted ||
          ev.isDecryptionFailure()) &&
        (!ev.threadRootId || ev.isThreadRoot),
    );
}

/** 스레드 패널: 루트 이벤트 + 답글 타임라인 + 입력창 */
function ThreadPanel({
  client,
  room,
  rootId,
  myUserId,
  onClose,
}: {
  client: MatrixClient;
  room: Room;
  rootId: string;
  myUserId: string;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<MatrixEvent[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [initialising, setInitialising] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const thread =
      room.getThread(rootId) ??
      room.createThread(rootId, room.findEventById(rootId), [], true);

    const refresh = (reason = "?") => {
      // 주의: liveTimeline 레퍼런스를 미리 잡아두면 안 됨 —
      // SDK가 초기화 시 resetLiveTimeline()으로 갈아끼움.
      // thread.events getter는 항상 현재 타임라인을 가리킴.
      const raw = thread.events;
      console.debug(
        `[thread:${rootId.slice(0, 12)}] refresh(${reason})`,
        `raw=${raw.length}`,
        `replyCount=${thread.length}`,
        `fetched=${thread.initialEventsFetched}`,
        `lastTs=${raw.length ? new Date(raw[raw.length - 1].getTs()).toLocaleTimeString() : "-"}`,
        `types=${[...new Set(raw.map((e) => e.getType()))].join(",")}`,
      );
      console.debug(
        `[thread:${rootId.slice(0, 12)}] events:\n` +
          raw
            .map(
              (e, i) =>
                `  ${i} ${new Date(e.getTs()).toLocaleTimeString()} ${e.getType()} ${e.getSender()?.slice(1, 8)} ${e.getId()?.slice(0, 10)}`,
            )
            .join("\n"),
      );
      const evs = raw
        .filter(
          (ev) =>
            ev.getType() === EventType.RoomMessage ||
            ev.getType() === EventType.RoomMessageEncrypted ||
            ev.isDecryptionFailure(),
        )
        // SDK 알려진 race: 초기 fetch 중 sync로 온 이벤트가 타임라인 앞에
        // 끼어 순서가 꼬일 수 있음 → 렌더 전 항상 시간순 정렬
        .sort((a, b) => a.getTs() - b.getTs());
      for (const ev of evs) {
        if (ev.getType() === EventType.RoomMessageEncrypted) {
          client.decryptEventIfNeeded(ev);
        }
      }
      setEvents([...evs]);
      if (thread.initialEventsFetched) setInitialising(false);
    };

    refresh("mount");

    // SDK가 초기 fetch(리셋 + 최신 답글 로드)를 스스로 수행하고
    // 끝나면 ThreadEvent.Update / RoomEvent.TimelineReset을 emit함
    const onUpdate = () => refresh("update");
    const onNewReply = () => refresh("newReply");
    const onTimeline = () => refresh("timeline");
    const onReset = () => refresh("reset");
    thread.on(ThreadEvent.Update, onUpdate);
    thread.on(ThreadEvent.NewReply, onNewReply);
    thread.on(RoomEvent.Timeline, onTimeline);
    thread.on(RoomEvent.TimelineReset, onReset);
    const onDecrypted = (ev: MatrixEvent) => {
      if (ev.threadRootId === rootId || ev.getId() === rootId) refresh("decrypted");
    };
    client.on(MatrixEventEvent.Decrypted, onDecrypted);
    return () => {
      thread.off(ThreadEvent.Update, onUpdate);
      thread.off(ThreadEvent.NewReply, onNewReply);
      thread.off(RoomEvent.Timeline, onTimeline);
      thread.off(RoomEvent.TimelineReset, onReset);
      client.off(MatrixEventEvent.Decrypted, onDecrypted);
    };
  }, [client, room, rootId]);

  // 새 답글 오면 바닥 고정 (사용자가 위를 보고 있으면 유지)
  useEffect(() => {
    if (stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [events]);

  async function loadOlderReplies() {
    if (loadingOlder) return;
    setLoadingOlder(true);
    try {
      const thread = room.getThread(rootId);
      if (!thread) return;
      // 호출 시점의 liveTimeline 사용 (리셋 이후의 현재 타임라인)
      await client.paginateEventTimeline(thread.liveTimeline, {
        backwards: true,
        limit: 50,
      });
      const evs = thread.events
        .filter(
          (ev) =>
            ev.getType() === EventType.RoomMessage ||
            ev.getType() === EventType.RoomMessageEncrypted ||
            ev.isDecryptionFailure(),
        )
        .sort((a, b) => a.getTs() - b.getTs());
      for (const ev of evs) {
        if (ev.getType() === EventType.RoomMessageEncrypted) {
          client.decryptEventIfNeeded(ev);
        }
      }
      setEvents([...evs]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingOlder(false);
    }
  }

  function onScroll() {
    const list = listRef.current;
    if (!list) return;
    stickToBottomRef.current =
      list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    if (list.scrollTop < 100) loadOlderReplies();
  }

  async function sendReply() {
    if (!draft.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await client.sendTextMessage(room.roomId, rootId, draft);
      setDraft("");
      stickToBottomRef.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-gray-200 pl-3 dark:border-gray-800">
      <header className="flex items-center justify-between border-b border-gray-200 pb-2 dark:border-gray-800">
        <h2 className="text-sm font-bold">스레드</h2>
        <button onClick={onClose} className="px-2 text-gray-500">
          ✕
        </button>
      </header>
      <ul ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto py-2">
        {(initialising || loadingOlder) && (
          <li className="py-2 text-center text-xs text-gray-500">
            {initialising ? "스레드 불러오는 중..." : "과거 답글 불러오는 중..."}
          </li>
        )}
        {events.map((ev) => (
          <EventLine
            key={ev.getId()}
            ev={ev}
            myUserId={myUserId}
            client={client}
          />
        ))}
        {!initialising && events.length === 0 && (
          <li className="py-2 text-xs text-gray-500">답글 없음</li>
        )}
        <div ref={bottomRef} />
      </ul>
      {error && <p className="pb-1 text-xs text-red-500">{error}</p>}
      <form
        className="flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          sendReply();
        }}
      >
        <input
          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="스레드에 답글..."
        />
        <button
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={sending || !draft.trim()}
        >
          ↩
        </button>
      </form>
    </aside>
  );
}

function EventLine({
  ev,
  myUserId,
  client,
  onOpenThread,
}: {
  ev: MatrixEvent;
  myUserId: string;
  client: MatrixClient;
  onOpenThread?: (rootId: string) => void;
}) {
  const sender = ev.getSender() ?? "?";
  const mine = sender === myUserId;
  const content = ev.getContent();
  const threadLength = ev.isThreadRoot
    ? (ev.getThread()?.length ?? 0)
    : 0;
  const isMedia =
    ev.getType() === EventType.RoomMessage &&
    MEDIA_MSGTYPES.includes(content.msgtype as string) &&
    !ev.isRedacted();
  let body: string;
  if (ev.isDecryptionFailure()) {
    body = "🔒 복호화 실패 (키 없음 — 기기 인증/키 백업 확인)";
  } else if (ev.getType() === EventType.RoomMessageEncrypted) {
    body = "🔒 복호화 중...";
  } else if (ev.isRedacted()) {
    body = "(삭제된 메시지)";
  } else {
    body = content.body ?? `(${content.msgtype ?? ev.getType()})`;
  }
  const time = new Date(ev.getTs()).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <li
      className={`group flex flex-col py-1 ${mine ? "items-end" : "items-start"}`}
    >
      <span className="text-xs text-gray-500">
        {sender} · {time}
      </span>
      {isMedia ? (
        <span className="max-w-[80%]">
          <MediaView client={client} ev={ev} />
        </span>
      ) : (
        <span
          className={`max-w-[80%] whitespace-pre-wrap break-words rounded-lg px-3 py-1.5 ${
            mine ? "bg-blue-600 text-white" : "bg-gray-200 dark:bg-gray-800"
          }`}
        >
          {body}
        </span>
      )}
      {onOpenThread && (
        <span className="flex gap-2 text-xs">
          {threadLength > 0 && (
            <button
              className="text-blue-500 hover:underline"
              onClick={() => onOpenThread(ev.getId()!)}
            >
              🧵 답글 {threadLength}개
            </button>
          )}
          {threadLength === 0 && (
            <button
              className="text-gray-400 opacity-0 hover:underline group-hover:opacity-100"
              onClick={() => onOpenThread(ev.getId()!)}
            >
              스레드 시작
            </button>
          )}
        </span>
      )}
    </li>
  );
}

export default function RoomView() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<MatrixClient | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [events, setEvents] = useState<MatrixEvent[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const stickToBottomRef = useRef(true);
  const loadingOlderRef = useRef(false);
  const tlSetRef = useRef<EventTimelineSet | null>(null);
  const myUserId = client?.getUserId() ?? "";

  useEffect(() => {
    const promise = getReadyClient();
    if (!promise || !roomId) {
      navigate("/login", { replace: true });
      return;
    }
    let c: MatrixClient | undefined;
    let cleanup: (() => void) | undefined;
    promise.then((cl) => {
      c = cl;
      setClient(cl);
      if (!cl.clientRunning) ensureStarted(cl);

      const bind = () => {
        const r = cl.getRoom(roomId);
        if (!r) return false;
        setRoom(r);
        // 과거 암호화 이벤트 복호화 시도
        for (const ev of r.getLiveTimeline().getEvents()) {
          if (ev.getType() === EventType.RoomMessageEncrypted) {
            cl.decryptEventIfNeeded(ev);
          }
        }
        setEvents(visibleEvents(r));
        // MSC3874: 스레드 답글 제외 필터드 타임라인 생성 → 이후 페이지네이션은
        // 서버가 스레드 답글 빼고 줌 (빈 페이지 데드락 원천 차단)
        void (async () => {
          const tlSet = await getNoThreadTimelineSet(cl, r);
          tlSetRef.current = tlSet;
          if (tlSet) {
            setEvents(visibleEvents(r, tlSet));
          }
          await fillUntilVisible(cl, r);
        })();
        return true;
      };

      // 보이는 이벤트가 최소치를 넘거나 타임라인 끝에 닿을 때까지 backwards 페이지네이션
      const fillUntilVisible = async (cl2: MatrixClient, r: Room) => {
        const tlSet = tlSetRef.current;
        for (
          let i = 0;
          i < 10 && visibleEvents(r, tlSet).length < 15;
          i++
        ) {
          const timeline = tlSet?.getLiveTimeline() ?? r.getLiveTimeline();
          let more: boolean;
          try {
            more = await cl2.paginateEventTimeline(timeline, {
              backwards: true,
              limit: 50,
            });
          } catch {
            break;
          }
          for (const ev of timeline.getEvents()) {
            if (ev.getType() === EventType.RoomMessageEncrypted) {
              cl2.decryptEventIfNeeded(ev);
            }
          }
          setEvents(visibleEvents(r, tlSet));
          if (!more) {
            setHasMore(false);
            break;
          }
        }
      };

      const onSync = (state: SyncState) => {
        if (state === SyncState.Prepared) bind();
      };
      if (!bind()) cl.on(ClientEvent.Sync, onSync);

      const refresh = () => {
        const r = cl.getRoom(roomId);
        if (r) setEvents(visibleEvents(r, tlSetRef.current));
      };
      const onTimeline = (_ev: MatrixEvent, r?: Room) => {
        if (r?.roomId !== roomId) return;
        refresh();
      };
      const onDecrypted = (ev: MatrixEvent) => {
        if (ev.getRoomId() !== roomId) return;
        refresh();
      };
      const onThreadUpdate = () => {
        refresh(); // 스레드 답글 수 배지 갱신
      };
      cl.on(RoomEvent.Timeline, onTimeline);
      cl.on(MatrixEventEvent.Decrypted, onDecrypted);
      // ThreadEvent는 Room이 emit — 방이 생긴 뒤에 단다
      const tryAttachThreadListener = () => {
        const r = cl.getRoom(roomId);
        if (r) {
          r.on(ThreadEvent.Update, onThreadUpdate);
          r.on(ThreadEvent.NewReply, onThreadUpdate);
          return true;
        }
        return false;
      };
      if (!tryAttachThreadListener()) {
        const onSyncForThread = (state: SyncState) => {
          if (state === SyncState.Prepared && tryAttachThreadListener()) {
            cl.off(ClientEvent.Sync, onSyncForThread);
          }
        };
        cl.on(ClientEvent.Sync, onSyncForThread);
      }
      cleanup = () => {
        cl.off(ClientEvent.Sync, onSync);
        cl.off(RoomEvent.Timeline, onTimeline);
        cl.off(MatrixEventEvent.Decrypted, onDecrypted);
        const r = cl.getRoom(roomId);
        r?.off(ThreadEvent.Update, onThreadUpdate);
        r?.off(ThreadEvent.NewReply, onThreadUpdate);
      };
    });
    return () => cleanup?.();
  }, [roomId, navigate]);

  useEffect(() => {
    if (stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [events]);

  async function loadOlder() {
    if (!client || !room || loadingOlderRef.current || !hasMore) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const list = listRef.current;
    const prevScrollHeight = list?.scrollHeight ?? 0;
    const prevScrollTop = list?.scrollTop ?? 0;
    try {
      const timeline =
        tlSetRef.current?.getLiveTimeline() ?? room.getLiveTimeline();
      const more = await client.paginateEventTimeline(timeline, {
        backwards: true,
        limit: 30,
      });
      setHasMore(more);
      // 새로 들어온 과거 암호화 이벤트 복호화
      for (const ev of timeline.getEvents()) {
        if (ev.getType() === EventType.RoomMessageEncrypted) {
          client.decryptEventIfNeeded(ev);
        }
      }
      setEvents(visibleEvents(room, tlSetRef.current));
      // 스크롤 위치 보존: 늘어난 높이만큼 내려서 보던 메시지 유지
      requestAnimationFrame(() => {
        if (list) {
          list.scrollTop = prevScrollTop + (list.scrollHeight - prevScrollHeight);
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }

  function onScroll() {
    const list = listRef.current;
    if (!list) return;
    // 바닥 근처(80px)에 있을 때만 새 메시지 오면 자동 스크롤
    stickToBottomRef.current =
      list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    // 위쪽 200px 안으로 올라오면 과거 로드
    if (list.scrollTop < 200) loadOlder();
  }

  async function send() {
    if (!client || !roomId || !draft.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await client.sendTextMessage(roomId, draft);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  async function sendFiles(files: FileList | File[]) {
    if (!client || !roomId || uploading) return;
    setError(null);
    try {
      for (const file of Array.from(files)) {
        setUploading(`${file.name} 업로드 중...`);
        await uploadAndSendFile(client, roomId, file, (loaded, total) => {
          const pct = total ? Math.round((loaded / total) * 100) : 0;
          setUploading(`${file.name} 업로드 중... ${pct}%`);
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(null);
    }
  }

  return (
    <main
      className={`mx-auto flex h-screen flex-col p-4 ${threadRootId ? "max-w-5xl" : "max-w-2xl"}`}
    >
      <header className="flex items-center gap-3 border-b border-gray-200 pb-3 dark:border-gray-800">
        <Link to="/" className="text-blue-500">
          ←
        </Link>
        <h1 className="truncate text-lg font-bold">{room?.name ?? roomId}</h1>
        {room?.hasEncryptionStateEvent() && <span title="E2EE 방">🔐</span>}
      </header>
      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <ul
            ref={listRef}
            onScroll={onScroll}
            className="flex-1 overflow-y-auto py-3"
          >
            {loadingOlder && (
              <li className="py-2 text-center text-xs text-gray-500">
                과거 메시지 불러오는 중...
              </li>
            )}
            {!hasMore && (
              <li className="py-2 text-center text-xs text-gray-500">
                — 대화의 시작 —
              </li>
            )}
            {events.map((ev) =>
              client ? (
                <EventLine
                  key={ev.getId()}
                  ev={ev}
                  myUserId={myUserId}
                  client={client}
                  onOpenThread={setThreadRootId}
                />
              ) : null,
            )}
            <div ref={bottomRef} />
          </ul>
          {error && <p className="pb-1 text-sm text-red-500">{error}</p>}
          {uploading && (
            <p className="pb-1 text-sm text-gray-500">{uploading}</p>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) sendFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="rounded border border-gray-300 px-3 py-2 disabled:opacity-50 dark:border-gray-700"
              disabled={!!uploading}
              onClick={() => fileInputRef.current?.click()}
              title="파일 첨부"
            >
              📎
            </button>
            <input
              className="flex-1 rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files);
                if (files.length) {
                  e.preventDefault();
                  sendFiles(files);
                }
              }}
              placeholder="메시지 입력..."
            />
            <button
              className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
              disabled={sending || !draft.trim()}
            >
              전송
            </button>
          </form>
        </div>
        {threadRootId && client && room && (
          <ThreadPanel
            client={client}
            room={room}
            rootId={threadRootId}
            myUserId={myUserId}
            onClose={() => setThreadRootId(null)}
          />
        )}
      </div>
    </main>
  );
}
