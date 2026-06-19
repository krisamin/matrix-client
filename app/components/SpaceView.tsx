import { Lock, Plus } from "lucide-react";
import type { MatrixClient, Room } from "matrix-js-sdk";
import { useState } from "react";
import { useNavigate } from "react-router";
import { childRoomIds } from "../lib/spaces";
import { RoomAvatar } from "./Avatar";
import { NewRoomModal } from "./NewRoomModal";
import { PaneHeader } from "./PaneHeader";

/** Space 홈 — 메시지 타임라인 대신 보여주는 화면.
 *  Space 이름/설명 + 자식 방 목록(클릭 이동) + "여기에 방 추가". */
export function SpaceView({
  client,
  space,
}: {
  client: MatrixClient;
  space: Room;
}) {
  const navigate = useNavigate();
  const [newRoomOpen, setNewRoomOpen] = useState(false);

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
      <PaneHeader>
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

          {/* 하위 Space */}
          {childSpaces.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-fg-3">
                하위 Space
              </h2>
              <ul className="flex flex-col gap-0.5">
                {childSpaces.map((r) => (
                  <li key={r.roomId}>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/room/${encodeURIComponent(r.roomId)}`)
                      }
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-bg-2"
                    >
                      <RoomAvatar client={client} room={r} size={28} />
                      <span className="min-w-0 flex-1 truncate font-medium text-fg-0">
                        {r.name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 방 목록 */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-fg-3">
                방 {childRooms.length > 0 && `(${childRooms.length})`}
              </h2>
              <button
                type="button"
                onClick={() => setNewRoomOpen(true)}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-fg-2 hover:bg-bg-2 hover:text-fg-0"
              >
                <Plus className="h-3.5 w-3.5" />방 추가
              </button>
            </div>
            {childRooms.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-[13px] text-fg-3">
                아직 방이 없어요. “방 추가”로 첫 방을 만들어 보세요.
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {childRooms.map((r) => (
                  <li key={r.roomId}>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/room/${encodeURIComponent(r.roomId)}`)
                      }
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-bg-2"
                    >
                      <RoomAvatar client={client} room={r} size={28} />
                      <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span className="truncate font-medium text-fg-0">
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
    </div>
  );
}
