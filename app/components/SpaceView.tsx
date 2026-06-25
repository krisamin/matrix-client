import { Hash, Lock, Plus, Settings } from "lucide-react";
import type { MatrixClient, Room } from "matrix-js-sdk";
import { useState } from "react";
import { useNavigate } from "react-router";
import { roomPath } from "../lib/format";
import { useT } from "../lib/i18n";
import { childRoomIds } from "../lib/spaces";
import { RoomAvatar } from "./Avatar";
import { EmptyState } from "./EmptyState";
import { FieldGroup, SectionHeader } from "./Form";
import { IconButton } from "./IconButton";
import { NewRoomModal } from "./NewRoomModal";
import { NewSpaceModal } from "./NewSpaceModal";
import { PaneHeader, PaneHeaderButton } from "./PaneHeader";
import { RoomSettingsModal } from "./RoomSettingsModal";

/** Space 홈 — 메시지 타임라인 대신 보여주는 화면.
 *  상단: 큰 Avatar + Space 이름 + topic 배너.
 *  하단: 한 카드 안에 Subspaces / Rooms 섹션 두 개 (B-final 모달 톤). */
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
        <div className="mx-auto max-w-2xl px-6 py-6">
          {/* 헤더 배너 — 큰 Avatar + 이름 + topic */}
          <header className="mb-6 flex flex-col items-center gap-3 text-center">
            <RoomAvatar client={client} room={space} size={64} />
            <h2 className="text-[20px] font-semibold text-fg-0">
              {space.name}
            </h2>
            {topic && (
              <p className="max-w-md whitespace-pre-wrap text-[13px] text-fg-2">
                {topic}
              </p>
            )}
          </header>

          {/* 통합 카드 — 모달 톤 (rounded-md border bg-bg-1 + SectionHeader) */}
          <div className="overflow-hidden rounded-md border border-line bg-bg-1">
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
              <EmptyState size="sm" title={t("spaceView.empty.subspaces")} />
            ) : (
              <FieldGroup>
                {childSpaces.map((r) => (
                  <SpaceItem
                    key={r.roomId}
                    client={client}
                    room={r}
                    onClick={() => navigate(roomPath(r.roomId))}
                  />
                ))}
              </FieldGroup>
            )}

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
                  <RoomItem
                    key={r.roomId}
                    client={client}
                    room={r}
                    onClick={() => navigate(roomPath(r.roomId))}
                  />
                ))}
              </FieldGroup>
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

/** 하위 Space 항목 — Avatar + 이름 */
function SpaceItem({
  client,
  room,
  onClick,
}: {
  client: MatrixClient;
  room: Room;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-bg-2"
    >
      <RoomAvatar client={client} room={room} size={24} />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg-0">
        {room.name}
      </span>
    </button>
  );
}

/** 방 항목 — Avatar + 이름 + (E2EE면) 자물쇠 + Hash 아이콘 */
function RoomItem({
  client,
  room,
  onClick,
}: {
  client: MatrixClient;
  room: Room;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-bg-2"
    >
      <RoomAvatar client={client} room={room} size={24} />
      <Hash className="h-3 w-3 shrink-0 text-fg-3" />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg-0">
        {room.name}
      </span>
      {room.hasEncryptionStateEvent() && (
        <Lock className="h-3 w-3 shrink-0 text-fg-3" />
      )}
    </button>
  );
}
