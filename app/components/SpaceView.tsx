import { Calendar, Hash, Lock, Plus, Settings } from "lucide-react";
import type { MatrixClient, Room } from "matrix-js-sdk";
import { useState } from "react";
import { useNavigate } from "react-router";
import { roomPath } from "../lib/format";
import { useT } from "../lib/i18n";
import { childRoomIds } from "../lib/spaces";
import { Avatar, RoomAvatar } from "./Avatar";
import { EmptyState } from "./EmptyState";
import { IconButton } from "./IconButton";
import { NewRoomModal } from "./NewRoomModal";
import { NewSpaceModal } from "./NewSpaceModal";
import { PaneHeader, PaneHeaderButton } from "./PaneHeader";
import { RoomSettingsModal } from "./RoomSettingsModal";

/** Space 홈 — 메시지 타임라인 대신 보여주는 화면.
 *  카드 wrap 없는 flat grid 레이아웃 — divide-y로 섹션 구분만,
 *  메인 콘텐츠와 같은 패딩 시스템(px-5). */
export function SpaceView({
  client,
  space,
}: {
  client: MatrixClient;
  space: Room;
}) {
  const t = useT();
  const navigate = useNavigate();
  const [newRoomOpen, setNewRoomOpen] = useState(false);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const topic =
    space.currentState.getStateEvents("m.room.topic", "")?.getContent()
      ?.topic ?? "";

  const childRooms = childRoomIds(space)
    .map((id) => client.getRoom(id))
    .filter((r): r is Room => !!r && !r.isSpaceRoom());
  const childSpaces = childRoomIds(space)
    .map((id) => client.getRoom(id))
    .filter((r): r is Room => !!r && r.isSpaceRoom());

  const members = space
    .getJoinedMembers()
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  const createEv = space.currentState.getStateEvents("m.room.create", "");
  const createdAt = createEv?.getTs();

  const joinRule =
    (space.currentState
      .getStateEvents("m.room.join_rules", "")
      ?.getContent()?.join_rule as string) ?? "invite";
  const isPublic = joinRule === "public";

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <PaneHeader
        actions={
          <PaneHeaderButton
            title={t("modal.spaceSettings.title")}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="h-[15px] w-[15px]" />
          </PaneHeaderButton>
        }
      >
        <RoomAvatar client={client} room={space} size={20} />
        <h1 className="truncate font-semibold text-fg-0">{space.name}</h1>
        <span className="shrink-0 rounded bg-bg-2 px-1.5 py-0.5 font-mono text-[10px] text-fg-3">
          SPACE
        </span>
      </PaneHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Banner — 카드 wrap 없이 px-5로 메인 영역과 같은 인셋 */}
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <RoomAvatar client={client} room={space} size={48} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="truncate text-[16px] font-semibold text-fg-0">
              {space.name}
            </h2>
            {topic ? (
              <p className="whitespace-pre-wrap text-[12px] text-fg-2">
                {topic}
              </p>
            ) : (
              <p className="text-[12px] text-fg-3 italic">
                {t("spaceView.noTopic")}
              </p>
            )}
          </div>
        </div>

        {/* Stats — banner 바로 아래 compact 행 */}
        <div className="flex border-b border-line divide-x divide-line">
          <Stat
            label={t("spaceView.stat.members")}
            value={members.length}
          />
          <Stat label={t("spaceView.stat.rooms")} value={childRooms.length} />
          <Stat
            label={t("spaceView.stat.subspaces")}
            value={childSpaces.length}
          />
          <Stat
            label={t("spaceView.stat.visibility")}
            value={
              isPublic
                ? t("spaceView.visibility.public")
                : t("spaceView.visibility.private")
            }
            mono={false}
          />
        </div>

        {/* 2-column grid — divide-x로 세로 분할, 카드 없이 flat */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] md:divide-x md:divide-line">
          {/* 좌측: Subspaces + Rooms */}
          <div className="flex flex-col divide-y divide-line">
            <Section
              title={t("spaceView.subspaces")}
              count={childSpaces.length}
              action={
                <IconButton
                  icon={Plus}
                  fillParent
                  iconSize={14}
                  onClick={() => setNewSpaceOpen(true)}
                  title={t("spaceView.addSubspace")}
                />
              }
            >
              {childSpaces.length === 0 ? (
                <EmptyState size="sm" title={t("spaceView.empty.subspaces")} />
              ) : (
                <div className="flex flex-col divide-y divide-line">
                  {childSpaces.map((r) => (
                    <RoomLikeItem
                      key={r.roomId}
                      client={client}
                      room={r}
                      kind="space"
                      onClick={() => navigate(roomPath(r.roomId))}
                    />
                  ))}
                </div>
              )}
            </Section>

            <Section
              title={t("spaceView.rooms")}
              count={childRooms.length}
              action={
                <IconButton
                  icon={Plus}
                  fillParent
                  iconSize={14}
                  onClick={() => setNewRoomOpen(true)}
                  title={t("spaceView.addRoom")}
                />
              }
            >
              {childRooms.length === 0 ? (
                <EmptyState size="sm" title={t("spaceView.empty.rooms")} />
              ) : (
                <div className="flex flex-col divide-y divide-line">
                  {childRooms.map((r) => (
                    <RoomLikeItem
                      key={r.roomId}
                      client={client}
                      room={r}
                      kind="room"
                      onClick={() => navigate(roomPath(r.roomId))}
                    />
                  ))}
                </div>
              )}
            </Section>
          </div>

          {/* 우측: 멤버 + 정보 */}
          <div className="flex flex-col divide-y divide-line">
            <Section
              title={t("spaceView.members")}
              count={members.length}
            >
              {members.length === 0 ? (
                <EmptyState size="sm" title={t("spaceView.empty.members")} />
              ) : (
                <div className="flex flex-col divide-y divide-line">
                  {members.map((m) => (
                    <div
                      key={m.userId}
                      className="flex items-center gap-2.5 px-5 py-2 text-[13px]"
                    >
                      <Avatar
                        client={client}
                        mxcUrl={m.getMxcAvatarUrl()}
                        name={m.name ?? m.userId}
                        size={24}
                        shape="round"
                      />
                      <span className="min-w-0 flex-1 truncate text-fg-1">
                        {m.name ?? m.userId}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {createdAt && (
              <Section title={t("spaceView.info")}>
                <div className="flex items-center gap-2.5 px-5 py-2 text-[12px]">
                  <Calendar className="h-3 w-3 shrink-0 text-fg-3" />
                  <span className="w-16 shrink-0 text-fg-3">
                    {t("spaceView.field.created")}
                  </span>
                  <span className="flex-1 text-fg-1">
                    {new Date(createdAt).toLocaleDateString()}
                  </span>
                </div>
              </Section>
            )}
          </div>
        </div>
      </div>

      {newRoomOpen && (
        <NewRoomModal
          client={client}
          defaultSpaceId={space.roomId}
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
          defaultSpaceId={space.roomId}
          onClose={() => setNewSpaceOpen(false)}
          onCreated={(spaceId) => {
            setNewSpaceOpen(false);
            navigate(roomPath(spaceId));
          }}
        />
      )}
      {settingsOpen && (
        <RoomSettingsModal
          client={client}
          room={space}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

/** Section 헤더 + body 묶음 — 카드 wrap 없이 flat. */
function Section({
  title,
  count,
  action,
  children,
}: {
  title: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col">
      <header className="flex h-9 items-center border-b border-line bg-bg-2/30">
        <span className="flex-1 truncate pl-5 text-[11px] font-semibold uppercase tracking-wider text-fg-2">
          {title}
          {count !== undefined && count > 0 && (
            <span className="ml-1.5 font-mono text-fg-3">{count}</span>
          )}
        </span>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Stats 행 한 칸 — 큰 숫자 + 라벨 */
function Stat({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: number | string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5 px-3 py-2.5">
      <span
        className={`text-[14px] font-semibold text-fg-0 ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-fg-3">
        {label}
      </span>
    </div>
  );
}

/** 방/Space 항목 — Avatar + (room이면 Hash) + 이름 + (E2EE면) Lock + 메타 */
function RoomLikeItem({
  client,
  room,
  kind,
  onClick,
}: {
  client: MatrixClient;
  room: Room;
  kind: "space" | "room";
  onClick: () => void;
}) {
  const topic =
    room.currentState.getStateEvents("m.room.topic", "")?.getContent()
      ?.topic ?? "";
  const memberCount = room.getJoinedMemberCount();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-5 py-2 text-left hover:bg-bg-2"
    >
      <RoomAvatar client={client} room={room} size={28} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          {kind === "room" && (
            <Hash className="h-3 w-3 shrink-0 text-fg-3" />
          )}
          <span className="truncate text-[13px] font-medium text-fg-0">
            {room.name}
          </span>
          {kind === "room" && room.hasEncryptionStateEvent() && (
            <Lock className="h-3 w-3 shrink-0 text-fg-3" />
          )}
        </span>
        {topic && (
          <span className="truncate text-[11px] text-fg-3">{topic}</span>
        )}
      </div>
      <span className="shrink-0 font-mono text-[11px] text-fg-3">
        {memberCount}
      </span>
    </button>
  );
}
