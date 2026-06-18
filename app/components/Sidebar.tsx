import {
  Check,
  ChevronDown,
  ChevronRight,
  LogOut,
  MessageSquareText,
  ShieldCheck,
  X,
} from "lucide-react";
import type { MatrixClient, Room } from "matrix-js-sdk";
import { NotificationCountType } from "matrix-js-sdk";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useRooms } from "../hooks/useRooms";
import { resetClient } from "../lib/matrix";
import { quotePreview } from "../lib/reply";
import { clearSession } from "../lib/session";
import { buildRoomTree, type SpaceNode } from "../lib/spaces";
import { RoomAvatar } from "./Avatar";

/** 방 하나의 트리 노드 — 클릭 시 이동, 스레드 자식 노드 펼침 */
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
  const unread = room.getUnreadNotificationCount(NotificationCountType.Total);
  const highlight = room.getUnreadNotificationCount(
    NotificationCountType.Highlight,
  );

  const showChildren = hasThreads && (expanded || active);

  return (
    <div>
      <div className={`tree-row ${active && !activeThreadId ? "active" : ""}`}>
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
            className={`min-w-0 flex-1 truncate ${unread > 0 ? "font-semibold text-fg-0" : ""}`}
          >
            {room.name}
          </span>
          {unread > 0 && (
            <span className={`badge ${highlight > 0 ? "badge-hl" : ""}`}>
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Link>
      </div>
      {showChildren && (
        <div className="tree-children">
          {threads.map((thread) => {
            const root = thread.rootEvent;
            const title = root ? quotePreview(root) : thread.id;
            return (
              <Link
                key={thread.id}
                to={`/room/${encodeURIComponent(room.roomId)}/thread/${encodeURIComponent(thread.id)}?full=1`}
                className={`tree-row ${activeThreadId === thread.id ? "active" : ""}`}
              >
                <MessageSquareText className="h-3.5 w-3.5 shrink-0 text-fg-3" />
                <span className="min-w-0 flex-1 truncate">{title}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Space 트리 노드 — 접을 수 있는 부모, 아래 하위 Space/방 재귀 렌더 */
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
  /** 이 Space 서브트리에 활성 방이 들어있는지 (있으면 자동 펼침 유지) */
  const containsActive = (n: SpaceNode): boolean =>
    n.rooms.some((r) => r.roomId === activeRoomId) ||
    n.children.some(containsActive);
  const [collapsed, setCollapsed] = useState(false);
  const expanded = !collapsed || containsActive(node);

  return (
    <div>
      <button
        type="button"
        className="tree-row"
        onClick={() => setCollapsed((v) => !v)}
        title={expanded ? "접기" : "펼치기"}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-fg-3" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-3" />
        )}
        <RoomAvatar client={client} room={node.space} size={16} />
        <span className="min-w-0 flex-1 truncate font-medium text-fg-0">
          {node.space.name}
        </span>
      </button>
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

/** 섹션 라벨 (Direct / Spaces / Rooms) */
function SectionLabel({ children }: { children: string }) {
  return (
    <div className="mt-3 flex h-6 items-center px-2 first:mt-0">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-fg-3">
        {children}
      </span>
    </div>
  );
}

/** 좌측 사이드바: 유저 헤더(48px) + 방 트리 + sync 푸터(36px) */
export function Sidebar({ client }: { client: MatrixClient }) {
  const navigate = useNavigate();
  const params = useParams<{ roomId?: string; threadId?: string }>();
  const { rooms, invites, syncState } = useRooms(client);
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
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
      {/* 헤더: 48px (PWA WCO 시 창 드래그 + 신호등 버튼 회피) */}
      <div className="app-titlebar app-titlebar-lead flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <Link to="/" className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate font-medium text-fg-0">{localpart}</span>
        </Link>
        <button
          type="button"
          className="rounded-md p-1.5 text-fg-2 hover:bg-bg-2 hover:text-fg-0"
          onClick={logout}
          title="로그아웃"
        >
          <LogOut className="h-[15px] w-[15px]" />
        </button>
      </div>

      {/* 트리 */}
      <nav className="flex-1 select-none overflow-y-auto p-2">
        {invites.length > 0 && (
          <>
            <SectionLabel>Invites</SectionLabel>
            {invites.map((room) => (
              <div key={room.roomId} className="tree-row">
                <span className="min-w-0 flex-1 truncate">{room.name}</span>
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-fg-2 hover:text-fg-0 disabled:opacity-50"
                  disabled={inviteBusy === room.roomId}
                  onClick={() => acceptInvite(room.roomId)}
                  title="수락"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 text-fg-2 hover:text-fg-0 disabled:opacity-50"
                  disabled={inviteBusy === room.roomId}
                  onClick={() => rejectInvite(room.roomId)}
                  title="거절"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </>
        )}
        {tree.dms.length > 0 && (
          <>
            <SectionLabel>Direct</SectionLabel>
            {renderRooms(tree.dms, true)}
          </>
        )}
        {tree.spaces.length > 0 && (
          <>
            <SectionLabel>Spaces</SectionLabel>
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
            <SectionLabel>Rooms</SectionLabel>
            {renderRooms(tree.orphanRooms)}
          </>
        )}
        {rooms.length === 0 && invites.length === 0 && (
          <p className="px-2 py-3 text-[12px] text-fg-3">대화가 없습니다</p>
        )}
      </nav>

      {/* 푸터: 36px */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-line px-4 text-[12px] text-fg-3">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            syncState === "SYNCING" || syncState === "PREPARED"
              ? "bg-emerald-600"
              : "bg-amber-600"
          }`}
        />
        {(syncState ?? "starting").toLowerCase()}
        <span className="ml-auto font-mono">E2EE</span>
        <ShieldCheck className="h-3.5 w-3.5" />
      </div>
    </aside>
  );
}
