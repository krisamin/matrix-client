import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router";
import {
  ClientEvent,
  SyncState,
  type MatrixClient,
  type Room,
} from "matrix-js-sdk";
import { getReadyClient, resetClient } from "../lib/matrix";
import { clearSession } from "../lib/session";

export function meta() {
  return [{ title: "matrix-client" }];
}

export default function Home() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [syncState, setSyncState] = useState<string>("starting");
  const [userId, setUserId] = useState<string>("");
  const [verified, setVerified] = useState<boolean | null>(null);

  useEffect(() => {
    const promise = getReadyClient();
    if (!promise) {
      navigate("/login", { replace: true });
      return;
    }
    let client: MatrixClient | undefined;
    let onSync: ((state: SyncState) => void) | undefined;
    promise.then((c) => {
      client = c;
      setUserId(c.getUserId() ?? "");

      c.getCrypto()
        ?.getDeviceVerificationStatus(c.getUserId()!, c.getDeviceId()!)
        .then((s) => setVerified(s?.crossSigningVerified ?? false));

      const refreshRooms = () => {
        const sorted = [...c.getRooms()].sort(
          (a, b) => b.getLastActiveTimestamp() - a.getLastActiveTimestamp(),
        );
        setRooms(sorted);
      };
      onSync = (state: SyncState) => {
        setSyncState(state);
        if (state === SyncState.Prepared || state === SyncState.Syncing) {
          refreshRooms();
        }
      };
      c.on(ClientEvent.Sync, onSync);
      if (!c.clientRunning) {
        c.startClient({ initialSyncLimit: 20 });
      } else {
        refreshRooms();
      }
    });
    return () => {
      if (client && onSync) client.off(ClientEvent.Sync, onSync);
    };
  }, [navigate]);

  function logout() {
    resetClient();
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
        <div className="flex items-center gap-2">
          {verified === false && (
            <Link
              to="/verify"
              className="rounded bg-amber-500 px-3 py-1 text-sm text-white"
            >
              기기 인증 필요
            </Link>
          )}
          {verified === true && (
            <span className="text-sm text-green-600">✅ 인증됨</span>
          )}
          <button
            className="rounded border border-gray-300 px-3 py-1 text-sm dark:border-gray-700"
            onClick={logout}
          >
            로그아웃
          </button>
        </div>
      </header>
      <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
        {rooms.map((room) => (
          <li key={room.roomId}>
            <Link
              to={`/room/${encodeURIComponent(room.roomId)}`}
              className="flex flex-col py-3 hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              <span className="font-medium">{room.name}</span>
              <span className="text-xs text-gray-500">
                {room.roomId} · 멤버 {room.getJoinedMemberCount()}명
              </span>
            </Link>
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
