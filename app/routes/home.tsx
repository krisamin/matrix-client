import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router";
import {
  ClientEvent,
  EventType,
  MatrixEventEvent,
  NotificationCountType,
  RoomEvent,
  SyncState,
  type MatrixClient,
  type MatrixEvent,
  type Room,
} from "matrix-js-sdk";
import { getReadyClient, resetClient, ensureStarted } from "../lib/matrix";
import { clearSession } from "../lib/session";
import { KnownMembership } from "matrix-js-sdk/lib/types";
import {
  attachNotifications,
  notificationPermission,
  requestNotificationPermission,
} from "../lib/notifications";
import { ConnectionBanner } from "../components/ConnectionBanner";

export function meta() {
  return [{ title: "matrix-client" }];
}

/** 방의 마지막 표시 가능한 메시지 미리보기 텍스트 */
function lastMessagePreview(client: MatrixClient, room: Room): string {
  const events = room.getLiveTimeline().getEvents();
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    const type = ev.getType();
    if (type === EventType.RoomMessageEncrypted) {
      client.decryptEventIfNeeded(ev);
      return "🔒 암호화된 메시지";
    }
    if (type !== EventType.RoomMessage) continue;
    if (ev.isRedacted()) return "(삭제된 메시지)";
    const content = ev.getContent();
    const msgtype = content.msgtype as string;
    if (msgtype === "m.image") return "📷 사진";
    if (msgtype === "m.video") return "🎞 동영상";
    if (msgtype === "m.audio") return "🎙 음성";
    if (msgtype === "m.file") return `📎 ${content.body ?? "파일"}`;
    // body 첫 줄만 (마크다운 원문이라도 미리보기론 충분)
    return (content.body ?? "").split("\n")[0];
  }
  return "";
}

