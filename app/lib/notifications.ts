import {
  EventType,
  type MatrixClient,
  type MatrixEvent,
  MatrixEventEvent,
  type Room,
  RoomEvent,
} from "matrix-js-sdk";
import { roomPath } from "./format";

/** 데스크톱 알림: 탭이 백그라운드일 때 새 메시지를 Notification API로 표시.
 *  클릭하면 해당 방으로 이동. 권한은 명시적 요청 후에만 동작. */

let attached = false;

export function notificationPermission():
  | NotificationPermission
  | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  const p = await Notification.requestPermission();
  return p === "granted";
}

function preview(ev: MatrixEvent): string {
  const content = ev.getContent();
  const msgtype = content.msgtype as string;
  if (msgtype === "m.image") return "📷 Image";
  if (msgtype === "m.video") return "🎞 Video";
  if (msgtype === "m.audio") return "🎙 Audio";
  if (msgtype === "m.file") return "📎 File";
  const body: string = content.body ?? "New message";
  const stripped = body.replace(/^(>.*\n)+\n?/, ""); // reply fallback 제거
  return stripped.length > 120 ? `${stripped.slice(0, 120)}…` : stripped;
}

function shouldNotify(
  client: MatrixClient,
  ev: MatrixEvent,
  room: Room,
): boolean {
  if (document.visibilityState === "visible") return false;
  if (ev.getSender() === client.getUserId()) return false;
  // push rule 평가 결과(멘션/키워드/DM 등) 또는 DM 방이면 알림
  const actions = client.getPushActionsForEvent(ev);
  if (actions?.notify) return true;
  // fallback: 멤버 2명(DM) 방은 항상
  return room.getJoinedMemberCount() <= 2;
}

function fireNotification(ev: MatrixEvent, room: Room) {
  const sender =
    room.getMember(ev.getSender() ?? "")?.name ?? ev.getSender() ?? "?";
  const isDm = room.getJoinedMemberCount() <= 2;
  const title = isDm ? sender : `${room.name} — ${sender}`;
  const n = new Notification(title, {
    body: ev.isEncrypted() && !ev.getClearContent() ? "새 메시지" : preview(ev),
    tag: room.roomId, // 같은 방 알림은 갱신 (스팸 방지)
  });
  n.onclick = () => {
    window.focus();
    window.location.href = roomPath(room.roomId);
    n.close();
  };
}

/** 클라이언트에 알림 리스너 부착 (앱 수명 동안 1회).
 *  E2EE 메시지는 복호화 완료 시점(Decrypted)에 평가. */
export function attachNotifications(client: MatrixClient): void {
  if (attached || typeof Notification === "undefined") return;
  attached = true;

  const seen = new Set<string>();
  const consider = (ev: MatrixEvent, room: Room | undefined) => {
    if (!room || Notification.permission !== "granted") return;
    const id = ev.getId();
    if (!id || seen.has(id)) return;
    if (ev.getType() !== EventType.RoomMessage) return;
    // 과거 이벤트(초기 sync/페이지네이션)는 제외 — 5초 이내 신착만
    if (Date.now() - ev.getTs() > 5000) return;
    if (!shouldNotify(client, ev, room)) return;
    seen.add(id);
    if (seen.size > 200) seen.clear(); // 메모리 캡
    fireNotification(ev, room);
  };

  client.on(
    RoomEvent.Timeline,
    (ev, room, toStartOfTimeline, removed, data) => {
      if (toStartOfTimeline || removed || !data.liveEvent) return;
      consider(ev, room ?? undefined);
    },
  );
  // E2EE: 복호화가 끝나야 내용/푸시룰 평가 가능
  client.on(MatrixEventEvent.Decrypted, (ev: MatrixEvent) => {
    const room = client.getRoom(ev.getRoomId() ?? "") ?? undefined;
    consider(ev, room);
  });
}
