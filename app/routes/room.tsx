import { ArrowLeft, Lock, Search, Users } from "lucide-react";
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
import { LoadingPane } from "../components/LoadingPane";
import { MessageInput } from "../components/MessageInput";
import { PaneHeader, PaneHeaderButton } from "../components/PaneHeader";
import { PinnedBanner } from "../components/PinnedBanner";
import { RoomInfoPane } from "../components/RoomInfoPane";
import { SearchPane } from "../components/SearchPane";
import { SpaceView } from "../components/SpaceView";
import { Timeline, type TimelineHandle } from "../components/Timeline";
import { useJumpToEvent } from "../hooks/useJumpToEvent";
import { useIsMobile } from "../hooks/useMediaQuery";
import {
  useReadReceipt,
  useRoomTimeline,
  useUnreadMarker,
} from "../hooks/useRoomTimeline";
import { threadPath } from "../lib/format";
import { useT } from "../lib/i18n";
import type { Mention } from "../lib/mention";
import { buildSendContent } from "../lib/reply";
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
  const t = useT();
  const { client } = useAppContext();
  const { roomId, threadId } = useParams<{
    roomId: string;
    threadId?: string;
  }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { room, events, hasMore, loadingOlder, loadOlder } = useRoomTimeline(
    client,
    roomId!,
  );
  const myUserId = client.getUserId() ?? "";
  // 진입 시점 읽음 위치 캡처 — useReadReceipt가 receipt를 밀어버리기 전에
  const unreadMarkerId = useUnreadMarker(room, myUserId);
  useReadReceipt(client, events);

  const [replyTo, setReplyTo] = useState<MatrixEvent | null>(null);
  // 우측 패널: 검색/방정보 상호 배타 (둘 다 열리면 좁아져서)
  const [sidePane, setSidePane] = useState<"search" | "info" | null>(null);
  // 드롭존 → MessageInput.sendFiles 브리지 (업로드 진행/에러 UI 재사용)
  const uploadRef = useRef<((files: File[]) => void) | null>(null);
  // 가상 스크롤 타임라인 명령형 핸들 (점프용 — DOM 존재 무관 인덱스 스크롤)
  const timelineRef = useRef<TimelineHandle>(null);
  // 인용/검색 클릭 → 원문 스크롤 + 강조 (룸/스레드 공용 훅)
  const { highlightId, jumpTo } = useJumpToEvent(
    timelineRef,
    hasMore,
    loadOlder,
  );

  const threadFull = threadId != null && searchParams.get("full") === "1";

  /** 모바일에서 스레드가 열려있을 때 채팅 페인을 숨길지 여부.
   *  좁은 화면에선 분할이 불가능 → 스레드만 풀폭으로 보여준다. CSS 미디어 쿼리로
   *  처리해 데스크탑 결은 완전히 그대로(분할 유지). */
  const threadOpen = threadId != null;

  const openThread = useCallback(
    (rootId: string) => {
      navigate(threadPath(roomId!, rootId));
    },
    [navigate, roomId],
  );

  if (!room) {
    return <LoadingPane />;
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
    // 답장/일반 전송 모두 buildSendContent로 통일 (멘션·마크다운·인용 관계).
    await client.sendEvent(
      roomId!,
      EventType.RoomMessage,
      buildSendContent({ text, mentions, replyTo }) as never,
    );
    if (replyTo) setReplyTo(null);
    // 전송 직후 무조건 바닥으로 — 위로 올라가있어도 내 메시지는 따라간다.
    // local echo로 즉시 events에 추가되니 다음 rAF에 마지막 행 인덱스가 잡힘.
    requestAnimationFrame(() => timelineRef.current?.scrollToBottom());
  }

  return (
    <div className="app-pane-row flex min-h-0 min-w-0 flex-1">
      {/* 채팅 페인 — 스레드 풀 화면(데스크탑) 또는 스레드 열림(모바일)이면 숨김 */}
      {!threadFull && (
        <DropZone
          className={`${threadOpen || sidePane ? "hidden md:flex" : "flex"} min-w-0 flex-1 flex-col`}
          label={room.name}
          onFiles={(files) => uploadRef.current?.(files)}
        >
          <PaneHeader
            leading={
              // 모바일 뒤로가기 — 룸 리스트(/)로. 우측 액션 버튼과 동일한 톤.
              // 데스크탑은 사이드바가 항상 보여 필요 없음.
              isMobile ? (
                <PaneHeaderButton
                  icon={ArrowLeft}
                  title={t("common.back")}
                  onClick={() => navigate("/")}
                />
              ) : undefined
            }
            actions={
              <>
                <PaneHeaderButton
                  icon={Search}
                  title="메시지 검색"
                  onClick={() =>
                    setSidePane((v) => (v === "search" ? null : "search"))
                  }
                />
                <PaneHeaderButton
                  icon={Users}
                  title={`멤버 ${room.getJoinedMemberCount()}명`}
                  onClick={() =>
                    setSidePane((v) => (v === "info" ? null : "info"))
                  }
                />
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
            placeholder={t("input.placeholder.send", { room: room.name })}
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
