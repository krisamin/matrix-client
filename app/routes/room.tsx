import { Lock, Search, Users } from "lucide-react";
import {
  EventType,
  type MatrixClient,
  type MatrixEvent,
  type Room,
} from "matrix-js-sdk";
import { useCallback, useRef, useState } from "react";
import {
  Outlet,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router";
import { RoomAvatar } from "../components/Avatar";
import { DropZone } from "../components/DropZone";
import { MessageInput } from "../components/MessageInput";
import { PaneHeader, PaneHeaderButton } from "../components/PaneHeader";
import { PinnedBanner } from "../components/PinnedBanner";
import { RoomInfoPane } from "../components/RoomInfoPane";
import { SearchPane } from "../components/SearchPane";
import { SpaceView } from "../components/SpaceView";
import { Timeline, type TimelineHandle } from "../components/Timeline";
import {
  useReadReceipt,
  useRoomTimeline,
  useUnreadMarker,
} from "../hooks/useRoomTimeline";
import { buildMentionContent, type Mention } from "../lib/mention";
import { useAppContext } from "./app-layout";

export function meta() {
  return [{ title: "matrix-client" }];
}

export interface RoomContext {
  client: MatrixClient;
  room: Room;
}

/** 자식 라우트(스레드)에서 client/room 접근용 */
export function useRoomContext(): RoomContext {
  return useOutletContext<RoomContext>();
}

/** 방 화면 — 채팅 페인 + (스레드 라우트 활성 시) 분할/풀 스레드 페인.
 *  - /room/:roomId               → 채팅만
 *  - /room/:roomId/thread/:tid   → 채팅 | 스레드 분할
 *  - + ?full=1                   → 스레드 풀 화면 (트리에서 진입) */
export default function RoomView() {
  const { client } = useAppContext();
  const { roomId, threadId } = useParams<{
    roomId: string;
    threadId?: string;
  }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { room, events, hasMore, loadingOlder, loadOlder } = useRoomTimeline(
    client,
    roomId!,
  );
  const myUserId = client.getUserId() ?? "";
  // 진입 시점 읽음 위치 캡처 — useReadReceipt가 receipt를 밀어버리기 전에
  const unreadMarkerId = useUnreadMarker(room, myUserId);
  useReadReceipt(client, events);

  const [replyTo, setReplyTo] = useState<MatrixEvent | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // 우측 패널: 검색/방정보 상호 배타 (둘 다 열리면 좁아져서)
  const [sidePane, setSidePane] = useState<"search" | "info" | null>(null);
  // 드롭존 → MessageInput.sendFiles 브리지 (업로드 진행/에러 UI 재사용)
  const uploadRef = useRef<((files: File[]) => void) | null>(null);
  // 가상 스크롤 타임라인 명령형 핸들 (점프용 — DOM 존재 무관 인덱스 스크롤)
  const timelineRef = useRef<TimelineHandle>(null);

  const threadFull = threadId != null && searchParams.get("full") === "1";

  /** 인용 박스 클릭 → 원문으로 스크롤 + 잠깐 강조.
   *  로드된 범위에 없으면 과거를 더 불러오며 시도 (최대 5페이지).
   *  가상 스크롤이라 DOM 유무와 무관하게 인덱스 기반(timelineRef)으로 스크롤.
   *  useCallback: EventLine memo가 깨지지 않도록 안정 참조 유지.
   *  (훅 규칙 — 아래 `if (!room)` 조기 반환보다 위에 있어야 함) */
  const jumpTo = useCallback(
    async (eventId: string) => {
      for (let i = 0; i < 5; i++) {
        if (timelineRef.current?.scrollToEvent(eventId)) {
          setHighlightId(eventId);
          setTimeout(() => setHighlightId(null), 1600);
          return;
        }
        if (!hasMore) break;
        await loadOlder();
      }
    },
    [hasMore, loadOlder],
  );

  const openThread = useCallback(
    (rootId: string) => {
      navigate(
        `/room/${encodeURIComponent(roomId!)}/thread/${encodeURIComponent(rootId)}`,
      );
    },
    [navigate, roomId],
  );

  if (!room) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="animate-pulse font-mono text-[12px] text-fg-3">
          loading…
        </span>
      </div>
    );
  }

  // Space room이면 타임라인 대신 Space 홈(방 목록/설명)을 보여준다.
  // (Space는 메시지 방이 아니라 폴더 — 타임라인 렌더 시 빈 화면이 됨)
  // app-pane-row 래퍼로 감싸야 우상단 OS 창 컨트롤(신호등 등) 영역을 비켜
  // PaneHeader actions(⚙ 설정)이 가려지지 않는다.
  if (room.isSpaceRoom()) {
    return (
      <div className="app-pane-row flex min-h-0 min-w-0 flex-1">
        <SpaceView client={client} space={room} />
      </div>
    );
  }

  async function send(text: string, mentions: Mention[]) {
    if (replyTo) {
      // 답장: m.in_reply_to 관계 + 구식 클라용 fallback 인용문 (스펙 권장).
      // buildMentionContent가 마크다운+멘션을 모두 처리해 formatted_body를 만든다.
      const orig = replyTo.getContent().body ?? "";
      const fallbackQuote = orig
        .split("\n")
        .map((l: string, i: number) =>
          i === 0 ? `> <${replyTo.getSender()}> ${l}` : `> ${l}`,
        )
        .join("\n");
      await client.sendEvent(roomId!, EventType.RoomMessage, {
        ...buildMentionContent(text, mentions),
        body: `${fallbackQuote}\n\n${text}`,
        "m.relates_to": {
          "m.in_reply_to": { event_id: replyTo.getId()! },
        },
      } as never);
      setReplyTo(null);
    } else {
      // 일반 전송 — 멘션 유무와 무관하게 buildMentionContent 사용 (마크다운 처리).
      await client.sendEvent(
        roomId!,
        EventType.RoomMessage,
        buildMentionContent(text, mentions) as never,
      );
    }
  }

  return (
    <div className="app-pane-row flex min-h-0 min-w-0 flex-1">
      {/* 채팅 페인 — 스레드 풀 화면일 땐 숨김 */}
      {!threadFull && (
        <DropZone
          className="flex min-w-0 flex-1 flex-col"
          label={room.name}
          onFiles={(files) => uploadRef.current?.(files)}
        >
          <PaneHeader
            actions={
              <>
                <PaneHeaderButton
                  title="메시지 검색"
                  onClick={() =>
                    setSidePane((v) => (v === "search" ? null : "search"))
                  }
                >
                  <Search className="h-[15px] w-[15px]" />
                </PaneHeaderButton>
                <PaneHeaderButton
                  title={`멤버 ${room.getJoinedMemberCount()}명`}
                  onClick={() =>
                    setSidePane((v) => (v === "info" ? null : "info"))
                  }
                >
                  <Users className="h-[15px] w-[15px]" />
                </PaneHeaderButton>
              </>
            }
          >
            <RoomAvatar client={client} room={room} size={20} showPresence />
            <h1 className="truncate font-semibold text-fg-0">{room.name}</h1>
            {room.hasEncryptionStateEvent() && (
              <Lock className="h-3.5 w-3.5 shrink-0 text-fg-3" />
            )}
          </PaneHeader>
          <PinnedBanner client={client} room={room} onJumpTo={jumpTo} />
          <Timeline
            ref={timelineRef}
            client={client}
            room={room}
            events={events}
            myUserId={myUserId}
            loadingOlder={loadingOlder}
            hasMore={hasMore}
            loadOlder={loadOlder}
            onOpenThread={openThread}
            onReply={setReplyTo}
            highlightId={highlightId}
            onJumpTo={jumpTo}
            unreadMarkerId={unreadMarkerId}
          />
          <MessageInput
            client={client}
            room={room}
            placeholder={`${room.name}에 메시지 보내기…`}
            onSend={send}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            uploadRef={uploadRef}
          />
        </DropZone>
      )}
      {/* 검색 페인 (우측 분할) — 스레드 풀 화면일 땐 숨김 */}
      {!threadFull && sidePane === "search" && (
        <SearchPane
          client={client}
          room={room}
          events={events}
          hasMore={hasMore}
          loadOlder={loadOlder}
          onJump={jumpTo}
          onClose={() => setSidePane(null)}
        />
      )}
      {/* 방 정보 패널 */}
      {!threadFull && sidePane === "info" && (
        <RoomInfoPane
          client={client}
          room={room}
          onClose={() => setSidePane(null)}
          onLeft={() => navigate("/")}
        />
      )}
      {/* 스레드 페인 (자식 라우트) */}
      <Outlet context={{ client, room } satisfies RoomContext} />
    </div>
  );
}
