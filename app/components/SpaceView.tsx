import { Hash, Lock, Plus, Settings } from "lucide-react";
import type { MatrixClient, Room } from "matrix-js-sdk";
import { useState } from "react";
import { useNavigate } from "react-router";
import { roomPath } from "../lib/format";
import { useT } from "../lib/i18n";
import { childRoomIds } from "../lib/spaces";
import { Avatar, RoomAvatar } from "./Avatar";
import { EmptyState } from "./EmptyState";
import { FieldGroup, SectionHeader } from "./Form";
import { IconButton } from "./IconButton";
import { NewRoomModal } from "./NewRoomModal";
import { NewSpaceModal } from "./NewSpaceModal";
import { PaneHeader, PaneHeaderButton } from "./PaneHeader";
import { RoomSettingsModal } from "./RoomSettingsModal";

/** Space 홈 — 메시지 타임라인 대신 보여주는 화면.
 *  상단: Avatar + 이름 + topic banner.
 *  본문: 2-column (좌: Subspaces/Rooms, 우: 멤버) — 넓은 화면 활용. */
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

  // Space 자체 멤버 (join 상태) — Matrix는 Space도 room이라 동일 API
  const members = space
    .getJoinedMembers()
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

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
        <div className="mx-auto max-w-5xl px-6 py-6">
          {/* 헤더 banner — 좌측 Avatar + 우측 메타 (좌측 정렬, 컴팩트) */}
          <header className="mb-6 flex items-center gap-4">
            <RoomAvatar client={client} room={space} size={56} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h2 className="truncate text-[18px] font-semibold text-fg-0">
                {space.name}
              </h2>
              {topic && (
                <p className="whitespace-pre-wrap text-[13px] text-fg-2">
                  {topic}
                </p>
              )}
              <p className="text-[11px] text-fg-3">
                {t("spaceView.meta", {
                  members: members.length,
                  rooms: childRooms.length,
                  spaces: childSpaces.length,
                })}
              </p>
            </div>
          </header>

          {/* 2-column 레이아웃 — md 이상에서 분할, 작은 화면은 stack */}
          <div className="grid gap-4 md:grid-cols-[1fr_280px]">
            {/* 좌측: Subspaces + Rooms */}
            <div className="flex flex-col gap-4">
              <Card>
                <SectionHeader
                  actions={
                    <IconButton
                      icon={Plus}
                      fillParent
                      iconSize={14}
                      onClick={() => setNewSpaceOpen(true)}
                      title={t("spaceView.addSubspace")}
                    />
                  }
                >
                  {t("spaceView.subspaces")}
                  {childSpaces.length > 0 && (
                    <span className="ml-1.5 font-mono text-[11px] text-fg-3">
                      {childSpaces.length}
                    </span>
                  )}
                </SectionHeader>
                {childSpaces.length === 0 ? (
                  <EmptyState
                    size="sm"
                    title={t("spaceView.empty.subspaces")}
                  />
                ) : (
                  <FieldGroup>
                    {childSpaces.map((r) => (
                      <RoomLikeItem
                        key={r.roomId}
                        client={client}
                        room={r}
                        kind="space"
                        onClick={() => navigate(roomPath(r.roomId))}
                      />
                    ))}
                  </FieldGroup>
                )}
              </Card>

              <Card>
                <SectionHeader
                  actions={
                    <IconButton
                      icon={Plus}
                      fillParent
                      iconSize={14}
                      onClick={() => setNewRoomOpen(true)}
                      title={t("spaceView.addRoom")}
                    />
                  }
                >
                  {t("spaceView.rooms")}
                  {childRooms.length > 0 && (
                    <span className="ml-1.5 font-mono text-[11px] text-fg-3">
                      {childRooms.length}
                    </span>
                  )}
                </SectionHeader>
                {childRooms.length === 0 ? (
                  <EmptyState size="sm" title={t("spaceView.empty.rooms")} />
                ) : (
                  <FieldGroup>
                    {childRooms.map((r) => (
                      <RoomLikeItem
                        key={r.roomId}
                        client={client}
                        room={r}
                        kind="room"
                        onClick={() => navigate(roomPath(r.roomId))}
                      />
                    ))}
                  </FieldGroup>
                )}
              </Card>
            </div>

            {/* 우측: 멤버 */}
            <Card>
              <SectionHeader>
                {t("spaceView.members")}
                {members.length > 0 && (
                  <span className="ml-1.5 font-mono text-[11px] text-fg-3">
                    {members.length}
                  </span>
                )}
              </SectionHeader>
              {members.length === 0 ? (
                <EmptyState size="sm" title={t("spaceView.empty.members")} />
              ) : (
                <FieldGroup>
                  {members.map((m) => (
                    <div
                      key={m.userId}
                      className="flex items-center gap-2.5 px-4 py-2 text-[13px]"
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
                </FieldGroup>
              )}
            </Card>
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

/** Space view 안 카드 컨테이너 — 모달 톤 통일. */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-bg-1">
      {children}
    </div>
  );
}

/** 방/Space 항목 — Avatar + (room이면 Hash) + 이름 + (E2EE면) Lock */
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
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-bg-2"
    >
      <RoomAvatar client={client} room={room} size={24} />
      {kind === "room" && <Hash className="h-3 w-3 shrink-0 text-fg-3" />}
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg-0">
        {room.name}
      </span>
      {kind === "room" && room.hasEncryptionStateEvent() && (
        <Lock className="h-3 w-3 shrink-0 text-fg-3" />
      )}
    </button>
  );
}
