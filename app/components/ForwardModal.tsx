import type { MatrixClient, MatrixEvent } from "matrix-js-sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { forwardEvent } from "../lib/matrix";
import { quotePreview } from "../lib/reply";
import { RoomAvatar } from "./Avatar";

/** 메시지 전달 모달 (B-final 톤). */
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
        className="w-[420px] max-w-[90vw] overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <header className="flex h-12 items-center border-b border-line px-5">
          <h2 className="font-semibold text-fg-0">메시지 전달</h2>
        </header>
        {preview && (
          <p className="truncate border-b border-line bg-bg-2/40 px-5 py-2 text-[12px] text-fg-3">
            {preview}
          </p>
        )}
        <label className="flex items-center gap-3 border-b border-line px-5 py-2.5">
          <span className="w-12 shrink-0 text-[12px] text-fg-3">검색</span>
          <input
            ref={inputRef}
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="방 이름"
            className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none placeholder:text-fg-3"
          />
        </label>
        {error && (
          <p className="border-b border-line px-5 py-2 text-[12px] text-red-400">
            {error}
          </p>
        )}
        <div className="max-h-[40vh] overflow-y-auto">
          {rooms.map((r) => (
            <button
              key={r.roomId}
              type="button"
              disabled={busy !== null}
              onClick={() => forward(r.roomId)}
              className="flex w-full items-center gap-2.5 border-b border-line px-5 py-2 text-left last:border-b-0 hover:bg-bg-2 disabled:opacity-50"
            >
              <RoomAvatar client={client} room={r} size={28} />
              <span className="min-w-0 flex-1 truncate text-[13px] text-fg-0">
                {r.name}
              </span>
              {busy === r.roomId && (
                <span className="text-[12px] text-fg-3">전달 중…</span>
              )}
            </button>
          ))}
          {rooms.length === 0 && (
            <p className="px-5 py-6 text-center text-[13px] text-fg-3">
              일치하는 방이 없어
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
