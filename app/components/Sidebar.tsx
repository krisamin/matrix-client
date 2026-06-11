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
import { getDmUserId, resetClient } from "../lib/matrix";
import { quotePreview } from "../lib/reply";
import { clearSession } from "../lib/session";
import { RoomAvatar } from "./Avatar";

/** 방 하나의 트리 노드 — 클릭 시 이동, 스레드 자식 노드 펼침 */
function RoomNode({
  client,
  room,
  active,
  activeThreadId,
}: {
  client: MatrixClient;
  room: Room;
  active: boolean;
  activeThreadId?: string;
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
          <RoomAvatar client={client} room={room} size={16} />
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

/** 좌측 사이드바: 유저 헤더(48px) + 방 트리 + sync 푸터(36px) */
export function Sidebar({ client }: { client: MatrixClient }) {
  const navigate = useNavigate();
  const params = useParams<{ roomId?: string; threadId?: string }>();
  const { rooms, invites, syncState } = useRooms(client);
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
  const userId = client.getUserId() ?? "";
  const localpart = userId.replace(/^@/, "").split(":")[0];

  const dms = rooms.filter((r) => getDmUserId(client, r));
  const groups = rooms.filter((r) => !getDmUserId(client, r));

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

  const renderSection = (label: string, list: Room[]) =>
    list.length > 0 && (
      <>
        <div className="mt-3 flex h-6 items-center px-2 first:mt-0">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-fg-3">
            {label}
          </span>
        </div>
        {list.map((room) => (
          <RoomNode
            key={room.roomId}
            client={client}
            room={room}
            active={params.roomId === room.roomId}
            activeThreadId={
              params.roomId === room.roomId ? params.threadId : undefined
            }
          />
        ))}
      </>
    );

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-bg-1">
      {/* 헤더: 48px */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
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
      <nav className="flex-1 select-none overflow-y-auto p-3">
        {invites.length > 0 && (
          <>
            <div className="flex h-6 items-center px-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-fg-3">
                Invites
              </span>
            </div>
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
        {renderSection("Direct", dms)}
        {renderSection("Rooms", groups)}
        {rooms.length === 0 && invites.length === 0 && (
          <p className="px-2 py-3 text-[11px] text-fg-3">
            동기화 중이거나 방이 없어...
          </p>
        )}
      </nav>

      {/* 푸터: 36px */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-line px-4 text-[11px] text-fg-3">
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
