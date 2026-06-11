import {
  ClientEvent,
  type MatrixClient,
  type MatrixEvent,
  MatrixEventEvent,
  type Room,
  RoomEvent,
  SyncState,
} from "matrix-js-sdk";
import { KnownMembership } from "matrix-js-sdk/lib/types";
import { useEffect, useState } from "react";

/** 사이드바용 방 목록 훅 — 참여중 방(최근 활동순) + 초대 + sync 상태.
 *  타임라인/읽음/복호화/멤버십 변화에 실시간 갱신 */
export function useRooms(client: MatrixClient) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [invites, setInvites] = useState<Room[]>([]);
  const [syncState, setSyncState] = useState<SyncState | null>(
    client.getSyncState(),
  );

  useEffect(() => {
    const refresh = () => {
      const all = client.getRooms();
      setInvites(
        all.filter((r) => r.getMyMembership() === KnownMembership.Invite),
      );
      setRooms(
        all
          .filter((r) => r.getMyMembership() === KnownMembership.Join)
          .sort(
            (a, b) => b.getLastActiveTimestamp() - a.getLastActiveTimestamp(),
          ),
      );
    };
    refresh();

    const onSync = (state: SyncState) => {
      setSyncState(state);
      if (state === SyncState.Prepared || state === SyncState.Syncing) {
        refresh();
      }
    };
    const onTimeline = () => refresh();
    const onReceipt = () => refresh();
    const onDecrypted = (_ev: MatrixEvent) => refresh();
    const onMembership = () => refresh();
    client.on(ClientEvent.Sync, onSync);
    client.on(RoomEvent.Timeline, onTimeline);
    client.on(RoomEvent.Receipt, onReceipt);
    client.on(MatrixEventEvent.Decrypted, onDecrypted);
    client.on(RoomEvent.MyMembership, onMembership);
    return () => {
      client.off(ClientEvent.Sync, onSync);
      client.off(RoomEvent.Timeline, onTimeline);
      client.off(RoomEvent.Receipt, onReceipt);
      client.off(MatrixEventEvent.Decrypted, onDecrypted);
      client.off(RoomEvent.MyMembership, onMembership);
    };
  }, [client]);

  return { rooms, invites, syncState };
}
