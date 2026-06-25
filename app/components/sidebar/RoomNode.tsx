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
  Thread,
  ThreadEvent,
} from "matrix-js-sdk";
import { memo, useEffect, useState } from "react";
import { Link } from "react-router";
import { roomPath, threadPath } from "../../lib/format";
import { useT } from "../../lib/i18n";
import {
  isFavourite,
  isMuted,
  toggleFavourite,
  toggleMute,
} from "../../lib/matrix";
import { quotePreview } from "../../lib/reply";
import { RoomAvatar } from "../Avatar";
import { RoomContextMenu } from "./RoomContextMenu";

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
  const [, force] = useState(0);
  // hasMoreThreads는 명시 state로 — fetchRoomThreads 완료 후, paginate 후
  // 매 시점에 동기화. SDK timelineSet이 처음 빈 배열이라 token 추출이
  // 첫 렌더 시 무조건 null인 문제도 회피.
  const [hasMoreThreads, setHasMoreThreads] = useState(false);
  const [loadingMoreThreads, setLoadingMoreThreads] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: syncHasMore는
  //   매 렌더 새 inline 함수 — deps에 넣으면 effect가 매 렌더마다 재발화돼
  //   ThreadEvent listener 무한 재등록 + fetchRoomThreads 폭주 → freeze 유발.
  //   syncHasMore는 클로저로 captured되어 최신 room.threadsTimelineSets만
  //   읽으므로 deps 누락해도 동작 정합 OK.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, active]);
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
  // 컨텍스트 메뉴 위치 (null=닫힘)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const unread = room.getUnreadNotificationCount(NotificationCountType.Total);
  const highlight = room.getUnreadNotificationCount(
    NotificationCountType.Highlight,
  );
  const fav = isFavourite(room);
  const muted = isMuted(client, room);

  // 스레드 정렬:
  //  - useTimelineSet=true 경로: /v1/rooms/{roomId}/threads 응답이 이미
  //    latest_event ts 내림차순(서버 보장). MSC3856 기본 정렬.
  //    timelineSet events는 backwards 응답을 prepend해 자연 reverse →
  //    역순(.reverse())으로 뒤집으면 최신이 위로. lastReply 기반 재정렬은
  //    하지 않음 — All/My 두 응답이 비동기로 도착하며 lastReply 갱신 시
  //    순서가 두 번 흔들리는 문제 회피.
  //  - getThreads() fallback 경로(MSC3856 미지원): SDK가 생성순으로 주니
  //    lastReply ts로 직접 정렬해서 최신 활동을 위로.
  const sortedThreads = useTimelineSet
    ? [...threads].reverse()
    : [...threads].sort((a, b) => {
        const tsA = a.lastReply()?.getTs() ?? a.rootEvent?.getTs() ?? 0;
        const tsB = b.lastReply()?.getTs() ?? b.rootEvent?.getTs() ?? 0;
        return tsB - tsA;
      });

  const showChildren = hasThreads && (expanded || active);

  async function onFav() {
    setMenu(null);
    try {
      await toggleFavourite(client, room);
      force((n) => n + 1);
    } catch (e) {
      console.warn("즐겨찾기 토글 실패:", e);
    }
  }
  async function onMute() {
    setMenu(null);
    try {
      await toggleMute(client, room);
      force((n) => n + 1);
    } catch (e) {
      console.warn("음소거 토글 실패:", e);
    }
  }

  return (
    <div>
      <div
        className={`tree-row group/row ${active && !activeThreadId ? "active" : ""}`}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        {/* Avatar 자리 — hasThreads면 hover 시 chevron overlay (Avatar 위에),
            클릭은 toggle. 평소엔 Avatar만 보임. */}
        <div className="relative flex shrink-0 items-center">
          <RoomAvatar
            client={client}
            room={room}
            size={16}
            showPresence={showPresence}
          />
          {hasThreads && (
            <button
              type="button"
              className="absolute inset-0 flex items-center justify-center bg-bg-2 text-fg-1 opacity-0 group-hover/row:opacity-100"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
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
      </div>
      {menu && (
        <RoomContextMenu
          x={menu.x}
          y={menu.y}
          fav={fav}
          muted={muted}
          onFav={onFav}
          onMute={onMute}
          onClose={() => setMenu(null)}
        />
      )}
      {showChildren && (
        <div className="tree-children">
          {sortedThreads.map((thread) => {
            const root = thread.rootEvent;
            const title = root ? quotePreview(root) : thread.id;
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
                <MessageSquareText className="h-3.5 w-3.5 shrink-0 text-fg-3" />
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
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 ${loadingMoreThreads ? "animate-pulse" : ""}`}
              />
              <span className="min-w-0 flex-1 truncate text-[12px]">
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
