import type { MatrixClient, MatrixEvent } from "matrix-js-sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { forwardEvent } from "../lib/matrix";
import { quotePreview } from "../lib/reply";
import { RoomAvatar } from "./Avatar";

/** 메시지 전달 모달.
 *  - 참여중인 방 목록에서 대상 선택 (이름 검색)
 *  - 선택 시 원본 content를 복사해 그 방으로 전송 후 onDone
 *  - 백드롭/Esc로 닫힘 */
export function ForwardModal({
  client,
  event,
  onClose,
  onDone,
}: {
  client: MatrixClient;
  event: MatrixEvent;
  onClose: () => void;
  onDone: (roomId: string) => void;
}) {
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 참여중인 방(스페이스 제외) — 이름순. 검색어로 필터.
  const rooms = useMemo(() => {
    const all = client
      .getRooms()
      .filter((r) => r.getMyMembership() === "join" && !r.isSpaceRoom());
    const q = term.trim().toLowerCase();
    const filtered = q
      ? all.filter((r) => r.name.toLowerCase().includes(q))
      : all;
    return filtered.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [client, term]);

  // 전달 대상 미리보기 텍스트
  const preview = quotePreview(event);

  async function forward(roomId: string) {
    if (busy) return;
    setBusy(roomId);
    setError(null);
    try {
      await forwardEvent(client, event, roomId);
      onDone(roomId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[15vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-[420px] max-w-[90vw] overflow-hidden rounded-lg border border-line bg-bg-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div className="border-b border-line px-4 py-2.5">
          <h2 className="font-semibold text-fg-0">메시지 전달</h2>
          {preview && (
            <p className="mt-0.5 truncate text-[12px] text-fg-3">{preview}</p>
          )}
        </div>
        <div className="p-3">
          <input
            ref={inputRef}
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="방 이름 검색"
            className="w-full rounded-md border border-line bg-bg-2 px-2.5 py-1.5 text-[13px] text-fg-0 outline-none transition-colors placeholder:text-fg-3 focus:bg-bg-3"
          />
          {error && <p className="mt-2 text-[12px] text-red-400">{error}</p>}
          <div className="mt-2 max-h-[40vh] overflow-y-auto">
            {rooms.map((r) => (
              <button
                key={r.roomId}
                type="button"
                disabled={busy !== null}
                onClick={() => forward(r.roomId)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-bg-2 disabled:opacity-50"
              >
                <RoomAvatar client={client} room={r} size={32} />
                <span className="min-w-0 flex-1 truncate text-[14px] text-fg-0">
                  {r.name}
                </span>
                {busy === r.roomId && (
                  <span className="text-[12px] text-fg-3">전달 중…</span>
                )}
              </button>
            ))}
            {rooms.length === 0 && (
              <p className="px-2 py-6 text-center text-[13px] text-fg-3">
                일치하는 방이 없어
              </p>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
