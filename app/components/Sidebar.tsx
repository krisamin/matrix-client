import {
  ArrowUpDown,
  CalendarClock,
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
  X,
} from "lucide-react";
import type { MatrixClient, Room } from "matrix-js-sdk";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useRooms } from "../hooks/useRooms";
import { roomPath } from "../lib/format";
import { useI18n, useT } from "../lib/i18n";
import { getMyProfile, type MyProfile, resetClient } from "../lib/matrix";
import { saveRoomSort } from "../lib/room-sort";
import { clearSession } from "../lib/session";
import { buildRoomTree, type SpaceNode } from "../lib/spaces";
import { AppSettingsModal } from "./AppSettingsModal";
import { Avatar, RoomAvatar } from "./Avatar";
import { DelayedMessagesModal } from "./DelayedMessagesModal";
import { EmptyState } from "./EmptyState";
import { IconButton } from "./IconButton";
import { NewDmModal } from "./NewDmModal";
import { NewRoomModal } from "./NewRoomModal";
import { NewSpaceModal } from "./NewSpaceModal";
import { ProfileEditModal } from "./ProfileEditModal";
import { RoomNode } from "./sidebar/RoomNode";
import { SectionLabel } from "./sidebar/SectionLabel";
import { SpaceTreeNode } from "./sidebar/SpaceTreeNode";

/** 좌측 사이드바: 유저 헤더(48px) + 방 트리 + sync 푸터(36px) */
export function Sidebar({ client }: { client: MatrixClient }) {
  const navigate = useNavigate();
  const params = useParams<{ roomId?: string; threadId?: string }>();
  const { rooms, invites, syncState, sort, setSort } = useRooms(client);
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [newRoomOpen, setNewRoomOpen] = useState(false);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [delayedOpen, setDelayedOpen] = useState(false);
  const { t } = useI18n();
  const userId = client.getUserId() ?? "";
  const localpart = userId.replace(/^@/, "").split(":")[0];
  // 내 프로필 (avatar + displayName) — mount 시 1회 fetch. 부정확해도 fallback OK.
  const [profile, setProfile] = useState<MyProfile>({ displayName: "" });
  useEffect(() => {
    let cancelled = false;
    getMyProfile(client).then((p) => {
      if (!cancelled) setProfile(p);
    });
    return () => {
      cancelled = true;
    };
  }, [client]);
  const displayName = profile.displayName || localpart;

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
      navigate(roomPath(roomId));
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
    <aside className="flex h-full flex-col">
      {/* 헤더: 48px (PWA WCO 시 창 드래그 + 신호등 버튼 회피).
          액션 버튼만 — 사용자명/설정은 푸터로 분리해 truncate 여유 확보. */}
      <div className="app-titlebar app-titlebar-lead flex h-12 shrink-0 items-center justify-end border-b border-line">
        <div className="relative flex h-full">
          <IconButton
            icon={ArrowUpDown}
            onClick={() => setSortMenuOpen((v) => !v)}
            title={t("sort.title")}
            iconSize={14}
            fillParent
          />
          {sortMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setSortMenuOpen(false)}
                role="presentation"
              />
              <div className="absolute right-0 top-full z-30 mt-1 flex w-44 flex-col overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl">
                {(
                  [
                    ["activity", t("sort.activity")],
                    ["unread", t("sort.unread")],
                    ["alpha", t("sort.alpha")],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      saveRoomSort(key);
                      setSort(key);
                      setSortMenuOpen(false);
                    }}
                    className={`px-3 py-2 text-left text-[13px] hover:bg-bg-2 ${
                      sort === key ? "text-fg-0" : "text-fg-2"
                    }`}
                  >
                    {sort === key ? "✓ " : "  "}
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="relative flex h-full">
          <IconButton
            icon={Plus}
            onClick={() => setCreateMenuOpen((v) => !v)}
            title={t("sidebar.action.new")}
            fillParent
          />
          {createMenuOpen && (
            <>
              {/* 바깥 클릭 닫기 */}
              <button
                type="button"
                aria-label={t("sidebar.menu.close")}
                className="fixed inset-0 z-20 cursor-default"
                onClick={() => setCreateMenuOpen(false)}
              />
              <div className="absolute right-0 top-full z-30 mt-1 flex w-44 flex-col divide-y divide-line overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl">
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
        <IconButton
          icon={CalendarClock}
          onClick={() => setDelayedOpen(true)}
          title={t("sidebar.scheduled")}
          fillParent
        />
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
          <EmptyState
            size="md"
            icon={MessageSquareText}
            title={t("sidebar.empty.title")}
            body={t("sidebar.empty.hint")}
          />
        )}
      </nav>

      {/* 푸터: 32px sync row + 36px 액션 row.
          위: 좌측 sync 점·라벨, 우측 E2EE 배지
          아래: [사용자 이름 ──── 설정 정사각형] — 헤더에서 옮겨와 truncate
                 여유 확보 + 메인 액션 강조. */}
      <div className="flex flex-col border-t border-line">
        <div className="flex h-8 shrink-0 items-center gap-2 px-5 text-[12px] text-fg-3">
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
        {/* 프로필 row — 인풋(textarea가 48px 콘텐츠 강제 → 49px total)와 시각
            높이를 맞춰야 함. min-h-12(48px) + border-box는 border 흡수해 48px total.
            인풋이 49이니 명시적 min-h-[49px]. */}
        <div className="flex min-h-[49px] shrink-0 items-stretch border-t border-line">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2.5 px-3 text-left hover:bg-bg-2"
            onClick={() => setProfileOpen(true)}
            title={t("sidebar.action.profile")}
          >
            <Avatar
              client={client}
              mxcUrl={profile.avatarUrl}
              name={displayName}
              shape="round"
              size={28}
            />
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-[13px] font-medium text-fg-0">
                {displayName}
              </span>
              <span className="truncate text-[11px] text-fg-3">{userId}</span>
            </span>
          </button>
          <IconButton
            icon={Settings}
            onClick={() => setAppSettingsOpen(true)}
            title={t("sidebar.action.settings")}
          />
        </div>
      </div>

      {newDmOpen && (
        <NewDmModal
          client={client}
          onClose={() => setNewDmOpen(false)}
          onStarted={(roomId) => {
            setNewDmOpen(false);
            navigate(roomPath(roomId));
          }}
        />
      )}
      {newRoomOpen && (
        <NewRoomModal
          client={client}
          onClose={() => setNewRoomOpen(false)}
          onCreated={(roomId) => {
            setNewRoomOpen(false);
            navigate(roomPath(roomId));
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
      {delayedOpen && (
        <DelayedMessagesModal
          client={client}
          onClose={() => setDelayedOpen(false)}
        />
      )}
    </aside>
  );
}
