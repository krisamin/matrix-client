import {
  BellOff,
  Check,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Hash,
  MessageSquareText,
  PenSquare,
  Plus,
  Settings,
  ShieldCheck,
  Star,
  X,
} from "lucide-react";
import type { MatrixClient, Room } from "matrix-js-sdk";
import { NotificationCountType } from "matrix-js-sdk";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useRooms } from "../hooks/useRooms";
import { useI18n } from "../lib/i18n";
import {
  isFavourite,
  isMuted,
  resetClient,
  toggleFavourite,
  toggleMute,
} from "../lib/matrix";
import { quotePreview } from "../lib/reply";
import { clearSession } from "../lib/session";
import { buildRoomTree, type SpaceNode } from "../lib/spaces";
import { AppSettingsModal } from "./AppSettingsModal";
import { RoomAvatar } from "./Avatar";
import { NewDmModal } from "./NewDmModal";
import { NewRoomModal } from "./NewRoomModal";
import { NewSpaceModal } from "./NewSpaceModal";
import { ProfileEditModal } from "./ProfileEditModal";

/** 방 하나의 트리 노드 — 클릭 시 이동, 스레드 자식 노드 펼침.
 *  우클릭 시 컨텍스트 메뉴(즐겨찾기/음소거 토글). */
function RoomNode({
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
  const threads = room.getThreads();
  const hasThreads = threads.length > 0;
  // 활성 방은 기본 펼침
  const [expanded, setExpanded] = useState(active);
  // 태그/푸시룰 변화 → 리렌더용 tick
  const [, force] = useState(0);
  // 컨텍스트 메뉴 위치 (null=닫힘)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const unread = room.getUnreadNotificationCount(NotificationCountType.Total);
  const highlight = room.getUnreadNotificationCount(
    NotificationCountType.Highlight,
  );
  const fav = isFavourite(room);
  const muted = isMuted(client, room);

  // 스레드 최신 활동순 정렬 — lastReply().ts(없으면 rootEvent.ts) 내림차순.
  // 새 스레드/답글이 오면 자연스럽게 맨 위로 올라오고, SDK 기본(생성순)을 덮어씀.
  const sortedThreads = [...threads].sort((a, b) => {
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
        className={`tree-row ${active && !activeThreadId ? "active" : ""}`}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        {hasThreads ? (
          <button
            type="button"
            className="shrink-0 text-fg-3 hover:text-fg-1"
            onClick={() => setExpanded((v) => !v)}
            title={showChildren ? "접기" : "펼치기"}
          >
            {showChildren ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="w-[14px] shrink-0" />
        )}
        <Link
          to={`/room/${encodeURIComponent(room.roomId)}`}
          className="flex min-w-0 flex-1 items-center gap-1.5"
        >
          <RoomAvatar
            client={client}
            room={room}
            size={16}
            showPresence={showPresence}
          />
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
                to={`/room/${encodeURIComponent(room.roomId)}/thread/${encodeURIComponent(thread.id)}?full=1`}
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
        </div>
      )}
    </div>
  );
}

/** 방 우클릭 컨텍스트 메뉴 — 커서 위치에 고정, 바깥 클릭/Esc로 닫힘 */
function RoomContextMenu({
  x,
  y,
  fav,
  muted,
  onFav,
  onMute,
  onClose,
}: {
  x: number;
  y: number;
  fav: boolean;
  muted: boolean;
  onFav: () => void;
  onMute: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // 다음 틱부터 바깥 클릭 감지 (현재 우클릭이 바로 닫지 않게)
    const id = setTimeout(() => window.addEventListener("click", close), 0);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(id);
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed z-50 flex min-w-[180px] flex-col divide-y divide-line overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
      role="presentation"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-fg-1 hover:bg-bg-2 hover:text-fg-0"
        onClick={onFav}
      >
        <Star
          className={`h-3.5 w-3.5 shrink-0 ${fav ? "fill-amber-400 text-amber-400" : "text-fg-3"}`}
        />
        {t(fav ? "sidebar.context.unfavorite" : "sidebar.context.favorite")}
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-fg-1 hover:bg-bg-2 hover:text-fg-0"
        onClick={onMute}
      >
        <BellOff className="h-3.5 w-3.5 shrink-0 text-fg-3" />
        {t(muted ? "sidebar.context.unmute" : "sidebar.context.mute")}
      </button>
    </div>
  );
}

/** Space 트리 노드 — 접을 수 있는 부모, 아래 하위 Space/방 재귀 렌더.
 *  chevron 클릭=펼치기/접기, 이름 클릭=Space 홈으로 이동 */
function SpaceTreeNode({
  client,
  node,
  activeRoomId,
  activeThreadId,
}: {
  client: MatrixClient;
  node: SpaceNode;
  activeRoomId?: string;
  activeThreadId?: string;
}) {
  const navigate = useNavigate();
  /** 이 Space 서브트리에 활성 방이 들어있는지 (있으면 자동 펼침 유지) */
  const containsActive = (n: SpaceNode): boolean =>
    n.rooms.some((r) => r.roomId === activeRoomId) ||
    n.children.some(containsActive);
  const [collapsed, setCollapsed] = useState(false);
  const expanded = !collapsed || containsActive(node);
  const active = activeRoomId === node.space.roomId;

  return (
    <div>
      <div className={`tree-row ${active ? "active" : ""}`}>
        <button
          type="button"
          className="shrink-0 text-fg-3 hover:text-fg-1"
          onClick={() => setCollapsed((v) => !v)}
          title={expanded ? "접기" : "펼치기"}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5"
          onClick={() =>
            navigate(`/room/${encodeURIComponent(node.space.roomId)}`)
          }
        >
          <RoomAvatar client={client} room={node.space} size={16} />
          <span className="min-w-0 flex-1 truncate text-left font-medium text-fg-0">
            {node.space.name}
          </span>
        </button>
      </div>
      {expanded && (
        <div className="tree-children">
          {node.children.map((child) => (
            <SpaceTreeNode
              key={child.space.roomId}
              client={client}
              node={child}
              activeRoomId={activeRoomId}
              activeThreadId={activeThreadId}
            />
          ))}
          {node.rooms.map((room) => (
            <RoomNode
              key={room.roomId}
              client={client}
              room={room}
              active={activeRoomId === room.roomId}
              activeThreadId={
                activeRoomId === room.roomId ? activeThreadId : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** 섹션 라벨 (Direct / Spaces / Rooms) — RoomInfoPane/SpaceView 카드 헤더 톤
 *  과 같은 패밀리로 (그래픽 uppercase 대신 일관된 한글 라벨 + 카운트). */
function SectionLabel({
  children,
  count,
}: {
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <div className="mt-3 flex items-center gap-1.5 px-3 pb-1 first:mt-0">
      <span className="text-[11px] font-medium text-fg-2">{children}</span>
      {typeof count === "number" && count > 0 && (
        <span className="font-mono text-[11px] text-fg-3">{count}</span>
      )}
    </div>
  );
}

/** 좌측 사이드바: 유저 헤더(48px) + 방 트리 + sync 푸터(36px) */
export function Sidebar({ client }: { client: MatrixClient }) {
  const navigate = useNavigate();
  const params = useParams<{ roomId?: string; threadId?: string }>();
  const { rooms, invites, syncState } = useRooms(client);
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [newRoomOpen, setNewRoomOpen] = useState(false);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const { t } = useI18n();
  const userId = client.getUserId() ?? "";
  const localpart = userId.replace(/^@/, "").split(":")[0];

  const tree = buildRoomTree(client, rooms);

  function logout() {
    resetClient();
    clearSession();
    window.location.href = "/login";
  }

  async function acceptInvite(roomId: string) {
    if (inviteBusy) return;
    setInviteBusy(roomId);
    try {
      await client.joinRoom(roomId);
      navigate(`/room/${encodeURIComponent(roomId)}`);
    } catch (e) {
      console.warn("초대 수락 실패:", e);
    } finally {
      setInviteBusy(null);
    }
  }

  async function rejectInvite(roomId: string) {
    if (inviteBusy) return;
    setInviteBusy(roomId);
    try {
      await client.leave(roomId);
    } catch (e) {
      console.warn("초대 거절 실패:", e);
    } finally {
      setInviteBusy(null);
    }
  }

  const renderRooms = (list: Room[], showPresence = false) =>
    list.map((room) => (
      <RoomNode
        key={room.roomId}
        client={client}
        room={room}
        active={params.roomId === room.roomId}
        activeThreadId={
          params.roomId === room.roomId ? params.threadId : undefined
        }
        showPresence={showPresence}
      />
    ));

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-bg-1">
      {/* 헤더: 48px (PWA WCO 시 창 드래그 + 신호등 버튼 회피).
          PaneHeader와 동일 톤 — 좌측 콘텐츠는 페인 좌측 padding 안에서 위아래 꽉,
          우측 버튼들은 정사각(aspect-square h-full)으로 헤더 우측 끝에 밀착. */}
      <div className="app-titlebar app-titlebar-lead flex h-12 shrink-0 items-center border-b border-line">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 self-stretch px-4 text-left hover:bg-bg-2"
          onClick={() => setProfileOpen(true)}
          title={t("sidebar.action.profile")}
        >
          <span className="truncate font-medium text-fg-0">{localpart}</span>
        </button>
        <div className="relative flex h-full">
          <button
            type="button"
            className="flex aspect-square h-full shrink-0 items-center justify-center text-fg-2 hover:bg-bg-2 hover:text-fg-0"
            onClick={() => setCreateMenuOpen((v) => !v)}
            title={t("sidebar.action.new")}
          >
            <Plus className="h-[15px] w-[15px]" />
          </button>
          {createMenuOpen && (
            <>
              {/* 바깥 클릭 닫기 */}
              <button
                type="button"
                aria-label="메뉴 닫기"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setCreateMenuOpen(false)}
              />
              <div className="absolute right-0 top-full z-20 mt-1 flex w-44 flex-col divide-y divide-line overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl">
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-fg-1 hover:bg-bg-2 hover:text-fg-0"
                  onClick={() => {
                    setCreateMenuOpen(false);
                    setNewDmOpen(true);
                  }}
                >
                  <PenSquare className="h-4 w-4 shrink-0 text-fg-3" />
                  {t("sidebar.create.dm")}
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-fg-1 hover:bg-bg-2 hover:text-fg-0"
                  onClick={() => {
                    setCreateMenuOpen(false);
                    setNewRoomOpen(true);
                  }}
                >
                  <Hash className="h-4 w-4 shrink-0 text-fg-3" />
                  {t("sidebar.create.room")}
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-fg-1 hover:bg-bg-2 hover:text-fg-0"
                  onClick={() => {
                    setCreateMenuOpen(false);
                    setNewSpaceOpen(true);
                  }}
                >
                  <FolderPlus className="h-4 w-4 shrink-0 text-fg-3" />
                  {t("sidebar.create.space")}
                </button>
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          className="flex aspect-square h-full shrink-0 items-center justify-center text-fg-2 hover:bg-bg-2 hover:text-fg-0"
          onClick={() => setAppSettingsOpen(true)}
          title={t("sidebar.action.settings")}
        >
          <Settings className="h-[15px] w-[15px]" />
        </button>
      </div>

      {/* 트리 */}
      <nav className="flex-1 select-none overflow-y-auto p-2">
        {invites.length > 0 && (
          <>
            <SectionLabel count={invites.length}>
              {t("sidebar.invites")}
            </SectionLabel>
            {invites.map((room) => (
              <div key={room.roomId} className="tree-row">
                <span className="min-w-0 flex-1 truncate text-[13px] text-fg-1">
                  {room.name}
                </span>
                <button
                  type="button"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-2 hover:bg-bg-3 hover:text-emerald-400 disabled:opacity-50"
                  disabled={inviteBusy === room.roomId}
                  onClick={() => acceptInvite(room.roomId)}
                  title={t("invite.accept")}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-2 hover:bg-bg-3 hover:text-red-400 disabled:opacity-50"
                  disabled={inviteBusy === room.roomId}
                  onClick={() => rejectInvite(room.roomId)}
                  title={t("invite.reject")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </>
        )}
        {tree.dms.length > 0 && (
          <>
            <SectionLabel count={tree.dms.length}>
              {t("sidebar.dms")}
            </SectionLabel>
            {renderRooms(tree.dms, true)}
          </>
        )}
        {tree.spaces.length > 0 && (
          <>
            <SectionLabel count={tree.spaces.length}>
              {t("sidebar.spaces")}
            </SectionLabel>
            {tree.spaces.map((node) => (
              <SpaceTreeNode
                key={node.space.roomId}
                client={client}
                node={node}
                activeRoomId={params.roomId}
                activeThreadId={params.threadId}
              />
            ))}
          </>
        )}
        {tree.orphanRooms.length > 0 && (
          <>
            <SectionLabel count={tree.orphanRooms.length}>
              {t("sidebar.rooms")}
            </SectionLabel>
            {renderRooms(tree.orphanRooms)}
          </>
        )}
        {rooms.length === 0 && invites.length === 0 && (
          <p className="px-3 py-6 text-center text-[12px] text-fg-3">
            {t("sidebar.empty")}
          </p>
        )}
      </nav>

      {/* 푸터: 36px — 좌측 sync 점·라벨, 우측 E2EE 배지 (헤더와 같은 px-5 인셋) */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-line px-5 text-[12px] text-fg-3">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            syncState === "SYNCING" || syncState === "PREPARED"
              ? "bg-emerald-600"
              : "bg-amber-600"
          }`}
        />
        <span className="font-mono">
          {(syncState ?? "starting").toLowerCase()}
        </span>
        <span className="ml-auto flex items-center gap-1 font-mono">
          <ShieldCheck className="h-3 w-3" />
          E2EE
        </span>
      </div>

      {newDmOpen && (
        <NewDmModal
          client={client}
          onClose={() => setNewDmOpen(false)}
          onStarted={(roomId) => {
            setNewDmOpen(false);
            navigate(`/room/${encodeURIComponent(roomId)}`);
          }}
        />
      )}
      {newRoomOpen && (
        <NewRoomModal
          client={client}
          onClose={() => setNewRoomOpen(false)}
          onCreated={(roomId) => {
            setNewRoomOpen(false);
            navigate(`/room/${encodeURIComponent(roomId)}`);
          }}
        />
      )}
      {newSpaceOpen && (
        <NewSpaceModal
          client={client}
          onClose={() => setNewSpaceOpen(false)}
          onCreated={() => {
            setNewSpaceOpen(false);
            // Space는 폴더라 따로 이동하지 않음 — 사이드바 트리에 자동 등장
          }}
        />
      )}
      {profileOpen && (
        <ProfileEditModal
          client={client}
          onClose={() => setProfileOpen(false)}
        />
      )}
      {appSettingsOpen && (
        <AppSettingsModal
          client={client}
          onClose={() => setAppSettingsOpen(false)}
          onLogout={logout}
        />
      )}
    </aside>
  );
}
