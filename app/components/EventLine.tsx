import { useState } from "react";
import {
  EventType,
  MsgType,
  RelationType,
  type MatrixClient,
  type MatrixEvent,
  type Room,
} from "matrix-js-sdk";
import { MEDIA_MSGTYPES } from "../lib/timeline";
import { MediaView } from "./MediaView";
import { MessageBody } from "./MessageBody";
import { ReactionBar } from "./ReactionBar";

/** 메시지 한 줄: 발신자/시각 + 본문(텍스트/미디어) + 리액션 + 스레드 버튼 */
export function EventLine({
  ev,
  myUserId,
  client,
  room,
  onOpenThread,
}: {
  ev: MatrixEvent;
  myUserId: string;
  client: MatrixClient;
  room: Room;
  onOpenThread?: (rootId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const sender = ev.getSender() ?? "?";
  const mine = sender === myUserId;
  const content = ev.getContent();
  const threadLength = ev.isThreadRoot ? (ev.getThread()?.length ?? 0) : 0;
  const isMedia =
    ev.getType() === EventType.RoomMessage &&
    MEDIA_MSGTYPES.includes(content.msgtype as string) &&
    !ev.isRedacted();
  // 일반 텍스트 메시지(마크다운/HTML 포함)는 MessageBody가 렌더,
  // 그 외 상태(복호화중/실패/삭제)는 평문 placeholder
  let placeholder: string | null = null;
  if (ev.isDecryptionFailure()) {
    placeholder = "🔒 복호화 실패 (키 없음 — 기기 인증/키 백업 확인)";
  } else if (ev.getType() === EventType.RoomMessageEncrypted) {
    placeholder = "🔒 복호화 중...";
  } else if (ev.isRedacted()) {
    placeholder = "(삭제된 메시지)";
  } else if (!isMedia && content.body == null) {
    placeholder = `(${content.msgtype ?? ev.getType()})`;
  }
  const time = new Date(ev.getTs()).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // 수정/삭제 가능 조건: 내 메시지 + 삭제 안 됨 + 복호화 완료
  const canModify =
    mine && !ev.isRedacted() && ev.getType() === EventType.RoomMessage;
  const canEdit = canModify && !isMedia;

  function startEdit() {
    // 현재(수정 반영된) 본문에서 시작
    setEditDraft(ev.getContent().body ?? "");
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
      // m.replace: fallback(*표시)용 본문 + m.new_content (Element과 동일 구조)
      await client.sendEvent(room.roomId, EventType.RoomMessage, {
        msgtype: MsgType.Text,
        body: `* ${text}`,
        "m.new_content": { msgtype: MsgType.Text, body: text },
        "m.relates_to": {
          rel_type: RelationType.Replace,
          event_id: ev.getId()!,
        },
      });
      setEditing(false);
    } catch (e) {
      console.warn("수정 실패:", e);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy || !window.confirm("이 메시지를 삭제할까?")) return;
    setBusy(true);
    try {
      await client.redactEvent(room.roomId, ev.getId()!);
    } catch (e) {
      console.warn("삭제 실패:", e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className={`group flex flex-col py-1 ${mine ? "items-end" : "items-start"}`}
    >
      <span className="flex items-center gap-1.5 text-xs text-gray-500">
        <span>
          {sender} · {time}
          {ev.replacingEvent() && (
            <span className="ml-1 opacity-70" title="수정됨">
              (수정됨)
            </span>
          )}
        </span>
        {canModify && !editing && (
          <span className="hidden gap-1 group-hover:flex">
            {canEdit && (
              <button
                className="text-gray-400 hover:text-gray-600"
                onClick={startEdit}
                title="수정"
              >
                ✏️
              </button>
            )}
            <button
              className="text-gray-400 hover:text-red-500"
              onClick={remove}
              title="삭제"
            >
              🗑
            </button>
          </span>
        )}
      </span>
      {editing ? (
        <form
          className="flex w-full max-w-[80%] flex-col gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            submitEdit();
          }}
        >
          <textarea
            className="w-full rounded border border-blue-400 px-2 py-1.5 text-sm dark:bg-gray-900"
            value={editDraft}
            rows={Math.min(8, editDraft.split("\n").length + 1)}
            autoFocus
            onChange={(e) => setEditDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitEdit();
              }
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <span className="flex gap-2 text-xs">
            <button
              type="submit"
              className="text-blue-500 hover:underline"
              disabled={busy}
            >
              저장
            </button>
            <button
              type="button"
              className="text-gray-400 hover:underline"
              onClick={() => setEditing(false)}
            >
              취소 (Esc)
            </button>
          </span>
        </form>
      ) : isMedia ? (
        <span className="max-w-[80%]">
          <MediaView client={client} ev={ev} />
        </span>
      ) : placeholder ? (
        <span
          className={`max-w-[80%] whitespace-pre-wrap break-words rounded-lg px-3 py-1.5 ${
            mine ? "bg-blue-600 text-white" : "bg-gray-200 dark:bg-gray-800"
          }`}
        >
          {placeholder}
        </span>
      ) : (
        <MessageBody client={client} ev={ev} mine={mine} />
      )}
      <ReactionBar client={client} room={room} ev={ev} myUserId={myUserId} />
      {onOpenThread && (
        <span className="flex gap-2 text-xs">
          {threadLength > 0 && (
            <button
              className="text-blue-500 hover:underline"
              onClick={() => onOpenThread(ev.getId()!)}
            >
              🧵 답글 {threadLength}개
            </button>
          )}
          {threadLength === 0 && (
            <button
              className="text-gray-400 opacity-0 hover:underline group-hover:opacity-100"
              onClick={() => onOpenThread(ev.getId()!)}
            >
              스레드 시작
            </button>
          )}
        </span>
      )}
    </li>
  );
}
