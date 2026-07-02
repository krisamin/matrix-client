import {
  EventType,
  type MatrixClient,
  type MatrixEvent,
  MsgType,
  RelationType,
  type Room,
} from "matrix-js-sdk";
import { useMemo } from "react";
import { useT } from "../lib/i18n";

type T = ReturnType<typeof useT>;

import { togglePin } from "../lib/matrix";
import { buildMentionContent } from "../lib/mention";

/** EventLine의 액션 함수들을 묶어주는 hook.
 *  - 동작/시그니처는 EventLine에 있던 원본 그대로 유지.
 *  - 의존성 shape(보통 [client, ev, room])을 그대로 보존하기 위해 useMemo로 묶음. */
export function useEventActions({
  client,
  room,
  ev,
  busy,
  editDraft,
  setEditDraft,
  setEditing,
  setBusy,
}: {
  client: MatrixClient;
  room: Room;
  ev: MatrixEvent;
  busy: boolean;
  editDraft: string;
  setEditDraft: (v: string) => void;
  setEditing: (v: boolean) => void;
  setBusy: (v: boolean) => void;
}) {
  const t = useT();
  return useMemo(
    () =>
      buildActions({
        client,
        room,
        ev,
        busy,
        editDraft,
        setEditDraft,
        setEditing,
        setBusy,
        t,
      }),
    // 원본과 동일하게: ev/room/client + 외부 의존성 모두 갱신될 때 새로 만든다.
    [client, room, ev, busy, editDraft, setEditDraft, setEditing, setBusy, t],
  );
}

function buildActions({
  client,
  room,
  ev,
  busy,
  editDraft,
  setEditDraft,
  setEditing,
  setBusy,
  t,
}: {
  client: MatrixClient;
  room: Room;
  ev: MatrixEvent;
  busy: boolean;
  editDraft: string;
  setEditDraft: (v: string) => void;
  setEditing: (v: boolean) => void;
  setBusy: (v: boolean) => void;
  t: T;
}) {
  function startEdit() {
    // 현재(수정 반영된) 본문에서 시작
    setEditDraft((ev.getContent().body as string) ?? "");
    setEditing(true);
  }

  async function submitEdit() {
    const text = editDraft.trim();
    if (!text || busy) return;
    if (text === (ev.getContent().body ?? "")) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      // m.replace: fallback(*표시)용 본문 + m.new_content (Element과 동일 구조).
      // buildMentionContent로 마크다운까지 처리한 new_content를 사용.
      const newContent = buildMentionContent(text, []);
      const newFormatted = newContent.formatted_body as string | undefined;
      await client.sendEvent(room.roomId, EventType.RoomMessage, {
        msgtype: MsgType.Text,
        body: `* ${text}`,
        ...(newFormatted
          ? {
              format: "org.matrix.custom.html",
              formatted_body: `* ${newFormatted}`,
            }
          : {}),
        "m.new_content": newContent,
        "m.relates_to": {
          rel_type: RelationType.Replace,
          event_id: ev.getId()!,
        },
      } as never);
      setEditing(false);
    } catch (e) {
      console.warn("수정 실패:", e);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy || !window.confirm(t("msg.confirmDelete"))) return;
    setBusy(true);
    try {
      await client.redactEvent(room.roomId, ev.getId()!);
    } catch (e) {
      console.warn("삭제 실패:", e);
    } finally {
      setBusy(false);
    }
  }

  async function pin() {
    if (busy) return;
    setBusy(true);
    try {
      await togglePin(client, room, ev.getId()!);
    } catch (e) {
      console.warn("고정 토글 실패:", e);
    } finally {
      setBusy(false);
    }
  }

  async function react(key: string) {
    try {
      await client.sendEvent(room.roomId, EventType.Reaction, {
        "m.relates_to": {
          rel_type: RelationType.Annotation,
          event_id: ev.getId()!,
          key,
        },
      });
    } catch (e) {
      console.warn("리액션 전송 실패:", e);
    }
  }

  async function resend() {
    if (busy) return;
    setBusy(true);
    try {
      await client.resendEvent(ev, room);
    } catch (e) {
      console.warn("재전송 실패:", e);
    } finally {
      setBusy(false);
    }
  }

  function cancelFailed() {
    try {
      client.cancelPendingEvent(ev);
    } catch (e) {
      console.warn("전송 취소 실패:", e);
    }
  }

  return {
    startEdit,
    submitEdit,
    remove,
    pin,
    react,
    resend,
    cancelFailed,
  };
}
