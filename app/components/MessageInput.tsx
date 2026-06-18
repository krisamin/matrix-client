import { Paperclip, SendHorizontal, SmilePlus, X } from "lucide-react";
import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk";
import { useEffect, useRef, useState } from "react";
import { uploadAndSendFile } from "../lib/media";
import { type Mention, searchMembers } from "../lib/mention";
import { quotePreview } from "../lib/reply";
import { useSendTyping } from "../lib/typing";
import { Avatar } from "./Avatar";
import { EmojiPicker } from "./EmojiPicker";

/** 입력창 최대 높이(px). 이 높이를 넘으면 textarea 내부 스크롤. */
const MAX_INPUT_PX = 200;

/** 메시지 입력창 — 룸/스레드 100% 동일 (005 디자인).
 *  타이핑 표시(수신/발신), 파일 첨부(버튼/붙여넣기), 답장 인용,
 *  @멘션 자동완성 (↑↓/Tab/Enter 선택, Esc 닫기).
 *  전송 동작만 onSend 콜백으로 위임 (룸: sendTextMessage / 스레드: thread reply) */
export function MessageInput({
  client,
  room,
  placeholder,
  onSend,
  replyTo,
  onCancelReply,
  uploadRef,
  threadId,
}: {
  client: MatrixClient;
  room: Room;
  placeholder: string;
  /** 텍스트 전송 (답장 관계 포함 여부는 호출부 책임) */
  onSend: (text: string, mentions: Mention[]) => Promise<void>;
  replyTo?: MatrixEvent | null;
  onCancelReply?: () => void;
  /** 외부(드롭존 등)에서 파일 업로드를 트리거할 수 있게 sendFiles를 노출 */
  uploadRef?: React.MutableRefObject<((files: File[]) => void) | null>;
  /** 지정 시 파일 업로드를 해당 스레드로 전송 */
  threadId?: string;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const { notifyTyping, clearTyping } = useSendTyping(client, room.roomId);
  // 멘션: 자동완성 상태 + 본문에 삽입된 멘션 누적 (전송 시 content 빌드용)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionsRef = useRef<Mention[]>([]);
  // 이모지 피커 (버튼 rect 앵커, null = 닫힘)
  const [emojiAnchor, setEmojiAnchor] = useState<DOMRect | null>(null);
  const myUserId = client.getUserId() ?? "";

  // textarea auto-grow: 내용에 따라 높이를 1줄~최대(MAX_INPUT_PX)까지.
  // 1순위는 CSS field-sizing:content(아래 className) — JS로 height="auto" 리셋해
  // scrollHeight를 재는 방식은 매 입력마다 textarea를 잠깐 collapse→restore로
  // 출렁여, 그 출렁임이 타임라인 뷰포트를 흔들어 virtua onScroll이 stick을
  // 풀어버린다(→ 입력 중 자동 바닥추적이 끊기고 전송 후에도 안 내려감). CSS가
  // 처리하면 출렁임이 없다. 미지원 브라우저에서만 JS 측정으로 폴백.
  // biome-ignore lint/correctness/useExhaustiveDependencies: draft 변화로 재측정
  useEffect(() => {
    const el = textInputRef.current;
    if (!el) return;
    if (CSS.supports("field-sizing", "content")) return; // CSS가 처리
    el.style.height = "auto"; // 줄어들 때도 정확히 재측정하려면 먼저 리셋
    const needed = el.scrollHeight;
    el.style.height = `${Math.min(needed, MAX_INPUT_PX)}px`;
    el.style.overflowY = needed > MAX_INPUT_PX ? "auto" : "hidden";
  }, [draft]);

  const candidates =
    mentionQuery != null ? searchMembers(room, mentionQuery, myUserId) : [];

  /** 커서 앞 텍스트에서 "@쿼리" 추출 (공백 없는 연속 구간) */
  function detectMention(value: string, cursor: number) {
    const before = value.slice(0, cursor);
    const at = before.lastIndexOf("@");
    if (at < 0) return null;
    // @ 바로 앞이 글자면 이메일 등으로 판단, 멘션 아님
    if (at > 0 && /\S/.test(before[at - 1])) return null;
    const query = before.slice(at + 1);
    if (/\s/.test(query)) return null;
    return { at, query };
  }

  function onDraftChange(value: string) {
    setDraft(value);
    if (value) notifyTyping();
    const cursor = textInputRef.current?.selectionStart ?? value.length;
    const m = detectMention(value, cursor);
    setMentionQuery(m?.query ?? null);
    setMentionIndex(0);
  }

  /** 자동완성 선택 → 본문의 "@쿼리"를 표시이름으로 치환 */
  function pickMention(name: string, userId: string) {
    const input = textInputRef.current;
    const cursor = input?.selectionStart ?? draft.length;
    const m = detectMention(draft, cursor);
    if (!m) return;
    const inserted = `${name} `;
    const next = draft.slice(0, m.at) + inserted + draft.slice(cursor);
    mentionsRef.current.push({ userId, name });
    setDraft(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      input?.focus();
      const pos = m.at + inserted.length;
      input?.setSelectionRange(pos, pos);
    });
  }

  /** 피커 선택 → 커서 위치에 이모지 삽입 */
  function insertEmoji(emoji: string) {
    const input = textInputRef.current;
    const pos = input?.selectionStart ?? draft.length;
    const next = draft.slice(0, pos) + emoji + draft.slice(pos);
    setDraft(next);
    requestAnimationFrame(() => {
      input?.focus();
      const p = pos + emoji.length;
      input?.setSelectionRange(p, p);
    });
  }

  async function send() {
    if (!draft.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(draft, mentionsRef.current);
      setDraft("");
      mentionsRef.current = [];
      setMentionQuery(null);
      clearTyping();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  async function sendFiles(files: FileList | File[]) {
    if (uploading) return;
    setError(null);
    try {
      for (const file of Array.from(files)) {
        setUploading(`${file.name} 업로드 중...`);
        await uploadAndSendFile(
          client,
          room.roomId,
          file,
          (loaded, total) => {
            const pct = total ? Math.round((loaded / total) * 100) : 0;
            setUploading(`${file.name} 업로드 중... ${pct}%`);
          },
          threadId,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(null);
    }
  }

  // 드롭존이 부를 수 있게 최신 sendFiles 바인딩 (렌더마다 갱신)
  if (uploadRef) uploadRef.current = sendFiles;

  return (
    <div className="relative shrink-0">
      {/* 멘션 자동완성 팝업 — 입력 바 위 오버레이 */}
      {candidates.length > 0 && (
        <div className="absolute inset-x-3 bottom-full z-20 mb-1 overflow-hidden rounded-lg border border-line bg-bg-2 shadow-xl">
          {candidates.map((m, i) => (
            <button
              key={m.userId}
              type="button"
              className={`flex h-8 w-full items-center gap-2 px-3 text-left ${
                i === mentionIndex ? "bg-bg-3 text-fg-0" : "text-fg-1"
              }`}
              onMouseEnter={() => setMentionIndex(i)}
              onClick={() => pickMention(m.name, m.userId)}
            >
              <Avatar
                client={client}
                mxcUrl={m.getMxcAvatarUrl()}
                name={m.name}
                shape="round"
                size={16}
              />
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {m.name}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-fg-3">
                {m.userId}
              </span>
            </button>
          ))}
        </div>
      )}
      {/* 상태 줄: 업로드/에러 — 입력 바 위 오버레이 (레이아웃 영향 없음).
          타이핑 표시는 Timeline 맨 아래 행으로 옮겨 메시지를 안 가린다. */}
      {(error || uploading) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-full z-10 flex justify-start px-4 pb-1">
          <span className="msg-in flex items-center gap-1.5 rounded-full border border-line bg-bg-2/95 px-2.5 py-0.5 text-[11px] text-fg-2 shadow-lg backdrop-blur">
            {error ? (
              <span className="text-red-400">⚠ {error}</span>
            ) : (
              <span className="animate-pulse">{uploading}</span>
            )}
          </span>
        </div>
      )}

      {/* 답장 인용 바 */}
      {replyTo && (
        <div className="flex h-8 items-center gap-1.5 border-t border-line bg-bg-1 px-5 text-[12px] text-fg-2">
          <span className="shrink-0 font-medium text-fg-1">
            {replyTo.sender?.name ?? replyTo.getSender()}
          </span>
          <span className="min-w-0 flex-1 truncate">
            {quotePreview(replyTo)}
          </span>
          <button
            type="button"
            className="shrink-0 rounded p-0.5 hover:text-fg-0"
            onClick={onCancelReply}
            title="답장 취소"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* 입력 바: 헤더와 대칭 — 보더탑 + 좌우 꽉 참. 세로 패딩은 textarea 내부로
          넣어(py-3) 입력 영역이 바 위아래로 꽉 차고, 스크롤이 끝과 끝까지 흐른다.
          멀티라인이라 items-end로 버튼은 아래 정렬, textarea만 위로 자란다. */}
      <form
        className="flex min-h-12 items-end gap-1 border-t border-line bg-bg-1 px-3 transition-colors focus-within:bg-bg-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) sendFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <textarea
          ref={textInputRef}
          rows={1}
          className="min-h-12 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-1 py-3 text-[15px] text-fg-0 leading-6 outline-none placeholder:text-fg-3"
          style={{ maxHeight: MAX_INPUT_PX, fieldSizing: "content" }}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            // 멘션 자동완성이 열려 있으면 그 키 조작 우선 (↑↓/Tab/Enter/Esc)
            if (candidates.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setMentionIndex((i) => (i + 1) % candidates.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setMentionIndex(
                  (i) => (i - 1 + candidates.length) % candidates.length,
                );
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                // 자동완성 선택 (단, Cmd/Ctrl+Enter는 전송으로 빠지게 둠)
                if (e.key === "Tab" || !(e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  const m = candidates[mentionIndex];
                  if (m) pickMention(m.name, m.userId);
                  return;
                }
              } else if (e.key === "Escape") {
                setMentionQuery(null);
                return;
              }
            }
            // Cmd/Ctrl + Enter = 전송. 그냥 Enter = 줄바꿈(기본 동작 유지).
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length) {
              e.preventDefault();
              sendFiles(files);
            }
          }}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="flex h-12 w-9 shrink-0 items-center justify-center rounded-md text-fg-2 hover:bg-bg-2 hover:text-fg-0 disabled:opacity-50"
          disabled={!!uploading}
          onClick={() => fileInputRef.current?.click()}
          title="파일 첨부"
        >
          <Paperclip className="h-[15px] w-[15px]" />
        </button>
        <button
          type="button"
          className="flex h-12 w-9 shrink-0 items-center justify-center rounded-md text-fg-2 hover:bg-bg-2 hover:text-fg-0"
          title="이모지"
          onClick={(e) => {
            // rect는 핸들러 안에서 즉시 읽기 — setState 콜백 시점엔 currentTarget이 null
            const rect = e.currentTarget.getBoundingClientRect();
            setEmojiAnchor((v) => (v ? null : rect));
          }}
        >
          <SmilePlus className="h-[15px] w-[15px]" />
        </button>
        <button
          type="submit"
          className="flex h-12 w-9 shrink-0 items-center justify-center rounded-md text-fg-2 hover:bg-bg-2 hover:text-fg-0 disabled:opacity-50"
          disabled={sending || !draft.trim()}
          title="전송 (⌘/Ctrl + Enter)"
        >
          <SendHorizontal className="h-[15px] w-[15px]" />
        </button>
      </form>
      {emojiAnchor && (
        <EmojiPicker
          anchor={emojiAnchor}
          onPick={insertEmoji}
          onClose={() => setEmojiAnchor(null)}
        />
      )}
    </div>
  );
}
