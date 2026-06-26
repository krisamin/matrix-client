import {
  Check,
  Copy,
  Forward,
  MessageSquarePlus,
  MessageSquareText,
  Pencil,
  Pin,
  PinOff,
  Reply,
  ShieldAlert,
  ShieldQuestion,
  SmilePlus,
  Trash2,
} from "lucide-react";
import {
  EventStatus,
  EventType,
  type MatrixClient,
  type MatrixEvent,
  type Room,
} from "matrix-js-sdk";
import {
  EventShieldColour,
  EventShieldReason,
} from "matrix-js-sdk/lib/crypto-api";
import { lazy, memo, Suspense, useEffect, useState } from "react";
import { useEventActions } from "../hooks/useEventActions";
import { useLongPress } from "../hooks/useLongPress";
import { useShield } from "../hooks/useShield";
import { formatFullTime, formatTime } from "../lib/format";
import { useT } from "../lib/i18n";
import { isPinned } from "../lib/matrix";
import { mentionsUser } from "../lib/mention";
import { quotePreview, thumbnailSource } from "../lib/reply";
import { MEDIA_MSGTYPES } from "../lib/timeline";
import { extractPreviewUrls } from "../lib/url-preview";
import { ForwardModal } from "./ForwardModal";
import { MediaView } from "./MediaView";
import { MessageBody } from "./MessageBody";
import { QuoteThumbnail } from "./QuoteThumbnail";
import { ReactionBar } from "./ReactionBar";
import { ReadReceipts } from "./ReadReceipts";
import { getReplyToId, ReplyQuote } from "./ReplyQuote";
import { isToolProgressEvent, ToolCallChip } from "./ToolCallChip";
import { UrlPreviews } from "./UrlPreview";
import { UserProfileCard } from "./UserProfileCard";

const EmojiPicker = lazy(() =>
  import("./EmojiPicker").then((m) => ({ default: m.EmojiPicker })),
);

/** 등장 애니메이션을 이미 재생한 이벤트 id 집합 (모듈 레벨).
 *  가상 스크롤에서 행이 재마운트될 때마다 msg-in이 재생되면 메시지가
 *  떠오르며 잔상처럼 보인다. 한 이벤트당 최초 1회만 애니메이션하도록 기록. */
const animatedOnce = new Set<string>();

/** 메시지 한 줄 (플랫 로그 스타일, 005 디자인):
 *  - 그룹 첫 줄만 발신자/시각 헤더 표시 (showHeader)
 *  - hover 시 우상단 플로팅 액션 툴바 (리액션/답장/스레드/수정/삭제)
 *  - 본문(텍스트/미디어) + 리액션 칩 + 스레드 링크 */
