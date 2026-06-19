import type { MatrixClient } from "matrix-js-sdk";
import { useEffect, useRef, useState } from "react";
import { looksLikeUserId, useUserSearch } from "../hooks/useUserSearch";
import { startDirectMessage } from "../lib/matrix";
import { UserResultRow } from "./UserResultRow";

/** 새 DM 시작 모달.
 *  - 사용자 디렉토리 검색(디바운스 250ms) + 직접 @user:server 입력 지원
 *  - 선택 시 기존 DM 있으면 그 방으로, 없으면 생성 후 onStarted(roomId) 콜백
 *  - 백드롭/Esc로 닫힘 */
export function NewDmModal({
  client,
  onClose,
  onStarted,
}: {
  client: MatrixClient;
  onClose: () => void;
  onStarted: (roomId: string) => void;
}) {
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, searching } = useUserSearch(client, term);

  // 마운트 시 포커스
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Esc로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function start(userId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const roomId = await startDirectMessage(client, userId);
      onStarted(roomId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const trimmed = term.trim();
  // 검색 결과에 없는 완전한 MXID를 직접 입력한 경우, 그 자체를 후보로 노출
  const directEntry =
    looksLikeUserId(trimmed) && !results.some((r) => r.userId === trimmed)
      ? trimmed
      : null;

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
          <h2 className="font-semibold text-fg-0">새 대화 시작</h2>
        </div>
        <div className="p-3">
          <input
            ref={inputRef}
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="이름 또는 @user:server 검색"
            className="w-full rounded-md border border-line bg-bg-2 px-3 py-2 text-fg-0 outline-none transition-colors placeholder:text-fg-3 focus:bg-bg-3"
          />
          {error && <p className="mt-2 text-[12px] text-red-400">{error}</p>}
          <div className="mt-2 max-h-[40vh] overflow-y-auto">
            {directEntry && (
              <UserResultRow
                client={client}
                userId={directEntry}
                displayName={undefined}
                avatarUrl={undefined}
                busy={busy}
                onClick={() => start(directEntry)}
              />
            )}
            {results.map((r) => (
              <UserResultRow
                key={r.userId}
                client={client}
                userId={r.userId}
                displayName={r.displayName}
                avatarUrl={r.avatarUrl}
                busy={busy}
                onClick={() => start(r.userId)}
              />
            ))}
            {!searching &&
              !directEntry &&
              results.length === 0 &&
              trimmed.length > 0 && (
                <p className="px-2 py-6 text-center text-[13px] text-fg-3">
                  검색 결과 없음. @user:server 형태로 직접 입력할 수도 있어요.
                </p>
              )}
            {searching && (
              <p className="px-2 py-6 text-center text-[13px] text-fg-3">
                검색 중…
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
