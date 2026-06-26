import {
  ArrowLeft,
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
import { InlineSpinner } from "../components/InlineSpinner";
import { MessageInput } from "../components/MessageInput";
import { PaneHeader, PaneHeaderButton } from "../components/PaneHeader";
import { SearchPane } from "../components/SearchPane";
import { Timeline, type TimelineHandle } from "../components/Timeline";
import { useIsMobile } from "../hooks/useMediaQuery";
import { useReadReceipt } from "../hooks/useRoomTimeline";
import { useThreadTimeline } from "../hooks/useThreadTimeline";
import { roomPath } from "../lib/format";
import { useT } from "../lib/i18n";
import { buildMentionContent, type Mention } from "../lib/mention";
import { quotePreview } from "../lib/reply";
import { useRoomContext } from "./room";

export function meta() {
  return [{ title: "Thread — matrix-client" }];
}

/** 스레드 페인 — 채팅 화면과 100% 동일한 구조 (헤더/타임라인/입력창).
 *  ?full=1이면 풀 화면(부모가 채팅 페인 숨김), 아니면 좌우 분할. */
export default function ThreadView() {
  const t = useT();
  const { client, room } = useRoomContext();
  const { roomId, threadId } = useParams<{
    roomId: string;
    threadId: string;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const full = searchParams.get("full") === "1";
  const isMobile = useIsMobile();

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
  const title = rootEvent ? quotePreview(rootEvent) : t("thread.title");
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
    // 전송 직후 바닥 추적 — 룸 send()와 동일 패턴.
    requestAnimationFrame(() => timelineRef.current?.scrollToBottom());
  }

  /** 닫기/뒤로가기 — 진입 경로에 따라 목적지가 다르다.
   *  - full=1 (사이드바 트리에서 스레드 직접 진입): 채팅방을 거치지 않았으므로
   *    뒤로 = 룸 리스트(/)로. (모바일은 채팅방이 스택에 없음)
   *  - 분할 (채팅 메시지에서 스레드 열기): 뒤로 = 그 채팅방으로.
   *  데스크탑에선 분할이라 항상 채팅방이 곁에 있어 채팅방으로 닫는 게 자연스럽다. */
  function close() {
    if (isMobile && full) {
      navigate("/");
    } else {
      navigate(roomPath(roomId!));
    }
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
        className={`${searchOpen ? "hidden md:flex" : "flex"} min-w-0 flex-1 flex-col ${full ? "" : "md:border-l md:border-line"}`}
        label={t("page.thread")}
        onFiles={(files) => uploadRef.current?.(files)}
      >
        <PaneHeader
          leading={
            // 모바일: 좌측 뒤로가기 (우측 버튼들과 동일한 PaneHeaderButton 톤).
            // 데스크탑: 좌측 뒤로가기 없음(분할이라 채팅이 곁에 있음).
            isMobile ? (
              <PaneHeaderButton
                icon={ArrowLeft}
                title={t("common.back")}
                onClick={close}
              />
            ) : undefined
          }
          actions={
            <>
              <PaneHeaderButton
                icon={Search}
                title={t("thread.search")}
                onClick={() => setSearchOpen((v) => !v)}
              />
              {/* 분할/풀 토글 + 닫기 — 데스크탑 전용. 모바일은 항상 풀이고
                  뒤로가기(leading)로 닫으므로 숨긴다. */}
              {!isMobile && (
                <>
                  <PaneHeaderButton
                    icon={full ? Minimize2 : Maximize2}
                    title={t(full ? "thread.viewSplit" : "thread.viewFull")}
                    onClick={() =>
                      setSearchParams(full ? {} : { full: "1" }, {
                        replace: true,
                      })
                    }
                  />
                  <PaneHeaderButton
                    icon={X}
                    title={t("common.close")}
                    onClick={close}
                  />
                </>
              )}
            </>
          }
        >
          <MessageSquareText className="h-[15px] w-[15px] shrink-0 text-fg-2" />
          <h1 className="truncate font-semibold text-fg-0">{title}</h1>
          {replyCount > 0 && (
            <span className="shrink-0 font-mono text-[11px] text-fg-3">
              {t("thread.replies", { count: replyCount })}
            </span>
          )}
        </PaneHeader>

        {initialising ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="flex items-center gap-1.5 font-mono text-[12px] text-fg-3">
              <InlineSpinner size="sm" />
              {t("common.loading")}
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
          placeholder={t("input.placeholder.thread")}
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