const EventLineInner = function EventLine({
  ev,
  myUserId,
  client,
  room,
  showHeader = true,
  onOpenThread,
  onReply,
  onJumpTo,
  highlighted,
  contentVersion,
}: {
  ev: MatrixEvent;
  /** 내용 버전 스냅샷 (group.ts eventVersion). 직접 쓰진 않지만 prop으로
   *  받아야 memo가 복호화/수정/삭제로 인한 in-place mutation을 감지해
   *  리렌더한다. ev는 같은 인스턴스라 참조 비교로는 변화를 못 잡기 때문. */
  contentVersion: string;
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
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [busy, setBusy] = useState(false);
  // 이모지 피커: 트리거 버튼 rect를 앵커로 포털 팝오버 (null = 닫힘)
  const [pickerAnchor, setPickerAnchor] = useState<DOMRect | null>(null);
  // 발신자 프로필 카드 (이름 클릭)
  const [profileAnchor, setProfileAnchor] = useState<DOMRect | null>(null);
  // 전달 모달 열림 여부
  const [forwarding, setForwarding] = useState(false);
  const [copied, setCopied] = useState(false);
  // 모바일 long-press 액션바 표시 토글 — hover가 없는 터치 환경에서 데스크탑
  // hover 메뉴를 대체. 같은 메시지를 다시 long-press하거나 다른 곳 탭하면 닫힘.
  const [mobileActive, setMobileActive] = useState(false);
  // 모바일 액션바 열린 상태에서 바깥 탭 → 닫기. capture: true는 자식 onClick보다
  // 먼저 실행돼 액션 버튼 탭은 그대로 동작(stopPropagation 안 해도 OK).
  useEffect(() => {
    if (!mobileActive) return;
    const onDown = (e: PointerEvent) => {
      const el = document.getElementById(`ev-${ev.getId()}`);
      if (el && !el.contains(e.target as Node)) setMobileActive(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [mobileActive, ev]);
  const longPress = useLongPress(() => {
    // 편집/삭제된 이벤트엔 액션바가 안 뜨므로 long-press도 무시
    if (editing || ev.isRedacted()) return;
    // 텍스트 선택 중이면 long-press 액션 무시 (iOS는 본문 long-press가 selection
    // 핸들을 띄우는데, 그 위에 우리 메뉴까지 띄우면 충돌). 빈 selection은 OK.
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (sel && !sel.isCollapsed && sel.toString().length > 0) return;
    setMobileActive((v) => !v);
  });
  // 액션 클릭 시 모바일 액션바 닫기 — 액션 실행 후 메뉴 잔존 방지.
  // (피커/모달은 자체 anchor를 갖고 있어 닫혀도 그쪽은 독립적으로 유지됨)
  const closeMobileActive = () => setMobileActive(false);
  // 마운트 시점에 "방금 도착한" 이벤트(5초 이내 / local echo)만 등장 애니메이션.
  // 단 한 이벤트당 최초 1회만 — 가상 스크롤 재마운트 때마다 떠오르는 잔상 방지.
  const [animateIn] = useState(() => {
    const id = ev.getId();
    const fresh = ev.status != null || Date.now() - ev.getTs() < 5000;
    if (!fresh) return false;
    if (id && animatedOnce.has(id)) return false; // 이미 재생함 → 재마운트
    if (id) animatedOnce.add(id);
    return true;
  });
  const sender = ev.getSender() ?? "?";
  const senderName = ev.sender?.name ?? sender;
  const mine = sender === myUserId;
  const content = ev.getContent();
  // 내 멘션 — 좌측 노란 보더 + 옅은 배경으로 강조
  const myName = room.getMember(myUserId)?.name ?? "";
  const mentioned =
    !mine && mentionsUser(content as Record<string, unknown>, myUserId, myName);
  const replyToId = getReplyToId(ev);
  // 게이트웨이가 tool-progress 버블에 단 마커 (m.notice + tool_progress 필드)
  // 또는 본문 모양으로 식별된 도구 진행 메시지. hermes update로 패치가 풀려
  // 마커가 사라져도 본문 패턴(`{emoji} {tool_name}: "..."`)으로 잡아낸다.
  // 일반 채팅 대신 접힌 칩으로 렌더 — 삭제/복호화중/미디어는 제외.
  const isToolProgress =
    ev.getType() === EventType.RoomMessage &&
    !ev.isRedacted() &&
    isToolProgressEvent(ev);
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
    placeholder = t("msg.cantDecrypt");
  } else if (ev.getType() === EventType.RoomMessageEncrypted) {
    placeholder = t("msg.decrypting");
  } else if (ev.isRedacted()) {
    placeholder = t("msg.deleted");
  } else if (!isMedia && content.body == null) {
    placeholder = `(${content.msgtype ?? ev.getType()})`;
  }

  // 수정/삭제 가능 조건: 내 메시지 + 삭제 안 됨 + 복호화 완료
  const canModify =
    mine && !ev.isRedacted() && ev.getType() === EventType.RoomMessage;
  const canEdit = canModify && !isMedia;
  // 전달 가능: 일반 메시지(텍스트/미디어) + 삭제/복호화중 아님 (내 메시지 아니어도 가능)
  const canForward =
    !ev.isRedacted() &&
    placeholder === null &&
    ev.getType() === EventType.RoomMessage;
  // 고정 가능: 일반 메시지 + 삭제 아님 + state event 전송 권한 보유
  const canPin =
    !ev.isRedacted() &&
    placeholder === null &&
    ev.getType() === EventType.RoomMessage &&
    room.currentState.maySendStateEvent(EventType.RoomPinnedEvents, myUserId);
  const pinned = canPin && isPinned(room, ev.getId() ?? "");
  // URL 미리보기 대상 — 일반 텍스트 메시지 본문에서 추출 (미디어/삭제/툴진행 제외)
  const previewUrls =
    !ev.isRedacted() &&
    placeholder === null &&
    !isMedia &&
    !isToolProgress &&
    ev.getType() === EventType.RoomMessage &&
    typeof content.body === "string"
      ? extractPreviewUrls(content.body)
      : [];

  function startEdit() {
    setEditDraft(ev.getContent().body ?? "");
    setEditing(true);
  }

  const actions = useEventActions({
    client,
    room,
    ev,
    busy,
    editDraft,
    setEditDraft,
    setEditing,
    setBusy,
    setCopied,
  });
  const { submitEdit, remove, pin, react, resend, cancelFailed, copyMarkdown } =
    actions;
  // startEdit는 위에서 inline 정의 (setEditDraft + setEditing만 사용 — 단순)

  // 전송 상태 (local echo): null이면 서버 확정된 메시지
  const status = ev.status;
  const isFailed = status === EventStatus.NOT_SENT;
  const isPending =
    status === EventStatus.SENDING ||
    status === EventStatus.QUEUED ||
    status === EventStatus.ENCRYPTING;

  const actionBtn =
    "p-2 text-fg-1 hover:bg-bg-2 hover:text-fg-0 transition-colors";

  return (
    <div
      id={`ev-${ev.getId()}`}
      // 모바일 long-press / 데스크탑 우클릭으로 액션바 토글.
      // ※ message-body / .selectable 안에선 호출부가 stopPropagation으로 막아
      //    텍스트 선택·복사 기본 동작을 살린다 (app.css 텍스트 선택 규칙과 짝).
      {...longPress}
      className={`group relative px-5 transition-colors duration-300 hover:bg-bg-2/60 ${
        showHeader ? "pt-3 pb-0.5" : "py-0.5"
      } ${
        highlighted
          ? "!bg-amber-400/15 ring-1 ring-inset ring-amber-400/40"
          : ""
      } ${animateIn ? "msg-in" : ""} ${
        mentioned
          ? "border-l-2 border-amber-400/70 bg-amber-400/[0.06] pl-[18px]"
          : ""
      } ${mobileActive ? "bg-bg-2/60" : ""}`}
    >
      {/* 그룹 헤더: 발신자 + 시각 (+수정됨) */}
      {showHeader && (
        <div className="flex items-baseline gap-2">
          <button
            type="button"
            className="font-semibold text-fg-0 hover:underline"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setProfileAnchor((v) => (v ? null : rect));
            }}
          >
            {senderName}
          </button>
          <span
            className="font-mono text-[11px] text-fg-3"
            title={formatFullTime(ev.getTs())}
          >
            {formatTime(ev.getTs())}
          </span>
          <ShieldIcon client={client} ev={ev} />
          {ev.replacingEvent() && (
            <span className="text-[11px] text-fg-3" title={t("msg.edited")}>
              {t("msg.edited")}
            </span>
          )}
        </div>
      )}
      {!showHeader && ev.replacingEvent() && (
        <span className="sr-only">{t("msg.edited")}</span>
      )}

      {/* 액션 툴바 — 데스크탑은 hover/focus-within, 모바일은 long-press 토글.
          모바일에선 hover 자체가 없어 group-hover가 안 먹지만, focus-within은
          탭 후에도 잔존해 클릭 한 번이면 액션바가 stuck됨 → hover 가능 환경
          (마우스)에서만 자동 표시되도록 [@media(hover:hover)] 가드로 한정. */}
      {!editing && !ev.isRedacted() && (
        <div
          className={`absolute -top-3 right-5 z-10 items-center overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl [@media(hover:hover)]:group-hover:flex [@media(hover:hover)]:group-focus-within:flex ${
            mobileActive ? "flex" : "hidden"
          }`}
        >
          <button
            type="button"
            className={actionBtn}
            onClick={(e) => {
              // rect는 핸들러 안에서 즉시 읽기 — setState 콜백 시점엔 currentTarget이 null
              const rect = e.currentTarget.getBoundingClientRect();
              setPickerAnchor((v) => (v ? null : rect));
              closeMobileActive();
            }}
            title={t("message.action.react")}
          >
            <SmilePlus className="h-3.5 w-3.5" />
          </button>
          {onReply && (
            <button
              type="button"
              className={actionBtn}
              onClick={() => {
                onReply(ev);
                closeMobileActive();
              }}
              title={t("message.action.reply")}
            >
              <Reply className="h-3.5 w-3.5" />
            </button>
          )}
          {onOpenThread && (
            <button
              type="button"
              className={actionBtn}
              onClick={() => {
                onOpenThread(ev.getId()!);
                closeMobileActive();
              }}
              title={t("message.action.thread")}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
            </button>
          )}
          {canForward && (
            <button
              type="button"
              className={actionBtn}
              onClick={() => {
                setForwarding(true);
                closeMobileActive();
              }}
              title={t("message.action.forward")}
            >
              <Forward className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            className={actionBtn}
            onClick={() => {
              copyMarkdown();
              closeMobileActive();
            }}
            title={t(copied ? "common.copied" : "message.action.copyMarkdown")}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          {canPin && (
            <button
              type="button"
              className={actionBtn}
              onClick={() => {
                pin();
                closeMobileActive();
              }}
              title={t(pinned ? "message.action.unpin" : "message.action.pin")}
            >
              {pinned ? (
                <PinOff className="h-3.5 w-3.5" />
              ) : (
                <Pin className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              className={actionBtn}
              onClick={() => {
                startEdit();
                closeMobileActive();
              }}
              title={t("message.action.edit")}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {canModify && (
            <button
              type="button"
              className={actionBtn}
              onClick={() => {
                remove();
                closeMobileActive();
              }}
              title={t("message.action.delete")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      {/* 이모지 피커 — 버튼 앵커 기준 포털 (스크롤 컨테이너 영향 없음).
          lazy 분리되어 있어 첫 마운트에서 청크 fetch — Suspense fallback은
          null(피커가 즉시 안 떠도 시각 disturbance 없음). */}
      {pickerAnchor && (
        <Suspense fallback={null}>
          <EmojiPicker
            anchor={pickerAnchor}
            onPick={react}
            onClose={() => setPickerAnchor(null)}
          />
        </Suspense>
      )}
      {/* 발신자 프로필 카드 */}
      {profileAnchor && ev.getSender() && (
        <UserProfileCard
          client={client}
          room={room}
          userId={ev.getSender()!}
          anchor={profileAnchor}
          onClose={() => setProfileAnchor(null)}
        />
      )}
      {/* 전달 모달 */}
      {forwarding && (
        <ForwardModal
          client={client}
          event={ev}
          onClose={() => setForwarding(false)}
          onDone={() => setForwarding(false)}
        />
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
          <span className="flex gap-2 text-[12px] text-fg-2">
            <button
              type="submit"
              className="font-medium text-fg-0 hover:underline"
              disabled={busy}
            >
              {t("common.save")}
            </button>
            <button
              type="button"
              className="hover:underline"
              onClick={() => setEditing(false)}
            >
              {t("msg.cancelEsc")}
            </button>
          </span>
        </form>
      ) : isToolProgress ? (
        <ToolCallChip client={client} ev={ev} />
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
          <MessageBody
            client={client}
            ev={ev}
            contentVersion={contentVersion}
          />
        </div>
      )}

      {/* URL 미리보기 (텍스트 메시지에 링크가 있을 때) */}
      {!editing && previewUrls.length > 0 && (
        <UrlPreviews client={client} urls={previewUrls} />
      )}

      {/* 전송 상태 */}
      {isFailed && (
        <span className="flex items-center gap-2 text-[12px] text-red-400">
          {t("msg.sendFailed")}
          <button
            type="button"
            className="font-medium underline hover:text-red-300"
            onClick={resend}
            disabled={busy}
          >
            {t("msg.resend")}
          </button>
          <button
            type="button"
            className="text-fg-2 underline hover:text-fg-1"
            onClick={cancelFailed}
          >
            {t("common.delete")}
          </button>
        </span>
      )}
      {isPending && (
        <span className="font-mono text-[11px] text-fg-3">
          {t("msg.sending")}
        </span>
      )}

      {/* 리액션 칩 */}
      <ReactionBar client={client} room={room} ev={ev} myUserId={myUserId} />

      {/* 스레드 링크 (답글 있을 때만 — 시작은 hover 툴바에서).
          마지막 답글의 발신자 + 내용 미리보기(+이미지 썸네일)를 함께 표시 */}
      {onOpenThread && threadLength > 0 && (
        <button
          type="button"
          className="group/thread mt-1.5 flex min-h-[22px] max-w-full items-center gap-1.5 rounded-md py-0.5 pr-2 text-[12px] text-fg-2 hover:bg-bg-2 hover:text-fg-0"
          onClick={() => onOpenThread(ev.getId()!)}
        >
          <MessageSquareText className="h-3.5 w-3.5 shrink-0 text-fg-3" />
          <span className="shrink-0 font-medium text-fg-1">
            답글 {threadLength}
          </span>
          {thread?.replyToEvent && (
            <>
              <span className="shrink-0 text-fg-3">·</span>
              <span className="shrink-0 font-medium text-fg-2">
                {thread.replyToEvent.sender?.name ??
                  thread.replyToEvent.getSender()}
              </span>
              {(() => {
                const t = thumbnailSource(thread.replyToEvent);
                return t ? (
                  <QuoteThumbnail client={client} source={t} size={16} />
                ) : null;
              })()}
              <span className="truncate text-fg-2">
                {quotePreview(thread.replyToEvent)}
              </span>
              <span className="ml-auto shrink-0 pl-1 font-mono text-[11px] text-fg-3">
                {formatTime(thread.replyToEvent.getTs())}
              </span>
            </>
          )}
        </button>
      )}

      {/* 읽음 표시 — 우측 하단 아바타 스택 */}
      <ReadReceipts client={client} room={room} ev={ev} myUserId={myUserId} />
    </div>
  );
};

/** memo로 감싸 가상 스크롤 재렌더를 차단한다. 과거 로드 등으로 events 배열이
 *  통째로 교체돼도, 개별 행의 props(ev 참조/showHeader/highlighted 등)가
 *  안 바뀐 행은 재렌더를 건너뛴다 → 보이는 행들의 불필요한 리렌더 방지.
 *  ev는 SDK가 같은 MatrixEvent 인스턴스를 재사용하므로 참조 비교가 유효하다.
 *  (내용 변화는 Decrypted/Replaced 리스너가 별도 refresh로 처리) */
export const EventLine = memo(EventLineInner);

/** E2EE 메시지 shield 아이콘. NONE이면 표시 안 함. */
function ShieldIcon({ client, ev }: { client: MatrixClient; ev: MatrixEvent }) {
  const t = useT();
  const info = useShield(client, ev);
  if (!info || info.colour === EventShieldColour.NONE) return null;
  const reasonKey = (() => {
    switch (info.reason) {
      case EventShieldReason.UNVERIFIED_IDENTITY:
        return "shield.unverifiedIdentity";
      case EventShieldReason.UNSIGNED_DEVICE:
        return "shield.unsignedDevice";
      case EventShieldReason.UNKNOWN_DEVICE:
        return "shield.unknownDevice";
      case EventShieldReason.AUTHENTICITY_NOT_GUARANTEED:
        return "shield.authenticityNotGuaranteed";
      case EventShieldReason.MISMATCHED_SENDER_KEY:
        return "shield.mismatchedSender";
      case EventShieldReason.SENT_IN_CLEAR:
        return "shield.unsafeSource";
      default:
        return null;
    }
  })();
  const isRed = info.colour === EventShieldColour.RED;
  const titleBase = isRed ? t("shield.red.title") : t("shield.grey.title");
  const title = reasonKey ? `${titleBase} — ${t(reasonKey)}` : titleBase;
  const Icon = isRed ? ShieldAlert : ShieldQuestion;
  return (
    <span
      title={title}
      className={`shrink-0 ${isRed ? "text-red-400" : "text-fg-3"}`}
    >
      <Icon className="h-3 w-3" />
    </span>
  );
}
