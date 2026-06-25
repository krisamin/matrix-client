import type { MatrixClient } from "matrix-js-sdk";
import { RoomCreateForm } from "./RoomCreateForm";

/** 새 방 만들기 모달 — RoomCreateForm shell. */
export function NewRoomModal({
  client,
  onClose,
  onCreated,
  defaultSpaceId,
}: {
  client: MatrixClient;
  onClose: () => void;
  onCreated: (roomId: string) => void;
  defaultSpaceId?: string;
}) {
  return (
    <RoomCreateForm
      kind="room"
      client={client}
      onClose={onClose}
      onCreated={onCreated}
      defaultSpaceId={defaultSpaceId}
    />
  );
}
