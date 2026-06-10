import {
  EventType,
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
  return (
    <li
      className={`group flex flex-col py-1 ${mine ? "items-end" : "items-start"}`}
    >
      <span className="text-xs text-gray-500">
        {sender} · {time}
        {ev.replacingEvent() && (
          <span className="ml-1 opacity-70" title="수정됨">
            (수정됨)
          </span>
        )}
      </span>
      {isMedia ? (
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
