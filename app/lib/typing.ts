import {
  type MatrixClient,
  type Room,
  type RoomMember,
  RoomMemberEvent,
} from "matrix-js-sdk";
import { useEffect, useRef, useState } from "react";

/** 상대 타이핑 수신 훅 — 나를 제외한 타이핑 중인 멤버 표시이름 목록 */
export function useTypingMembers(
  client: MatrixClient | null,
  room: Room | null,
): string[] {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    if (!client || !room) return;
    const myUserId = client.getUserId();
    const onTyping = (_ev: unknown, member: RoomMember) => {
      if (member.roomId !== room.roomId) return;
      const typing = room
        .getMembers()
        .filter((m) => m.typing && m.userId !== myUserId)
        .map((m) => m.name);
      setNames(typing);
    };
    client.on(RoomMemberEvent.Typing, onTyping);
    return () => {
      client.off(RoomMemberEvent.Typing, onTyping);
      setNames([]);
    };
  }, [client, room]);

  return names;
}

/** 내 타이핑 전송 훅 — notifyTyping()을 입력 onChange마다 호출.
 *  4초 throttle + 10초 무입력 시 자동 해제 (서버 timeout 30s보다 짧게 유지) */
export function useSendTyping(
  client: MatrixClient | null,
  roomId: string | undefined,
) {
  const lastSentRef = useRef(0);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // 방 나갈 때 타이핑 해제
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      if (client && roomId && lastSentRef.current > 0) {
        client.sendTyping(roomId, false, 0).catch(() => {});
      }
    };
  }, [client, roomId]);

  function notifyTyping() {
    if (!client || !roomId) return;
    const now = Date.now();
    if (now - lastSentRef.current > 4000) {
      lastSentRef.current = now;
      client.sendTyping(roomId, true, 15000).catch(() => {});
    }
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(() => {
      lastSentRef.current = 0;
      client.sendTyping(roomId, false, 0).catch(() => {});
    }, 10000);
  }

  /** 전송 완료 직후 호출 — 즉시 타이핑 해제 */
  function clearTyping() {
    if (!client || !roomId) return;
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    lastSentRef.current = 0;
    client.sendTyping(roomId, false, 0).catch(() => {});
  }

  return { notifyTyping, clearTyping };
}