function lastActiveLabel(room: Room): string {
  const ts = room.getLastActiveTimestamp();
  if (!ts || ts <= 0) return "";
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay)
    return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "어제";
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export default function Home() {
  const navigate = useNavigate();
  const [client, setClient] = useState<MatrixClient | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [invites, setInvites] = useState<Room[]>([]);
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<string>("starting");
  const [userId, setUserId] = useState<string>("");
  const [verified, setVerified] = useState<boolean | null>(null);
  const [notifPerm, setNotifPerm] = useState(notificationPermission());

  useEffect(() => {
    const promise = getReadyClient();
    if (!promise) {
      navigate("/login", { replace: true });
      return;
    }
    let c: MatrixClient | undefined;
    let cleanup: (() => void) | undefined;
    promise.then((cl) => {
      c = cl;
      setClient(cl);
      setUserId(cl.getUserId() ?? "");
      attachNotifications(cl);

      cl.getCrypto()
        ?.getDeviceVerificationStatus(cl.getUserId()!, cl.getDeviceId()!)
        .then((s) => setVerified(s?.crossSigningVerified ?? false));

      const refreshRooms = () => {
        const all = cl.getRooms();
        setInvites(
          all.filter((r) => r.getMyMembership() === KnownMembership.Invite),
        );
        setRooms(
          all
            .filter((r) => r.getMyMembership() === KnownMembership.Join)
            .sort(
              (a, b) =>
                b.getLastActiveTimestamp() - a.getLastActiveTimestamp(),
            ),
        );
      };
      const onSync = (state: SyncState) => {
        setSyncState(state);
        if (state === SyncState.Prepared || state === SyncState.Syncing) {
          refreshRooms();
        }
      };
      // 새 메시지/읽음 갱신 실시간 반영
      const onTimeline = () => refreshRooms();
      const onReceipt = () => refreshRooms();
      const onDecrypted = (_ev: MatrixEvent) => refreshRooms();
      cl.on(ClientEvent.Sync, onSync);
      cl.on(RoomEvent.Timeline, onTimeline);
      cl.on(RoomEvent.Receipt, onReceipt);
      cl.on(MatrixEventEvent.Decrypted, onDecrypted);
      if (!cl.clientRunning) {
        ensureStarted(cl);
      } else {
        refreshRooms();
      }
      cleanup = () => {
        cl.off(ClientEvent.Sync, onSync);
        cl.off(RoomEvent.Timeline, onTimeline);
        cl.off(RoomEvent.Receipt, onReceipt);
        cl.off(MatrixEventEvent.Decrypted, onDecrypted);
      };
    });
    return () => cleanup?.();
  }, [navigate]);

  function logout() {
    resetClient();
    clearSession();
    window.location.href = "/login";
  }

  async function acceptInvite(roomId: string) {
    if (!client || inviteBusy) return;
    setInviteBusy(roomId);
    try {
      await client.joinRoom(roomId);
      navigate(`/room/${encodeURIComponent(roomId)}`);
    } catch (e) {
      console.warn("초대 수락 실패:", e);
    } finally {
      setInviteBusy(null);
    }
  }

  async function rejectInvite(roomId: string) {
    if (!client || inviteBusy) return;
    setInviteBusy(roomId);
    try {
      await client.leave(roomId);
      setInvites((prev) => prev.filter((r) => r.roomId !== roomId));
    } catch (e) {
      console.warn("초대 거절 실패:", e);
    } finally {
      setInviteBusy(null);
    }
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
          {notifPerm === "default" && (
            <button
              className="rounded border border-gray-300 px-3 py-1 text-sm dark:border-gray-700"
              onClick={async () => {
                await requestNotificationPermission();
                setNotifPerm(notificationPermission());
              }}
              title="새 메시지 데스크톱 알림 켜기"
            >
              🔔 알림 켜기
            </button>
          )}
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
      <ConnectionBanner client={client} />
      {invites.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/40">
          <h2 className="text-sm font-bold text-amber-700 dark:text-amber-400">
            📨 초대받은 방 {invites.length}개
          </h2>
          <ul className="flex flex-col gap-2">
            {invites.map((room) => {
              const inviter = room.getMember(userId)?.events.member?.getSender();
              return (
                <li
                  key={room.roomId}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">
                      {room.name}
                    </span>
                    {inviter && (
                      <span className="truncate text-xs text-gray-500">
                        {inviter} 님의 초대
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      className="rounded bg-blue-600 px-2.5 py-1 text-xs text-white disabled:opacity-50"
                      disabled={inviteBusy === room.roomId}
                      onClick={() => acceptInvite(room.roomId)}
                    >
                      수락
                    </button>
                    <button
                      className="rounded border border-gray-300 px-2.5 py-1 text-xs disabled:opacity-50 dark:border-gray-700"
                      disabled={inviteBusy === room.roomId}
                      onClick={() => rejectInvite(room.roomId)}
                    >
                      거절
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
        {rooms.map((room) => {
          const unread = room.getUnreadNotificationCount(
            NotificationCountType.Total,
          );
          const highlight = room.getUnreadNotificationCount(
            NotificationCountType.Highlight,
          );
          const preview = client ? lastMessagePreview(client, room) : "";
          return (
            <li key={room.roomId}>
              <Link
                to={`/room/${encodeURIComponent(room.roomId)}`}
                className="flex items-center gap-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-900"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1.5 font-medium">
                    {room.hasEncryptionStateEvent() && (
                      <span className="text-xs" title="E2EE 방">
                        🔐
                      </span>
                    )}
                    <span className="truncate">{room.name}</span>
                  </span>
                  <span className="truncate text-xs text-gray-500">
                    {preview || `멤버 ${room.getJoinedMemberCount()}명`}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs text-gray-400">
                    {lastActiveLabel(room)}
                  </span>
                  {unread > 0 && (
                    <span
                      className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-xs font-bold text-white ${
                        highlight > 0 ? "bg-red-500" : "bg-blue-500"
                      }`}
                    >
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
        {rooms.length === 0 && (
          <li className="py-3 text-sm text-gray-500">
            동기화 중이거나 방이 없어...
          </li>
        )}
      </ul>
    </main>
  );
}
