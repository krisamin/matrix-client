import {
  EventType,
  type MatrixClient,
  type MatrixEvent,
  MatrixEventEvent,
  RelationType,
  type Room,
  RoomEvent,
} from "matrix-js-sdk";
import { RelationsEvent } from "matrix-js-sdk/lib/models/relations";
import { memo, useEffect, useRef, useState } from "react";

/** 리액션 칩 + 추가 버튼. 메인/스레드 공용 (relations 컨테이너는 room 단위 공유) */
function ReactionBarInner({
  client,
  room,
  ev,
  myUserId,
}: {
  client: MatrixClient;
  room: Room;
  ev: MatrixEvent;
  myUserId: string;
}) {
  const [, force] = useState(0);
  // 낙관적 취소: redact 직후 SDK aggregation 갱신을 기다리지 않고 즉시 칩에서 제외
  // (SDK Relations의 redaction 반영은 local echo 인스턴스 불일치로 누락될 수 있음)
  const hiddenRef = useRef<Set<string>>(new Set());
  const eventId = ev.getId();
  const relations = eventId
    ? room.relations.getChildEventsForEvent(
        eventId,
        RelationType.Annotation,
        EventType.Reaction,
      )
    : undefined;

  // 리액션이 아직 없는 메시지는 relations 컨테이너 자체가 없음 —
  // 첫 리액션 도착으로 컨테이너가 생기면 리렌더해서 구독 경로 재구성
  // (없으면 "0개였던 메시지에 새 리액션이 달려도 안 보이는" 버그)
  useEffect(() => {
    const onCreated = (relationType: string, eventType: string) => {
      if (
        relationType === RelationType.Annotation &&
        eventType === EventType.Reaction
      ) {
        force((n) => n + 1);
      }
    };
    ev.on(MatrixEventEvent.RelationsCreated, onCreated);
    return () => {
      ev.off(MatrixEventEvent.RelationsCreated, onCreated);
    };
  }, [ev]);

  // 리액션 추가/삭제 실시간 반영 (Relations 인스턴스 이벤트)
  useEffect(() => {
    if (!relations) return;
    const bump = () => force((n) => n + 1);
    relations.on(RelationsEvent.Add, bump);
    relations.on(RelationsEvent.Remove, bump);
    relations.on(RelationsEvent.Redaction, bump);
    return () => {
      relations.off(RelationsEvent.Add, bump);
      relations.off(RelationsEvent.Remove, bump);
      relations.off(RelationsEvent.Redaction, bump);
    };
  }, [relations]);

  // room 레벨 Redaction 백업 구독 — Relations 경로가 누락해도 리렌더 보장
  useEffect(() => {
    const onRedaction = (redactionEv: MatrixEvent) => {
      const redactsId = redactionEv.event.redacts;
      if (!redactsId) return;
      const set = relations ? [...relations.getRelations()] : [];
      if (set.some((e) => e.getId() === redactsId)) {
        hiddenRef.current.add(redactsId);
        force((n) => n + 1);
      }
    };
    room.on(RoomEvent.Redaction, onRedaction);
    return () => {
      room.off(RoomEvent.Redaction, onRedaction);
    };
  }, [room, relations]);

  if (!eventId || ev.isRedacted()) return null;

  // Element 패턴 (ReactionsRowAdapter): ① sender 기준 dedupe — 같은 리액션이
  // 페이지네이션/sync/bundled 경로로 중복 인스턴스가 쌓임 (스펙상 1인 1키 1리액션)
  // ② 내 리액션은 getAnnotationsBySender()[userId]에서 key 매칭으로
  const myAnnotations = relations?.getAnnotationsBySender()?.[myUserId];
  const findMine = (key: string): MatrixEvent | undefined =>
    myAnnotations
      ? [...myAnnotations].find(
          (e) =>
            !e.isRedacted() &&
            !hiddenRef.current.has(e.getId() ?? "") &&
            e.getRelation()?.key === key,
        )
      : undefined;

  const annotations = (relations?.getSortedAnnotationsByKey() ?? [])
    .map(([key, set]) => {
      const live = [...set].filter(
        (e) => !e.isRedacted() && !hiddenRef.current.has(e.getId() ?? ""),
      );
      // sender당 1개만 카운트 (Matrix 스펙)
      const seen = new Set<string>();
      const deduped = live.filter((e) => {
        const s = e.getSender() ?? "";
        if (seen.has(s)) return false;
        seen.add(s);
        return true;
      });
      return { key, count: deduped.length, mine: findMine(key) };
    })
    .filter((a) => a.count > 0);

  async function toggle(key: string) {
    const existing = findMine(key);
    try {
      if (existing) {
        const id = existing.getId()!;
        // 낙관적 반영: 응답 기다리지 않고 즉시 숨김
        hiddenRef.current.add(id);
        force((n) => n + 1);
        try {
          // Element와 동일: threadId 없이 호출 (리액션은 event_id 관계로 라우팅)
          await client.redactEvent(room.roomId, id);
        } catch (e) {
          hiddenRef.current.delete(id); // 실패 시 롤백
          force((n) => n + 1);
          throw e;
        }
      } else {
        await client.sendEvent(room.roomId, EventType.Reaction, {
          "m.relates_to": {
            rel_type: RelationType.Annotation,
            event_id: eventId!,
            key,
          },
        });
      }
    } catch (e) {
      console.warn("리액션 전송 실패:", e);
    }
  }

  if (annotations.length === 0) return null;

  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {annotations.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={() => toggle(a.key)}
          className={`flex h-[22px] items-center gap-1 rounded-md border px-2 font-mono text-[12px] ${
            a.mine
              ? "border-line-strong bg-bg-3 text-fg-0"
              : "border-line text-fg-2 hover:bg-bg-2"
          }`}
          title={a.mine ? "리액션 취소" : "리액션"}
        >
          {a.key} {a.count}
        </button>
      ))}
    </span>
  );
}

export const ReactionBar = memo(ReactionBarInner);
