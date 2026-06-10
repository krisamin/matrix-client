import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ClientEvent, SyncState, type Room } from "matrix-js-sdk";
import { getClient } from "../lib/matrix";
import { clearSession } from "../lib/session";

export function meta() {
  return [{ title: "matrix-client" }];
}

export default function Home() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [syncState, setSyncState] = useState<string>("starting");
  const [userId, setUserId] = useState<string>("");

  useEffect(() => {
    const client = getClient();
    if (!client) {
      navigate("/login", { replace: true });
      return;
    }
    setUserId(client.getUserId() ?? "");

    const refreshRooms = () => {
      const sorted = [...client.getRooms()].sort(
        (a, b) => b.getLastActiveTimestamp() - a.getLastActiveTimestamp(),
      );
      setRooms(sorted);
    };

    const onSync = (state: SyncState) => {
      setSyncState(state);
      if (state === SyncState.Prepared || state === SyncState.Syncing) {
        refreshRooms();
      }
    };
    client.on(ClientEvent.Sync, onSync);

    if (!client.clientRunning) {
      client.startClient({ initialSyncLimit: 20 });
    } else {
      refreshRooms();
    }

    return () => {
      client.off(ClientEvent.Sync, onSync);
    };
  }, [navigate]);

  function logout() {
    clearSession();
    window.location.href = "/login";
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">방 목록</h1>
          <p className="text-sm text-gray-500">
            {userId} · sync: {syncState}
          </p>
        </div>
        <button
          className="rounded border border-gray-300 px-3 py-1 text-sm dark:border-gray-700"
          onClick={logout}
        >
          로그아웃
        </button>
      </header>
      <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
        {rooms.map((room) => (
          <li key={room.roomId} className="flex flex-col py-3">
            <span className="font-medium">{room.name}</span>
            <span className="text-xs text-gray-500">
              {room.roomId} · 멤버 {room.getJoinedMemberCount()}명
            </span>
          </li>
        ))}
        {rooms.length === 0 && (
          <li className="py-3 text-sm text-gray-500">
            동기화 중이거나 방이 없어...
          </li>
        )}
      </ul>
    </main>
  );
}
