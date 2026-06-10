import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  ClientEvent,
  EventType,
  MatrixEventEvent,
  RoomEvent,
  SyncState,
  ThreadEvent,
  type MatrixClient,
  type MatrixEvent,
  type Room,
  type EventTimelineSet,
} from "matrix-js-sdk";
import { getReadyClient, ensureStarted, getNoThreadTimelineSet } from "../lib/matrix";
import { uploadAndSendFile } from "../lib/media";
import { visibleEvents } from "../lib/timeline";
import { EventLine } from "../components/EventLine";
import { ThreadPanel } from "../components/ThreadPanel";

export function meta() {
  return [{ title: "방 — matrix-client" }];
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
    let cleanup: (() => void) | undefined;
    promise.then((cl) => {
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
        for (let i = 0; i < 10 && visibleEvents(r, tlSet).length < 15; i++) {
          const timeline = tlSet?.getLiveTimeline() ?? r.getLiveTimeline();
          let more: boolean;
          try {
            more = await cl2.paginateEventTimeline(timeline, {
              backwards: true,
              limit: 50,
            });
          } catch (e) {
            console.warn("[fillUntilVisible] paginate 실패:", e);
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
      // E2EE 수정(m.replace)은 복호화 후 비동기로 원본에 합쳐짐(makeReplaced)
      // → 그 시점에 다시 그려야 최종 수정 내용이 보임 (스트리밍 봇 메시지)
      const onReplaced = (ev: MatrixEvent) => {
        if (ev.getRoomId() !== roomId) return;
        refresh();
      };
      const onThreadUpdate = () => {
        refresh(); // 스레드 답글 수 배지 갱신
      };
      cl.on(RoomEvent.Timeline, onTimeline);
      cl.on(MatrixEventEvent.Decrypted, onDecrypted);
      cl.on(MatrixEventEvent.Replaced, onReplaced);
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
        cl.off(MatrixEventEvent.Replaced, onReplaced);
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
              client && room ? (
                <EventLine
                  key={ev.getId()}
                  ev={ev}
                  myUserId={myUserId}
                  client={client}
                  room={room}
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
