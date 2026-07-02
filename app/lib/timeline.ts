import {
  type EventTimelineSet,
  EventType,
  type MatrixClient,
  type MatrixEvent,
  MsgType,
  RelationType,
  type Room,
} from "matrix-js-sdk";
import { eventVersion } from "./group";

export const MEDIA_MSGTYPES = [
  MsgType.Image,
  MsgType.Video,
  MsgType.Audio,
  MsgType.File,
] as string[];

/** 메시지 이벤트인지 (복호화되면 type이 m.room.message로 바뀜).
 *  m.replace(수정) 이벤트는 제외 — 수정 내용은 SDK makeReplaced로 원본에
 *  합쳐지므로 별도 렌더하면 중복 표시됨 (Element도 렌더에서 숨김).
 *  서버 필터(not_rel_types)는 페이지네이션에만 적용되고 sync 라이브
 *  이벤트는 클라 필터를 통과하므로 여기서 걸러야 함. */
function isDisplayableMessage(ev: MatrixEvent): boolean {
  return (
    (ev.getType() === EventType.RoomMessage ||
      ev.getType() === EventType.RoomMessageEncrypted ||
      ev.isDecryptionFailure()) &&
    !ev.isRelation(RelationType.Replace)
  );
}

/** 타임라인에서 표시할 이벤트만 추림.
 *  스레드 답글은 메인 타임라인에서 제외 (스레드 패널에서 표시).
 *  timelineSet이 있으면 그 라이브 타임라인(MSC3874 필터드)을 사용. */
export function visibleEvents(
  room: Room,
  tlSet?: EventTimelineSet | null,
): MatrixEvent[] {
  const timeline = tlSet?.getLiveTimeline() ?? room.getLiveTimeline();
  return timeline
    .getEvents()
    .filter(
      (ev) => isDisplayableMessage(ev) && (!ev.threadRootId || ev.isThreadRoot),
    );
}

/** 스레드 타임라인에서 표시할 이벤트만 추림 + 시간순 정렬.
 *  (SDK race로 thread.events 순서가 꼬일 수 있어 정렬 필수 — aa44ce0) */
export function visibleThreadEvents(
  client: MatrixClient,
  threadEvents: MatrixEvent[],
): MatrixEvent[] {
  const evs = threadEvents
    .filter(isDisplayableMessage)
    .sort((a, b) => a.getTs() - b.getTs());
  for (const ev of evs) {
    if (ev.getType() === EventType.RoomMessageEncrypted) {
      client.decryptEventIfNeeded(ev);
    }
  }
  return evs;
}

/** events 배열의 내용 서명 — id + eventVersion(복호화/수정/삭제 상태).
 *  이게 같으면 화면에 그릴 내용이 동일 → 새 배열을 만들어도 이전 참조를 유지해
 *  Timeline 전체 리렌더를 막는다(정체성 보존 dedup). 복호화/수정으로 버전이
 *  바뀌면 서명이 달라져 통과하므로 리렌더 폭주는 막되 반영은 놓치지 않는다.
 *  룸/스레드 타임라인 훅이 공유. */
export function eventsSignature(events: MatrixEvent[]): string {
  const parts = new Array<string>(events.length);
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    parts[i] = `${ev.getId()}@${eventVersion(ev)}`;
  }
  return parts.join(";");
}
