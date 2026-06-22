import {
  Maximize2,
  MessageSquareText,
  Minimize2,
  Search,
  X,
} from "lucide-react";
import { EventType } from "matrix-js-sdk";
import { useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { DropZone } from "../components/DropZone";
import { MessageInput } from "../components/MessageInput";
import { PaneHeader, PaneHeaderButton } from "../components/PaneHeader";
import { SearchPane } from "../components/SearchPane";
import { Timeline, type TimelineHandle } from "../components/Timeline";
import { useReadReceipt } from "../hooks/useRoomTimeline";
import { useThreadTimeline } from "../hooks/useThreadTimeline";
import { buildMentionContent, type Mention } from "../lib/mention";
import { quotePreview } from "../lib/reply";
import { useRoomContext } from "./room";

export function meta() {
  return [{ title: "스레드 — matrix-client" }];
}

/** 스레드 페인 — 채팅 화면과 100% 동일한 구조 (헤더/타임라인/입력창).
 *  ?full=1이면 풀 화면(부모가 채팅 페인 숨김), 아니면 좌우 분할. */
export default function ThreadView() {
  const { client, room } = useRoomContext();
  const { roomId, threadId } = useParams<{
    roomId: string;
    threadId: string;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const full = searchParams.get("full") === "1";

  const { events, initialising, loadingOlder, loadOlder, hasMore } =
    useThreadTimeline(client, room, threadId!);
  useReadReceipt(client, events);
  const myUserId = client.getUserId() ?? "";
  const uploadRef = useRef<((files: File[]) => void) | null>(null);
  const timelineRef = useRef<TimelineHandle>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const rootEvent =
    room.findEventById(threadId!) ?? room.getThread(threadId!)?.rootEvent;
  const title = rootEvent ? quotePreview(rootEvent) : "스레드";
  const replyCount = room.getThread(threadId!)?.length ?? 0;

  async function sendReply(text: string, mentions: Mention[]) {
    // 멘션 유무와 무관하게 buildMentionContent로 통일 (마크다운 처리).
    await client.sendEvent(room.roomId, threadId!, EventType.RoomMessage, {
      ...buildMentionContent(text, mentions),
      "m.relates_to": {
        rel_type: "m.thread",
        event_id: threadId!,
        is_falling_back: true,
      },
    } as never);
  }

  function close() {
    navigate(`/room/${encodeURIComponent(roomId!)}`);
  }

  /** 검색 결과 클릭 → 해당 답글로 스크롤 + 잠깐 강조
   *  (로드 안 됐으면 과거 답글을 더 불러오며 시도, 최대 5페이지) */
  async function jumpTo(eventId: string) {
    for (let i = 0; i < 5; i++) {
      if (timelineRef.current?.scrollToEvent(eventId)) {
        setHighlightId(eventId);
        setTimeout(() => setHighlightId(null), 1600);
        return;
      }
      if (!hasMore) break;
      await loadOlder();
    }
  }

  return (
    <>
      <DropZone
        className={`flex min-w-0 flex-1 flex-col ${full ? "" : "border-l border-line"}`}
        label="스레드"
        onFiles={(files) => uploadRef.current?.(files)}
      >
        <PaneHeader
          actions={
            <>
              <PaneHeaderButton
                title="스레드에서 검색"
                onClick={() => setSearchOpen((v) => !v)}
              >
                <Search className="h-[15px] w-[15px]" />
              </PaneHeaderButton>
              <PaneHeaderButton
                title={full ? "분할 화면" : "전체 화면"}
                onClick={() =>
                  setSearchParams(full ? {} : { full: "1" }, { replace: true })
                }
              >
                {full ? (
                  <Minimize2 className="h-[15px] w-[15px]" />
                ) : (
                  <Maximize2 className="h-[15px] w-[15px]" />
                )}
              </PaneHeaderButton>
              <PaneHeaderButton title="닫기" onClick={close}>
                <X className="h-[15px] w-[15px]" />
              </PaneHeaderButton>
            </>
          }
        >
          <MessageSquareText className="h-[15px] w-[15px] shrink-0 text-fg-2" />
          <h1 className="truncate font-semibold text-fg-0">{title}</h1>
          {replyCount > 0 && (
            <span className="shrink-0 font-mono text-[11px] text-fg-3">
              답글 {replyCount}
            </span>
          )}
        </PaneHeader>

        {initialising ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="animate-pulse font-mono text-[12px] text-fg-3">
              스레드 불러오는 중…
            </span>
          </div>
        ) : (
          <Timeline
            ref={timelineRef}
            client={client}
            room={room}
            events={events}
            myUserId={myUserId}
            loadingOlder={loadingOlder}
            loadOlder={loadOlder}
            highlightId={highlightId}
          />
        )}

        <MessageInput
          client={client}
          room={room}
          placeholder="스레드에 답글 보내기…"
          onSend={sendReply}
          uploadRef={uploadRef}
          threadId={threadId}
        />
      </DropZone>
      {/* 스레드 검색 페인 — 로드된 답글에서 로컬 검색 */}
      {searchOpen && (
        <SearchPane
          client={client}
          room={room}
          events={events}
          hasMore={hasMore}
          loadOlder={loadOlder}
          onJump={jumpTo}
          onClose={() => setSearchOpen(false)}
          scope="thread"
        />
      )}
    </>
  );
}
