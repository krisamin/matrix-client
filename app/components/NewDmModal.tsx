import type { MatrixClient } from "matrix-js-sdk";
import { useEffect, useRef, useState } from "react";
import { looksLikeUserId, useUserSearch } from "../hooks/useUserSearch";
import { useT } from "../lib/i18n";
import { startDirectMessage } from "../lib/matrix";
import { Field, FieldGroup, TextInput } from "./Form";
import { Modal, ModalHeader } from "./Modal";
import { UserResultRow } from "./UserResultRow";

/** 새 DM 시작 모달. */
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
    <Modal onClose={onClose} size="md">
      <ModalHeader title={t("modal.newDm.title")} />
      <FieldGroup>
        <Field label={t("common.search")} labelWidth="w-12">
          <TextInput
            ref={inputRef}
            value={term}
            onChange={setTerm}
            placeholder={t("ph.searchUser")}
          />
        </Field>
      </FieldGroup>
      {error && (
        <p className="shrink-0 border-b border-line px-5 py-2 text-[12px] text-red-400">
          {error}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
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
      </div>
    </Modal>
  );
}
