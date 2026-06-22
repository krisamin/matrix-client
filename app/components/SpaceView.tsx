import { Lock, Plus, Settings } from "lucide-react";
import type { MatrixClient, Room } from "matrix-js-sdk";
import { useState } from "react";
import { useNavigate } from "react-router";
import { childRoomIds } from "../lib/spaces";
import { RoomAvatar } from "./Avatar";
import { NewRoomModal } from "./NewRoomModal";
import { NewSpaceModal } from "./NewSpaceModal";
import { PaneHeader, PaneHeaderButton } from "./PaneHeader";
import { RoomSettingsModal } from "./RoomSettingsModal";

/** Space 홈 — 메시지 타임라인 대신 보여주는 화면.
 *  Space 이름/설명 + 하위 Space + 자식 방 목록(클릭 이동) + 추가 버튼. */
export function SpaceView({
  client,
  space,
}: {
  client: MatrixClient;
  space: Room;
}) {
  const navigate = useNavigate();
  const [newRoomOpen, setNewRoomOpen] = useState(false);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const topic =
    space.currentState.getStateEvents("m.room.topic", "")?.getContent()
      ?.topic ?? "";

  // 자식 방 중 참여(또는 알고 있는) 방만 — getRoom null이면 미리보기 불가라 스킵
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
            title="Space 설정"
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
          {topic && (
            <p className="mb-6 whitespace-pre-wrap text-[14px] text-fg-1">
              {topic}
            </p>
          )}

          {/* 하위 Space — 카드 컨테이너 + divide-y 그리드 (B-final 톤) */}
          <section className="mb-4 overflow-hidden rounded-md border border-line bg-bg-1">
            <div className="flex h-10 items-center border-b border-line bg-bg-2/30 pl-5">
              <h2 className="flex-1 text-[12px] font-medium text-fg-2">
                하위 Space
                {childSpaces.length > 0 && (
                  <span className="ml-1.5 font-mono text-[11px] text-fg-3">
                    {childSpaces.length}
                  </span>
                )}
              </h2>
              <button
                type="button"
                onClick={() => setNewSpaceOpen(true)}
                className="flex aspect-square h-full shrink-0 items-center justify-center text-fg-2 hover:bg-bg-2 hover:text-fg-0"
                title="하위 Space 추가"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {childSpaces.length === 0 ? (
              <p className="px-5 py-4 text-center text-[12px] text-fg-3">
                아직 하위 Space가 없어요.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {childSpaces.map((r) => (
                  <li key={r.roomId}>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/room/${encodeURIComponent(r.roomId)}`)
                      }
                      className="flex w-full items-center gap-2.5 px-5 py-2 text-left hover:bg-bg-2"
                    >
                      <RoomAvatar client={client} room={r} size={24} />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg-0">
                        {r.name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 방 목록 */}
          <section className="overflow-hidden rounded-md border border-line bg-bg-1">
            <div className="flex h-10 items-center border-b border-line bg-bg-2/30 pl-5">
              <h2 className="flex-1 text-[12px] font-medium text-fg-2">
                방
                {childRooms.length > 0 && (
                  <span className="ml-1.5 font-mono text-[11px] text-fg-3">
                    {childRooms.length}
                  </span>
                )}
              </h2>
              <button
                type="button"
                onClick={() => setNewRoomOpen(true)}
                className="flex aspect-square h-full shrink-0 items-center justify-center text-fg-2 hover:bg-bg-2 hover:text-fg-0"
                title="방 추가"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {childRooms.length === 0 ? (
              <p className="px-5 py-6 text-center text-[13px] text-fg-3">
                아직 방이 없어요. 우측 + 버튼으로 첫 방을 만들어 보세요.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {childRooms.map((r) => (
                  <li key={r.roomId}>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/room/${encodeURIComponent(r.roomId)}`)
                      }
                      className="flex w-full items-center gap-2.5 px-5 py-2 text-left hover:bg-bg-2"
                    >
                      <RoomAvatar client={client} room={r} size={24} />
                      <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span className="truncate text-[13px] font-medium text-fg-0">
                          {r.name}
                        </span>
                        {r.hasEncryptionStateEvent() && (
                          <Lock className="h-3 w-3 shrink-0 text-fg-3" />
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {newRoomOpen && (
        <NewRoomModal
          client={client}
          defaultSpaceId={space.roomId}
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
          defaultSpaceId={space.roomId}
          onClose={() => setNewSpaceOpen(false)}
          onCreated={(spaceId) => {
            setNewSpaceOpen(false);
            navigate(`/room/${encodeURIComponent(spaceId)}`);
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
