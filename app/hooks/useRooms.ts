import {
  ClientEvent,
  type MatrixClient,
  type MatrixEvent,
  MatrixEventEvent,
  type Room,
  RoomEvent,
  SyncState,
  ThreadEvent,
} from "matrix-js-sdk";
import { KnownMembership } from "matrix-js-sdk/lib/types";
import { useEffect, useState } from "react";

/** 사이드바용 방 목록 훅 — 참여중 방(최근 활동순) + 초대 + sync 상태.
 *  타임라인/읽음/복호화/멤버십/스레드 변화에 실시간 갱신 */
export function useRooms(client: MatrixClient) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [invites, setInvites] = useState<Room[]>([]);
  const [syncState, setSyncState] = useState<SyncState | null>(
    client.getSyncState(),
  );
  // 스레드 자식 노드 갱신용 tick — 방 목록 자체가 안 바뀌어도 스레드 변화 시
  // RoomNode가 다시 getThreads()를 읽도록 강제 리렌더.
  const [, setThreadTick] = useState(0);

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
    // 스레드 이벤트는 방 자체의 lastActive를 안 흔들 수 있어 별도 tick으로 처리.
    // Room이 ThreadEvent를 재방출함(SDK room.d.ts 참고).
    const onThread = () => setThreadTick((n) => n + 1);
    client.on(ClientEvent.Sync, onSync);
    client.on(RoomEvent.Timeline, onTimeline);
    client.on(RoomEvent.Receipt, onReceipt);
    client.on(MatrixEventEvent.Decrypted, onDecrypted);
    client.on(RoomEvent.MyMembership, onMembership);
    client.on(ThreadEvent.New, onThread);
    client.on(ThreadEvent.NewReply, onThread);
    client.on(ThreadEvent.Update, onThread);
    client.on(ThreadEvent.Delete, onThread);
    return () => {
      client.off(ClientEvent.Sync, onSync);
      client.off(RoomEvent.Timeline, onTimeline);
      client.off(RoomEvent.Receipt, onReceipt);
      client.off(MatrixEventEvent.Decrypted, onDecrypted);
      client.off(RoomEvent.MyMembership, onMembership);
      client.off(ThreadEvent.New, onThread);
      client.off(ThreadEvent.NewReply, onThread);
      client.off(ThreadEvent.Update, onThread);
      client.off(ThreadEvent.Delete, onThread);
    };
  }, [client]);

  return { rooms, invites, syncState };
}
