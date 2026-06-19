import type { MatrixClient } from "matrix-js-sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { createGroupRoom, getJoinedSpaces } from "../lib/matrix";

/** 새 방 만들기 모달.
 *  - 방 이름(필수) + 주제(선택) + E2EE 토글 + 부모 Space(선택)
 *  - 생성 시 onCreated(roomId) 콜백
 *  - 백드롭/Esc로 닫힘
 *  - defaultSpaceId: Space 홈에서 "여기에 방 추가"로 열 때 미리 선택 */
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

  // 참여중 Space 목록 (드롭다운 소스)
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
        className="w-[420px] max-w-[90vw] overflow-hidden rounded-xl border border-line bg-bg-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-semibold text-fg-0">새 방 만들기</h2>
        </div>
        <div className="flex flex-col gap-3 p-4">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-fg-2">방 이름</span>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
              }}
              placeholder="예: 팀 잡담"
              className="w-full rounded-md border border-line bg-bg-2 px-3 py-2 text-fg-0 outline-none transition-colors placeholder:text-fg-3 focus:bg-bg-3"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-fg-2">주제 (선택)</span>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
              }}
              placeholder="방 설명"
              className="w-full rounded-md border border-line bg-bg-2 px-3 py-2 text-fg-0 outline-none transition-colors placeholder:text-fg-3 focus:bg-bg-3"
            />
          </label>
          {spaces.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-fg-2">상위 Space (선택)</span>
              <select
                value={parentSpaceId}
                onChange={(e) => setParentSpaceId(e.target.value)}
                className="w-full rounded-md border border-line bg-bg-2 px-3 py-2 text-fg-0 outline-none transition-colors focus:bg-bg-3"
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
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-fg-1">
            <input
              type="checkbox"
              checked={encrypted}
              onChange={(e) => setEncrypted(e.target.checked)}
              className="accent-fg-1"
            />
            종단간 암호화 (E2EE)
          </label>
          {error && <p className="text-[12px] text-red-400">{error}</p>}
          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-[13px] text-fg-2 hover:bg-bg-2 hover:text-fg-0"
            >
              취소
            </button>
            <button
              type="button"
              onClick={create}
              disabled={busy || !name.trim()}
              className="rounded-lg bg-bg-3 px-3 py-1.5 text-[13px] font-medium text-fg-0 hover:bg-line-strong disabled:opacity-50"
            >
              {busy ? "만드는 중…" : "만들기"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
