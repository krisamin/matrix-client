import {
  MessageSquarePlus,
  MessageSquareText,
  Pencil,
  Reply,
  SmilePlus,
  Trash2,
} from "lucide-react";
import {
  EventStatus,
  EventType,
  type MatrixClient,
  type MatrixEvent,
  MsgType,
  RelationType,
  type Room,
} from "matrix-js-sdk";
import { useState } from "react";
import { MEDIA_MSGTYPES } from "../lib/timeline";
import { MediaView } from "./MediaView";
import { MessageBody } from "./MessageBody";
import { QUICK_REACTIONS, ReactionBar } from "./ReactionBar";
import { getReplyToId, ReplyQuote } from "./ReplyQuote";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** 메시지 한 줄 (플랫 로그 스타일, 005 디자인):
 *  - 그룹 첫 줄만 발신자/시각 헤더 표시 (showHeader)
 *  - hover 시 우상단 플로팅 액션 툴바 (리액션/답장/스레드/수정/삭제)
 *  - 본문(텍스트/미디어) + 리액션 칩 + 스레드 링크 */
export function EventLine({
  ev,
  myUserId,
  client,
  room,
  showHeader = true,
  onOpenThread,
  onReply,
  onJumpTo,
  highlighted,
}: {
  ev: MatrixEvent;
  myUserId: string;
  client: MatrixClient;
  room: Room;
  /** 그룹 첫 메시지 여부 — 발신자/시각 헤더 표시 */
  showHeader?: boolean;
  onOpenThread?: (rootId: string) => void;
  /** 설정 시 hover에 답장 버튼 표시 */
  onReply?: (ev: MatrixEvent) => void;
  /** 인용 박스 클릭 시 원문으로 점프 */
  onJumpTo?: (eventId: string) => void;
  /** 점프 직후 잠깐 강조 */
  highlighted?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const sender = ev.getSender() ?? "?";
  const senderName = ev.sender?.name ?? sender;
  const mine = sender === myUserId;
  const content = ev.getContent();
  const replyToId = getReplyToId(ev);
  const thread = ev.isThreadRoot ? ev.getThread() : null;
  const threadLength = thread?.length ?? 0;
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

  async function react(key: string) {
    setPickerOpen(false);
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

  // 전송 상태 (local echo): null이면 서버 확정된 메시지
  const status = ev.status;
  const isFailed = status === EventStatus.NOT_SENT;
  const isPending =
    status === EventStatus.SENDING ||
    status === EventStatus.QUEUED ||
    status === EventStatus.ENCRYPTING;

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

  const actionBtn =
    "p-2 text-fg-1 hover:bg-bg-2 hover:text-fg-0 transition-colors";

  return (
    <li
      id={`ev-${ev.getId()}`}
      className={`group relative px-5 py-0.5 transition-colors hover:bg-bg-2/60 ${
        showHeader ? "mt-3" : ""
      } ${highlighted ? "!bg-bg-3" : ""}`}
    >
      {/* 그룹 헤더: 발신자 + 시각 (+수정됨) */}
      {showHeader && (
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-fg-0">{senderName}</span>
          <span className="font-mono text-[10px] text-fg-3">
            {formatTime(ev.getTs())}
          </span>
          {ev.replacingEvent() && (
            <span className="text-[10px] text-fg-3" title="수정됨">
              수정됨
            </span>
          )}
        </div>
      )}
      {!showHeader && ev.replacingEvent() && (
        <span className="sr-only">수정됨</span>
      )}

      {/* hover 플로팅 액션 툴바 */}
      {!editing && !ev.isRedacted() && (
        <div className="absolute -top-3 right-5 z-10 hidden items-center overflow-hidden rounded-lg border border-line bg-bg-3 shadow-xl group-hover:flex">
          <button
            type="button"
            className={actionBtn}
            onClick={() => setPickerOpen((v) => !v)}
            title="리액션"
          >
            <SmilePlus className="h-3.5 w-3.5" />
          </button>
          {onReply && (
            <button
              type="button"
              className={actionBtn}
              onClick={() => onReply(ev)}
              title="답장"
            >
              <Reply className="h-3.5 w-3.5" />
            </button>
          )}
          {onOpenThread && (
            <button
              type="button"
              className={actionBtn}
              onClick={() => onOpenThread(ev.getId()!)}
              title="스레드"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              className={actionBtn}
              onClick={startEdit}
              title="수정"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {canModify && (
            <button
              type="button"
              className={actionBtn}
              onClick={remove}
              title="삭제"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      {/* 빠른 리액션 피커 */}
      {pickerOpen && (
        <div className="absolute -top-3 right-40 z-20 flex items-center gap-0.5 rounded-lg border border-line bg-bg-3 p-1 shadow-xl">
          {QUICK_REACTIONS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => react(key)}
              className="rounded-md px-1.5 py-0.5 text-sm hover:bg-bg-2"
            >
              {key}
            </button>
          ))}
        </div>
      )}

      {/* 답장 인용 */}
      {replyToId && (
        <ReplyQuote
          client={client}
          room={room}
          replyToId={replyToId}
          onClick={onJumpTo ? () => onJumpTo(replyToId) : undefined}
        />
      )}

      {/* 본문 */}
      {editing ? (
        <form
          className="flex w-full flex-col gap-1 py-0.5"
          onSubmit={(e) => {
            e.preventDefault();
            submitEdit();
          }}
        >
          <textarea
            className="w-full rounded-lg border border-line-strong bg-bg-2 px-2.5 py-1.5 text-fg-0 outline-none"
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
          <span className="flex gap-2 text-[11px] text-fg-2">
            <button
              type="submit"
              className="font-medium text-fg-0 hover:underline"
              disabled={busy}
            >
              저장
            </button>
            <button
              type="button"
              className="hover:underline"
              onClick={() => setEditing(false)}
            >
              취소 (Esc)
            </button>
          </span>
        </form>
      ) : isMedia ? (
        <div
          className={`max-w-[640px] ${isPending || isFailed ? "opacity-60" : ""}`}
        >
          <MediaView client={client} ev={ev} />
        </div>
      ) : placeholder ? (
        <p className={`text-fg-2 ${isPending || isFailed ? "opacity-60" : ""}`}>
          {placeholder}
        </p>
      ) : (
        <div className={isPending || isFailed ? "opacity-60" : ""}>
          <MessageBody client={client} ev={ev} />
        </div>
      )}

      {/* 전송 상태 */}
      {isFailed && (
        <span className="flex items-center gap-2 text-[11px] text-red-400">
          ⚠ 전송 실패
          <button
            type="button"
            className="font-medium underline hover:text-red-300"
            onClick={resend}
            disabled={busy}
          >
            재전송
          </button>
          <button
            type="button"
            className="text-fg-2 underline hover:text-fg-1"
            onClick={cancelFailed}
          >
            삭제
          </button>
        </span>
      )}
      {isPending && (
        <span className="font-mono text-[10px] text-fg-3">전송 중...</span>
      )}

      {/* 리액션 칩 */}
      <ReactionBar client={client} room={room} ev={ev} myUserId={myUserId} />

      {/* 스레드 링크 (답글 있을 때만 — 시작은 hover 툴바에서) */}
      {onOpenThread && threadLength > 0 && (
        <button
          type="button"
          className="mt-1.5 flex h-[22px] items-center gap-1.5 text-[11px] text-fg-2 hover:text-fg-0"
          onClick={() => onOpenThread(ev.getId()!)}
        >
          <MessageSquareText className="h-3.5 w-3.5" />
          <span className="font-medium">답글 {threadLength}</span>
          {thread?.replyToEvent && (
            <span className="font-mono text-[10px] text-fg-3">
              {formatTime(thread.replyToEvent.getTs())}
            </span>
          )}
        </button>
      )}
    </li>
  );
}
