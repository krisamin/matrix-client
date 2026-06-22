import type { MatrixClient } from "matrix-js-sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { createGroupRoom, getJoinedSpaces } from "../lib/matrix";

/** 새 방 만들기 모달 (B-final 톤: 빽빽한 그리드 + 풀폭 버튼). */
export function NewRoomModal({
  client,
  onClose,
  onCreated,
  defaultSpaceId,
}: {
  client: MatrixClient;
  onClose: () => void;
  onCreated: (roomId: string) => void;
  defaultSpaceId?: string;
}) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [encrypted, setEncrypted] = useState(true);
  const [parentSpaceId, setParentSpaceId] = useState(defaultSpaceId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const spaces = useMemo(() => getJoinedSpaces(client), [client]);

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

  async function create() {
    if (busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const roomId = await createGroupRoom(client, {
        name,
        topic,
        encrypted,
        parentSpaceId: parentSpaceId || undefined,
      });
      onCreated(roomId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
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
          <h2 className="font-semibold text-fg-0">새 방 만들기</h2>
        </header>
        <div className="flex flex-col divide-y divide-line">
          <label className="flex items-center gap-3 px-5 py-2.5">
            <span className="w-20 shrink-0 text-[12px] text-fg-3">방 이름</span>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
              }}
              placeholder="예: 팀 잡담"
              className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none placeholder:text-fg-3"
            />
          </label>
          <label className="flex items-center gap-3 px-5 py-2.5">
            <span className="w-20 shrink-0 text-[12px] text-fg-3">주제</span>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
              }}
              placeholder="방 설명 (선택)"
              className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none placeholder:text-fg-3"
            />
          </label>
          {spaces.length > 0 && (
            <label className="flex items-center gap-3 px-5 py-2.5">
              <span className="w-20 shrink-0 text-[12px] text-fg-3">
                상위 Space
              </span>
              <select
                value={parentSpaceId}
                onChange={(e) => setParentSpaceId(e.target.value)}
                className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none"
              >
                <option value="">없음 (최상위 방)</option>
                {spaces.map((s) => (
                  <option key={s.roomId} value={s.roomId}>
                    {s.name || s.roomId}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex cursor-pointer items-center gap-3 px-5 py-2.5">
            <span className="w-20 shrink-0 text-[12px] text-fg-3">암호화</span>
            <input
              type="checkbox"
              checked={encrypted}
              onChange={(e) => setEncrypted(e.target.checked)}
              className="accent-fg-1"
            />
            <span className="text-[13px] text-fg-1">종단간 암호화 (E2EE)</span>
          </label>
          {error && (
            <p className="px-5 py-2.5 text-[12px] text-red-400">{error}</p>
          )}
        </div>
        <div className="flex border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border-r border-line py-2.5 text-[13px] text-fg-2 hover:bg-bg-2 hover:text-fg-0"
          >
            취소
          </button>
          <button
            type="button"
            onClick={create}
            disabled={busy || !name.trim()}
            className="flex-1 bg-bg-2 py-2.5 text-[13px] font-medium text-fg-0 hover:bg-bg-3 disabled:opacity-50"
          >
            {busy ? "만드는 중…" : "만들기"}
          </button>
        </div>
      </div>
    </div>
  );
}
