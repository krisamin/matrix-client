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
import { useEffect, useRef, useState } from "react";
import { loadRoomSort, sortRooms, type RoomSort } from "../lib/room-sort";

/** 사이드바용 방 목록 훅 — 참여중 방(최근 활동순) + 초대 + sync 상태.
 *  타임라인/읽음/복호화/멤버십/스레드 변화에 실시간 갱신 */
export function useRooms(client: MatrixClient) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [invites, setInvites] = useState<Room[]>([]);
  const [syncState, setSyncState] = useState<SyncState | null>(
    client.getSyncState(),
  );
  const [sort, setSort] = useState<RoomSort>(() => loadRoomSort());
  // ref로 sort 읽기 — useEffect deps에 sort 안 넣어도 refresh에서 최신값 읽음.
  // sort 바꿀 때마다 모든 listener 재등록 막음.
  const sortRef = useRef<RoomSort>(sort);
  sortRef.current = sort;
  // 스레드 자식 노드 갱신용 tick — 방 목록 자체가 안 바뀌어도 스레드 변화 시
  // RoomNode가 다시 getThreads()를 읽도록 강제 리렌더.
  const [, setThreadTick] = useState(0);

  // sort 직접 변경 시 즉시 재정렬 (별도 effect)
  useEffect(() => {
    const all = client.getRooms();
    setRooms(
      sortRooms(
        client,
        all.filter((r) => r.getMyMembership() === KnownMembership.Join),
        sort,
      ),
    );
  }, [client, sort]);

  useEffect(() => {
    const refresh = () => {
      const all = client.getRooms();
      setInvites(
        all.filter((r) => r.getMyMembership() === KnownMembership.Invite),
      );
      setRooms(
        sortRooms(
          client,
          all.filter((r) => r.getMyMembership() === KnownMembership.Join),
          sortRef.current,
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
    // ThreadEvent는 Room emitter가 재방출하므로 방 단위로 구독한다 (client emitter엔 없음).
    const onThread = () => setThreadTick((n) => n + 1);
    function attachRoomThread(room: Room) {
      room.on(ThreadEvent.New, onThread);
      room.on(ThreadEvent.NewReply, onThread);
      room.on(ThreadEvent.Update, onThread);
      room.on(ThreadEvent.Delete, onThread);
    }
    function detachRoomThread(room: Room) {
      room.off(ThreadEvent.New, onThread);
      room.off(ThreadEvent.NewReply, onThread);
      room.off(ThreadEvent.Update, onThread);
      room.off(ThreadEvent.Delete, onThread);
    }
    // 기존 방들에 모두 부착
    for (const r of client.getRooms()) attachRoomThread(r);
    // 새로 들어오는 방에도 부착
    const onNewRoom = (r: Room) => attachRoomThread(r);
    client.on(ClientEvent.Room, onNewRoom);
    client.on(ClientEvent.Sync, onSync);
    client.on(RoomEvent.Timeline, onTimeline);
    client.on(RoomEvent.Receipt, onReceipt);
    client.on(MatrixEventEvent.Decrypted, onDecrypted);
    client.on(RoomEvent.MyMembership, onMembership);
    return () => {
      for (const r of client.getRooms()) detachRoomThread(r);
      client.off(ClientEvent.Room, onNewRoom);
      client.off(ClientEvent.Sync, onSync);
      client.off(RoomEvent.Timeline, onTimeline);
      client.off(RoomEvent.Receipt, onReceipt);
      client.off(MatrixEventEvent.Decrypted, onDecrypted);
      client.off(RoomEvent.MyMembership, onMembership);
    };
  }, [client]);

  return { rooms, invites, syncState, sort, setSort };
}
