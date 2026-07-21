import {
  BellOff,
  ChevronDown,
  ChevronRight,
  MessageSquareText,
  Star,
} from "lucide-react";
import type { MatrixClient, Room } from "matrix-js-sdk";
import {
  EventTimeline,
  FeatureSupport,
  NotificationCountType,
  RoomEvent,
  Thread,
  ThreadEvent,
} from "matrix-js-sdk";
import { memo, useEffect, useState } from "react";
import { Link } from "react-router";
import { useLongPress } from "../../hooks/useLongPress";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { roomPath, threadPath } from "../../lib/format";
import { useT } from "../../lib/i18n";
import {
  isFavourite,
  isMuted,
  toggleFavourite,
  toggleMute,
} from "../../lib/matrix";
import { quotePreview } from "../../lib/reply";
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
  // hasMoreThreads는 명시 state로 — fetchRoomThreads 완료 후, paginate 후
  // 매 시점에 동기화. SDK timelineSet이 처음 빈 배열이라 token 추출이
  // 첫 렌더 시 무조건 null인 문제도 회피.
  const [hasMoreThreads, setHasMoreThreads] = useState(false);
  const [loadingMoreThreads, setLoadingMoreThreads] = useState(false);

  function syncHasMore() {
    const tl = room.threadsTimelineSets[0]?.getLiveTimeline();
    setHasMoreThreads(!!tl?.getPaginationToken(EventTimeline.BACKWARDS));
  }

  // 방 mount 시 1회 — threadsTimelineSets 초기화 + 서버 thread 목록 fetch.
  // 1) createThreadsTimelineSets(): SDK가 자동 호출 안 함. threadSupport
  //    옵션이 켜진 client에서 timelineSets[0/1] 빈 EventTimelineSet 생성.
  // 2) fetchRoomThreads(): /v1/rooms/{roomId}/threads (MSC3856) 또는
  //    /messages 필터로 thread root 목록 받아 timelineSet에 채움.
  //
  // ★ active 방에서만 발사. 방 100개 사이드바면 100개 RoomNode가 동시
  // mount되는데, 각각 fetch 발사하면 서버에 100 req + 메인 스레드 폭주
  // → 사이드바 클릭 시 "응답없음" 유발. active일 때만 하면 사용자가 보는
  // 방의 thread만 즉시 채워지고 나머지는 클릭 시점에 fetch.
  // biome-ignore lint/correctness/useExhaustiveDependencies: syncHasMore는 매 렌더 새 inline 함수 — deps 누락이 의도(ThreadEvent listener 무한 재등록 방지)
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      try {
        await room.createThreadsTimelineSets();
        if (cancelled) return;
        await room.fetchRoomThreads();
      } catch {
        // 실패해도 timeline에 있는 thread는 그대로 보이니 무시
      }
      if (cancelled) return;
      syncHasMore();
      force((n) => n + 1);
    })();
    // 새 thread / 답글 / 삭제 시 리렌더 + hasMore 재평가 (active 방만 구독)
    const bump = () => {
      if (cancelled) return;
      syncHasMore();
      force((n) => n + 1);
    };
    room.on(ThreadEvent.New, bump);
    room.on(ThreadEvent.Update, bump);
    room.on(ThreadEvent.NewReply, bump);
    room.on(ThreadEvent.Delete, bump);
    return () => {
      cancelled = true;
      room.off(ThreadEvent.New, bump);
      room.off(ThreadEvent.Update, bump);
      room.off(ThreadEvent.NewReply, bump);
      room.off(ThreadEvent.Delete, bump);
    };
  }, [room, active]);

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
  // Thread 리스트 source 분기:
  //  - 서버가 MSC3856 (/v1/rooms/{roomId}/threads) 지원 → threadsTimelineSets
  //    [0]만 표시 (Element와 동일, 옛 메시지 스크롤로 thread가 임의 추가
  //    되지 않음).
  //  - 미지원 → fallback: room.getThreads() 그대로 (메인 timeline 발견 포함).
  //    이 경로에선 옛 thread가 스크롤할 때마다 추가될 수 있지만 서버가
  //    지원 안 하니 다른 방법 없음.
  const useTimelineSet =
    Thread.hasServerSideListSupport === FeatureSupport.Stable ||
    Thread.hasServerSideListSupport === FeatureSupport.Experimental;
  const threads = useTimelineSet
    ? (room.threadsTimelineSets[0]?.getLiveTimeline().getEvents() ?? [])
        .map((ev) => room.getThread(ev.getId() ?? ""))
        .filter((th): th is NonNullable<typeof th> => !!th)
    : room.getThreads();
  const hasThreads = threads.length > 0;
  // 활성 방은 기본 펼침
  const [expanded, setExpanded] = useState(active);

  async function loadMoreThreads() {
    if (loadingMoreThreads) return;
    setLoadingMoreThreads(true);
    try {
      // 두 timelineSet(All/My) 둘 다 한 페이지씩 — SDK 기본 limit=30씩 추가
      await Promise.all(
        room.threadsTimelineSets
          .map((ts) => ts.getLiveTimeline())
          .filter((tl): tl is NonNullable<typeof tl> => !!tl)
          .filter((tl) => tl.getPaginationToken(EventTimeline.BACKWARDS))
          .map((tl) => client.paginateEventTimeline(tl, { backwards: true })),
      );
      syncHasMore();
      force((n) => n + 1);
    } catch {
      // 실패해도 기존 목록은 유지
    } finally {
      setLoadingMoreThreads(false);
    }
  }
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

  // 스레드 정렬: 두 경로 모두 lastReply(없으면 root) ts 내림차순 안정 정렬.
  //  - 과거엔 useTimelineSet 경로를 [...].reverse()로만 처리했는데,
  //    threadsTimelineSets[0]의 events 순서는 서버 초기 응답 이후 SDK가
  //    수시로 재배치한다: Room.onThreadReply → updateThreadRootEvents(recreate=true)
  //    가 timelineSet.removeEvent(rootId) 후 addLiveEvent로 "라이브 끝"에
  //    재삽입한다. 초기 fetch 완료(initialEventsFetched=true 전환 시 replayEvents
  //    flush → NewReply emit)나 gappy sync 복구 때도 발동하는데, 발동 순서 =
  //    네트워크 응답 순서라 예측 불가 → 서버가 준 latest_event desc 정렬이
  //    깨지고 "오래된 스레드가 위로 튀는" 증상(사이드바)이 생겼다.
  //  - 재배치 후에도 각 Thread.lastReply()는 항상 실제 최신 답글을 가리키므로
  //    이걸 정렬 키로 쓰면 배열 순서와 무관하게 항상 최신-위 정렬이 보장된다.
  //  - 동률(같은 ts)일 때 thread.id로 tiebreak → All/My 두 응답이 비동기로
  //    도착해 lastReply가 갱신돼도 순서가 흔들리지 않는(안정) 정렬.
  const sortedThreads = [...threads].sort((a, b) => {
    const tsA = a.lastReply()?.getTs() ?? a.rootEvent?.getTs() ?? 0;
    const tsB = b.lastReply()?.getTs() ?? b.rootEvent?.getTs() ?? 0;
    if (tsB !== tsA) return tsB - tsA;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

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
            const root = thread.rootEvent;
            const preview = root ? quotePreview(root) : "";
            // 빈 미리보기(미디어/encrypted/공백 등) fallback — 'Thread' 라벨
            const title = preview.trim() || t("thread.untitled");
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
