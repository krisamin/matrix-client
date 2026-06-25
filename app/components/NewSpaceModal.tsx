import type { MatrixClient } from "matrix-js-sdk";
import { RoomCreateForm } from "./RoomCreateForm";

/** 새 Space 만들기 모달 — RoomCreateForm shell. */
export function NewSpaceModal({
  client,
  onClose,
  onCreated,
  defaultSpaceId,
}: {
  client: MatrixClient;
  onClose: () => void;
  onCreated: (spaceId: string) => void;
  defaultSpaceId?: string;
}) {
  return (
    <RoomCreateForm
      kind="space"
      client={client}
      onClose={onClose}
      onCreated={onCreated}
      defaultSpaceId={defaultSpaceId}
    />
  );
}
