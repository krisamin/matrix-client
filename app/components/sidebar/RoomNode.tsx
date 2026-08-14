import {
  BellOff,
  ChevronDown,
  ChevronRight,
  MessageSquareText,
  Star,
} from "lucide-react";
import type { MatrixClient, Room } from "matrix-js-sdk";
import { NotificationCountType, RoomEvent } from "matrix-js-sdk";
import { memo, useEffect, useState } from "react";
import { Link } from "react-router";
import { useLongPress } from "../../hooks/useLongPress";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { useThreadSummaries } from "../../hooks/useThreadSummaries";
import { roomPath, threadPath } from "../../lib/format";
import { useT } from "../../lib/i18n";
import {
  isFavourite,
  isMuted,
  toggleFavourite,
  toggleMute,
} from "../../lib/matrix";
import { ActionMenu, type ActionMenuItem } from "../ActionMenu";
import { RoomAvatar } from "../Avatar";

/** 방 하나의 트리 노드 — 클릭 시 이동, 스레드 자식 노드 펼침.
 *  우클릭 시 컨텍스트 메뉴(즐겨찾기/음소거 토글). */
export const RoomNode = memo(function RoomNodeInner({
  client,
  room,
  active,
  activeThreadId,
  showPresence = false,
}: {
  client: MatrixClient;
  room: Room;
  active: boolean;
  activeThreadId?: string;
  showPresence?: boolean;
}) {
  const t = useT();
  const isMobile = useIsMobile();
  // 모바일에선 룸 아바타를 키워 가독성 ↑ (PC 16px / 모바일 22px)
  const avatarSize = isMobile ? 22 : 16;
  const [, force] = useState(0);

  // ★스레드 목록 = 요약 fetch 1건 (lib/thread-list.ts).
  //   예전엔 room.createThreadsTimelineSets() + room.fetchRoomThreads()로
  //   루트마다 SDK Thread를 만들었는데, Thread 생성자가 루트당
  //   /event/{id} + /relations/{id}를 호출해 방 진입 1회에 61 HTTP / ~2MB가
  //   나갔다(실측). 이제 /threads 한 번만 치고, 실제 Thread 객체는 사용자가
  //   스레드를 열 때 useThreadTimeline이 하나만 만든다.
  const {
    thread: threadSummary,
    hasMore: hasMoreThreads,
    loadingMore: loadingMoreThreads,
    loadMore: loadMoreThreads,
  } = useThreadSummaries(client, room, active);

  // 읽음 상태(안 읽음 카운트) 실시간 갱신 — 이 방의 Receipt / UnreadNotifications
  // 변화 시 force 리렌더. RoomNode는 memo라서 room 객체 참조가 그대로면(useRooms가
  // 정렬 배열만 새로 만들 뿐 room 인스턴스는 동일) 내부 unread count가 줄어도
  // 리렌더가 안 돼 사이드바 배지 숫자가 안 사라졌다. 방 진입 → receipt 전송 →
  // 여기서 잡아 즉시 배지 갱신.
  useEffect(() => {
    const bump = () => force((n) => n + 1);
    room.on(RoomEvent.Receipt, bump);
    room.on(RoomEvent.UnreadNotifications, bump);
    room.on(RoomEvent.Timeline, bump);
    return () => {
      room.off(RoomEvent.Receipt, bump);
      room.off(RoomEvent.UnreadNotifications, bump);
      room.off(RoomEvent.Timeline, bump);
    };
  }, [room]);
  const hasThreads = threadSummary.length > 0;
  // 활성 방은 기본 펼침
  const [expanded, setExpanded] = useState(active);

  // PC 우클릭 컨텍스트 메뉴 위치 (null=닫힘). 모바일 long-press는 sheetOpen로 분기.
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // 모바일 long-press 액션 바텀시트 열림 여부 — 같은 액션(fav/mute)을 시트로.
  const [sheetOpen, setSheetOpen] = useState(false);
  // isMobile은 위에서 이미 선언됨 (avatar/행 크기 분기용) — 재사용.
  // useLongPress: 데스크탑 우클릭은 onContextMenu(아래 JSX)에서 직접 처리하고,
  // 모바일 long-press는 여기서 시트 띄움. 텍스트 선택은 tree-row 안엔 없어서 검사 불필요.
  const longPress = useLongPress(() => {
    if (isMobile) setSheetOpen(true);
  });
  const closeMenus = () => {
    setMenu(null);
    setSheetOpen(false);
  };
  const unread = room.getUnreadNotificationCount(NotificationCountType.Total);
  const highlight = room.getUnreadNotificationCount(
    NotificationCountType.Highlight,
  );
  const fav = isFavourite(room);
  const muted = isMuted(client, room);

  // 스레드 정렬은 useThreadSummaries(mergeThreadSummaries)가 이미 수행한다:
  //  - 정렬 키 = 서버 /threads의 bundled latest_event.origin_server_ts,
  //    라이브 Thread가 있으면 그 replyToEvent ts와 큰 쪽.
  //  - 동률은 id tiebreak(안정 정렬) → All/My 응답이 비동기로 도착해도
  //    "오래된 스레드가 위로 튀는" 증상이 안 생긴다.
  //  - 예전엔 여기서 Thread 객체 배열을 정렬했는데, 그 배열을 만들려면
  //    루트마다 Thread를 생성해야 했다(= HTTP 2건씩). 상세는 lib/thread-list.ts.
  const sortedThreads = threadSummary;

  const showChildren = hasThreads && (expanded || active);

  async function onFav() {
    closeMenus();
    try {
      await toggleFavourite(client, room);
      force((n) => n + 1);
    } catch (e) {
      console.warn("즐겨찾기 토글 실패:", e);
    }
  }
  async function onMute() {
    closeMenus();
    try {
      await toggleMute(client, room);
      force((n) => n + 1);
    } catch (e) {
      console.warn("음소거 토글 실패:", e);
    }
  }

  // 공통 액션 목록 — PC 우클릭 메뉴와 모바일 long-press 시트가 같은 소스 공유.
  const actionList: ActionMenuItem[] = [
    {
      key: "fav",
      icon: Star,
      iconClassName: fav ? "fill-amber-400 text-amber-400" : "",
      label: t(fav ? "sidebar.context.unfavorite" : "sidebar.context.favorite"),
      onClick: onFav,
    },
    {
      key: "mute",
      icon: BellOff,
      label: t(muted ? "sidebar.context.unmute" : "sidebar.context.mute"),
      onClick: onMute,
    },
  ];

  return (
    <div>
      <div
        className={`tree-row group/row ${active && !activeThreadId ? "active" : ""}`}
        {...longPress}
        onContextMenu={(e) => {
          // PC 우클릭만 메뉴 — 모바일은 useLongPress의 onContextMenu가 호출되지만
          // isMobile 가드로 무시되고, 여기서도 모바일이면 안전하게 패스.
          e.preventDefault();
          if (!isMobile) setMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        <div className="flex shrink-0 items-center">
          <RoomAvatar
            client={client}
            room={room}
            size={avatarSize}
            showPresence={showPresence}
          />
        </div>
        <Link
          to={roomPath(room.roomId)}
          className="flex min-w-0 flex-1 items-center gap-1.5"
        >
          <span
            className={`min-w-0 flex-1 truncate ${unread > 0 && !muted ? "font-semibold text-fg-0" : ""}`}
          >
            {room.name}
          </span>
          {fav && (
            <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
          )}
          {muted && <BellOff className="h-3 w-3 shrink-0 text-fg-3" />}
          {unread > 0 && (
            <span
              className={`badge ${highlight > 0 && !muted ? "badge-hl" : ""} ${muted ? "opacity-40" : ""}`}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Link>
        {/* 우측 펼침 chevron — 데스크탑/모바일 공통. hasThreads일 때만 표시.
            높이는 avatar(16px)와 맞춰 행이 커지지 않게. 터치 hit은 -m으로 확장. */}
        {hasThreads && (
          <button
            type="button"
            className="flex h-4 w-4 shrink-0 items-center justify-center text-fg-2 hover:text-fg-0"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            aria-label={t(showChildren ? "common.collapse" : "common.expand")}
            title={t(showChildren ? "common.collapse" : "common.expand")}
          >
            {showChildren ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        )}
      </div>
      {/* PC 우클릭 메뉴 + 모바일 long-press 시트 — ActionMenu가 둘 다 처리.
          createPortal + 같은 톤(divide-y + fg-1 + 아이콘 fg-3) + viewport 탈출. */}
      <ActionMenu
        items={actionList}
        sheetOpen={sheetOpen}
        onCloseSheet={closeMenus}
        menuAt={menu}
        onCloseMenu={() => setMenu(null)}
        minWidth={180}
      />
      {showChildren && (
        <div className="tree-children">
          {sortedThreads.map((thread) => {
            // 미리보기는 요약 fetch 시점에 (필요하면 복호화까지) 만들어 둔다.
            // 빈 값이면 미디어/암호화 실패 등 → 'Thread' 라벨 fallback.
            const title = thread.preview || t("thread.untitled");
            // 스레드별 안 읽음 카운트 (SDK 공식 API).
            const tUnread = room.getThreadUnreadNotificationCount(
              thread.id,
              NotificationCountType.Total,
            );
            const tHighlight = room.getThreadUnreadNotificationCount(
              thread.id,
              NotificationCountType.Highlight,
            );
            return (
              <Link
                key={thread.id}
                to={threadPath(room.roomId, thread.id, true)}
                className={`tree-row ${activeThreadId === thread.id ? "active" : ""}`}
              >
                <span
                  className="flex shrink-0 items-center justify-center"
                  style={{ width: avatarSize, height: avatarSize }}
                >
                  <MessageSquareText
                    className="text-fg-3"
                    style={{
                      width: avatarSize * 0.78,
                      height: avatarSize * 0.78,
                    }}
                  />
                </span>
                <span
                  className={`min-w-0 flex-1 truncate ${tUnread > 0 && !muted ? "font-semibold text-fg-0" : ""}`}
                >
                  {title}
                </span>
                {tUnread > 0 && (
                  <span
                    className={`badge ${tHighlight > 0 && !muted ? "badge-hl" : ""} ${muted ? "opacity-40" : ""}`}
                  >
                    {tUnread > 99 ? "99+" : tUnread}
                  </span>
                )}
              </Link>
            );
          })}
          {hasMoreThreads && (
            <button
              type="button"
              onClick={loadMoreThreads}
              disabled={loadingMoreThreads}
              className="tree-row text-fg-3 hover:text-fg-1 disabled:opacity-50"
            >
              <span
                className="flex shrink-0 items-center justify-center"
                style={{ width: avatarSize, height: avatarSize }}
              >
                <ChevronDown
                  className={loadingMoreThreads ? "animate-pulse" : ""}
                  style={{
                    width: avatarSize * 0.78,
                    height: avatarSize * 0.78,
                  }}
                />
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] max-md:text-[14px]">
                {loadingMoreThreads
                  ? t("thread.loading")
                  : t("thread.loadMore")}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
});
