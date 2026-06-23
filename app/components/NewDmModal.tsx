import type { MatrixClient } from "matrix-js-sdk";
import { useEffect, useRef, useState } from "react";
import { looksLikeUserId, useUserSearch } from "../hooks/useUserSearch";
import { useT } from "../lib/i18n";
import { startDirectMessage } from "../lib/matrix";
import { UserResultRow } from "./UserResultRow";

/** 새 DM 시작 모달 (B-final 톤). */
export function NewDmModal({
  client,
  onClose,
  onStarted,
}: {
  client: MatrixClient;
  onClose: () => void;
  onStarted: (roomId: string) => void;
}) {
  const t = useT();
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, searching } = useUserSearch(client, term);

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
        className="w-[420px] max-w-[90vw] overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <header className="flex h-12 items-center border-b border-line px-5">
          <h2 className="font-semibold text-fg-0">{t("modal.newDm.title")}</h2>
        </header>
        <label className="flex items-center gap-3 border-b border-line px-5 py-2.5">
          <span className="w-12 shrink-0 text-[12px] text-fg-3">
            {t("common.search")}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t("ph.searchUser")}
            className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none placeholder:text-fg-3"
          />
        </label>
        {error && (
          <p className="border-b border-line px-5 py-2 text-[12px] text-red-400">
            {error}
          </p>
        )}
        <div className="max-h-[40vh] overflow-y-auto">
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
              <p className="px-5 py-6 text-center text-[13px] text-fg-3">
                {t("newDm.empty")}
              </p>
            )}
          {searching && (
            <p className="px-5 py-6 text-center text-[13px] text-fg-3">
              {t("newDm.searching")}
            </p>
          )}
          {trimmed.length === 0 && (
            <p className="px-5 py-6 text-center text-[13px] text-fg-3">
              {t("newDm.enterName")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
