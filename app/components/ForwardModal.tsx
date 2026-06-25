import type { MatrixClient, MatrixEvent } from "matrix-js-sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../lib/i18n";
import { forwardEvent } from "../lib/matrix";
import { quotePreview } from "../lib/reply";
import { RoomAvatar } from "./Avatar";
import { EmptyState } from "./EmptyState";
import { Field, FieldGroup, TextInput } from "./Form";
import { Modal, ModalHeader } from "./Modal";
import { SectionBanner } from "./SectionBanner";

/** 메시지 전달 모달. */
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
  const t = useT();
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
    <Modal onClose={onClose} size="md">
      <ModalHeader title={t("modal.forward.title")} />
      {preview && (
        <SectionBanner className="shrink-0 truncate">{preview}</SectionBanner>
      )}
      <FieldGroup>
        <Field label={t("common.search")} labelWidth="w-12">
          <TextInput
            ref={inputRef}
            value={term}
            onChange={setTerm}
            placeholder={t("ph.searchRoom")}
          />
        </Field>
      </FieldGroup>
      {error && (
        <p className="shrink-0 border-b border-line px-4 py-2 text-[12px] text-red-400">
          {error}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rooms.map((r) => (
          <button
            key={r.roomId}
            type="button"
            disabled={busy !== null}
            onClick={() => forward(r.roomId)}
            className="flex w-full items-center gap-2.5 border-b border-line px-4 py-2 text-left last:border-b-0 hover:bg-bg-2 disabled:opacity-50"
          >
            <RoomAvatar client={client} room={r} size={28} />
            <span className="min-w-0 flex-1 truncate text-[13px] text-fg-0">
              {r.name}
            </span>
            {busy === r.roomId && (
              <span className="text-[12px] text-fg-3">
                {t("forward.sending")}
              </span>
            )}
          </button>
        ))}
        {rooms.length === 0 && (
          <EmptyState size="sm" body={t("forward.empty")} />
        )}
      </div>
    </Modal>,
    document.body,
  );
}
