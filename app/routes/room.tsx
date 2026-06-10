import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  ClientEvent,
  EventType,
  MatrixEventEvent,
  MsgType,
  RoomEvent,
  SyncState,
  type MatrixClient,
  type MatrixEvent,
  type Room,
} from "matrix-js-sdk";
import { getReadyClient } from "../lib/matrix";
import { getMediaBlobUrl, type MediaSource } from "../lib/media";

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

/** 타임라인에서 표시할 이벤트만 추림 (복호화되면 type이 m.room.message로 바뀜) */
function visibleEvents(room: Room): MatrixEvent[] {
  return room
    .getLiveTimeline()
    .getEvents()
    .filter(
      (ev) =>
        ev.getType() === EventType.RoomMessage ||
        ev.getType() === EventType.RoomMessageEncrypted ||
        ev.isDecryptionFailure(),
    );
}

function EventLine({
  ev,
  myUserId,
  client,
}: {
  ev: MatrixEvent;
  myUserId: string;
  client: MatrixClient;
}) {
  const sender = ev.getSender() ?? "?";
  const mine = sender === myUserId;
  const content = ev.getContent();
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
    <li className={`flex flex-col py-1 ${mine ? "items-end" : "items-start"}`}>
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const stickToBottomRef = useRef(true);
  const loadingOlderRef = useRef(false);
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
      if (!cl.clientRunning) cl.startClient({ initialSyncLimit: 20 });

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
        return true;
      };

      const onSync = (state: SyncState) => {
        if (state === SyncState.Prepared) bind();
      };
      if (!bind()) cl.on(ClientEvent.Sync, onSync);

      const refresh = () => {
        const r = cl.getRoom(roomId);
        if (r) setEvents(visibleEvents(r));
      };
      const onTimeline = (_ev: MatrixEvent, r?: Room) => {
        if (r?.roomId !== roomId) return;
        refresh();
      };
      const onDecrypted = (ev: MatrixEvent) => {
        if (ev.getRoomId() !== roomId) return;
        refresh();
      };
      cl.on(RoomEvent.Timeline, onTimeline);
      cl.on(MatrixEventEvent.Decrypted, onDecrypted);
      cleanup = () => {
        cl.off(ClientEvent.Sync, onSync);
        cl.off(RoomEvent.Timeline, onTimeline);
        cl.off(MatrixEventEvent.Decrypted, onDecrypted);
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
      const timeline = room.getLiveTimeline();
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
      setEvents(visibleEvents(room));
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

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col p-4">
      <header className="flex items-center gap-3 border-b border-gray-200 pb-3 dark:border-gray-800">
        <Link to="/" className="text-blue-500">
          ←
        </Link>
        <h1 className="truncate text-lg font-bold">{room?.name ?? roomId}</h1>
        {room?.hasEncryptionStateEvent() && <span title="E2EE 방">🔐</span>}
      </header>
      <ul ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto py-3">
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
            />
          ) : null,
        )}
        <div ref={bottomRef} />
      </ul>
      {error && <p className="pb-1 text-sm text-red-500">{error}</p>}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          className="flex-1 rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="메시지 입력..."
        />
        <button
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          disabled={sending || !draft.trim()}
        >
          전송
        </button>
      </form>
    </main>
  );
}
