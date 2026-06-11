import { Paperclip, SendHorizontal, X } from "lucide-react";
import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk";
import { useRef, useState } from "react";
import { uploadAndSendFile } from "../lib/media";
import { quotePreview } from "../lib/reply";
import { useSendTyping, useTypingMembers } from "../lib/typing";

/** 메시지 입력창 — 룸/스레드 100% 동일 (005 디자인).
 *  타이핑 표시(수신/발신), 파일 첨부(버튼/붙여넣기), 답장 인용 표시.
 *  전송 동작만 onSend 콜백으로 위임 (룸: sendTextMessage / 스레드: thread reply) */
export function MessageInput({
  client,
  room,
  placeholder,
  onSend,
  replyTo,
  onCancelReply,
}: {
  client: MatrixClient;
  room: Room;
  placeholder: string;
  /** 텍스트 전송 (답장 관계 포함 여부는 호출부 책임) */
  onSend: (text: string) => Promise<void>;
  replyTo?: MatrixEvent | null;
  onCancelReply?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingNames = useTypingMembers(client, room);
  const { notifyTyping, clearTyping } = useSendTyping(client, room.roomId);

  async function send() {
    if (!draft.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(draft);
      setDraft("");
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
        await uploadAndSendFile(client, room.roomId, file, (loaded, total) => {
          const pct = total ? Math.round((loaded / total) * 100) : 0;
          setUploading(`${file.name} 업로드 중... ${pct}%`);
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="shrink-0 px-5 pb-4">
      {/* 상태 줄: 높이 24px 고정 (타이핑/업로드/에러) */}
      <p className="flex h-6 items-center gap-1.5 text-[11px] text-fg-3">
        {error ? (
          <span className="text-red-400">⚠ {error}</span>
        ) : uploading ? (
          <span className="animate-pulse">{uploading}</span>
        ) : typingNames.length > 0 ? (
          <span className="animate-pulse">
            {typingNames.join(", ")} 입력 중…
          </span>
        ) : null}
      </p>

      {/* 답장 인용 바 */}
      {replyTo && (
        <div className="mb-1 flex h-[22px] items-center gap-1.5 rounded-md border-l-2 border-line-strong bg-bg-2 pl-2 pr-1 text-[11px] text-fg-2">
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

      <form
        className="flex items-end gap-1 rounded-lg border border-line bg-bg-2 px-2 py-1.5 transition-colors focus-within:border-line-strong"
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
        <button
          type="button"
          className="rounded-md p-1.5 text-fg-2 hover:text-fg-0 disabled:opacity-50"
          disabled={!!uploading}
          onClick={() => fileInputRef.current?.click()}
          title="파일 첨부"
        >
          <Paperclip className="h-[15px] w-[15px]" />
        </button>
        <input
          className="min-w-0 flex-1 bg-transparent py-1 text-fg-0 outline-none placeholder:text-fg-3"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (e.target.value) notifyTyping();
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
          type="submit"
          className="rounded-md p-1.5 text-fg-2 hover:text-fg-0 disabled:opacity-50"
          disabled={sending || !draft.trim()}
          title="전송"
        >
          <SendHorizontal className="h-[15px] w-[15px]" />
        </button>
      </form>
    </div>
  );
}
