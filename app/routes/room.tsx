import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  EventType,
  MsgType,
  type MatrixEvent,
} from "matrix-js-sdk";
import { uploadAndSendFile } from "../lib/media";
import { useSendTyping, useTypingMembers } from "../lib/typing";
import { useRoomTimeline, useReadReceipt } from "../hooks/useRoomTimeline";
import { ConnectionBanner } from "../components/ConnectionBanner";
import { EventLine } from "../components/EventLine";
import { ThreadPanel } from "../components/ThreadPanel";

export function meta() {
  return [{ title: "방 — matrix-client" }];
}

export default function RoomView() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const goLogin = useCallback(
    () => navigate("/login", { replace: true }),
    [navigate],
  );
  const { client, room, events, hasMore, loadingOlder, loadOlder } =
    useRoomTimeline(roomId, goLogin);
  useReadReceipt(client, events);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<MatrixEvent | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const stickToBottomRef = useRef(true);
  const myUserId = client?.getUserId() ?? "";
  const typingNames = useTypingMembers(client, room);
  const { notifyTyping, clearTyping } = useSendTyping(client, roomId);

  // 새 메시지 오면 바닥 고정 (사용자가 위를 보고 있으면 유지)
  useEffect(() => {
    if (stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [events]);

  /** 과거 로드 + 스크롤 위치 보존 (보던 메시지 유지) */
  async function loadOlderKeepScroll() {
    const list = listRef.current;
    const prevScrollHeight = list?.scrollHeight ?? 0;
    const prevScrollTop = list?.scrollTop ?? 0;
    try {
      const loaded = await loadOlder();
      if (!loaded) return;
      requestAnimationFrame(() => {
        if (list) {
          list.scrollTop = prevScrollTop + (list.scrollHeight - prevScrollHeight);
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function onScroll() {
    const list = listRef.current;
    if (!list) return;
    // 바닥 근처(80px)에 있을 때만 새 메시지 오면 자동 스크롤
    stickToBottomRef.current =
      list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    // 위쪽 200px 안으로 올라오면 과거 로드
    if (list.scrollTop < 200) loadOlderKeepScroll();
  }

  async function send() {
    if (!client || !roomId || !draft.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      if (replyTo) {
        // 답장: m.in_reply_to 관계 + 구식 클라용 fallback 인용문 (스펙 권장)
        const orig = replyTo.getContent().body ?? "";
        const fallbackQuote = orig
          .split("\n")
          .map((l: string, i: number) =>
            i === 0 ? `> <${replyTo.getSender()}> ${l}` : `> ${l}`,
          )
          .join("\n");
        await client.sendEvent(roomId, EventType.RoomMessage, {
          msgtype: MsgType.Text,
          body: `${fallbackQuote}\n\n${draft}`,
          "m.relates_to": {
            "m.in_reply_to": { event_id: replyTo.getId()! },
          },
        });
        setReplyTo(null);
      } else {
        await client.sendTextMessage(roomId, draft);
      }
      setDraft("");
      clearTyping();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  /** 인용 박스 클릭 → 원문으로 스크롤 + 잠깐 강조.
   *  로드된 범위에 없으면 과거를 더 불러오며 시도 (최대 5페이지) */
  async function jumpTo(eventId: string) {
    for (let i = 0; i < 5; i++) {
      const el = document.getElementById(`ev-${eventId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightId(eventId);
        setTimeout(() => setHighlightId(null), 1600);
        return;
      }
      if (!hasMore) break;
      await loadOlderKeepScroll();
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
      <ConnectionBanner client={client} />
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
                  onReply={setReplyTo}
                  onJumpTo={jumpTo}
                  highlighted={highlightId === ev.getId()}
                />
              ) : null,
            )}
            <div ref={bottomRef} />
          </ul>
          {typingNames.length > 0 && (
            <p className="pb-1 text-xs text-gray-400">
              {typingNames.join(", ")}
              {typingNames.length === 1 ? "이(가)" : "들이"} 입력 중
              <span className="animate-pulse">...</span>
            </p>
          )}
          {error && <p className="pb-1 text-sm text-red-500">{error}</p>}
          {uploading && (
            <p className="pb-1 text-sm text-gray-500">{uploading}</p>
          )}
          {replyTo && (
            <div className="mb-1 flex items-center gap-2 rounded border-l-2 border-blue-400 bg-gray-100 px-2 py-1 text-xs dark:bg-gray-900">
              <span className="shrink-0 text-blue-500">↩ 답장:</span>
              <span className="min-w-0 flex-1 truncate text-gray-500">
                {replyTo.getSender()} — {replyTo.getContent().body ?? ""}
              </span>
              <button
                className="shrink-0 px-1 text-gray-400 hover:text-gray-600"
                onClick={() => setReplyTo(null)}
                title="답장 취소"
              >
                ✕
              </button>
            </div>
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
              onChange={(e) => {
                setDraft(e.target.value);
                if (e.target.value) notifyTyping();
              }}
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
