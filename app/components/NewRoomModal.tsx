import { ChevronDown, ChevronRight } from "lucide-react";
import type {
  GuestAccess,
  HistoryVisibility,
  JoinRule,
  MatrixClient,
  Visibility,
} from "matrix-js-sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { createGroupRoom, getJoinedSpaces } from "../lib/matrix";
import { Field, FieldGroup, Select, TextInput } from "./Form";
import { Modal, ModalFooter, ModalHeader } from "./Modal";

/** 새 방 만들기 모달 — 공용 Modal/Form 사용. */
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
  const t = useT();
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [encrypted, setEncrypted] = useState(true);
  const [parentSpaceId, setParentSpaceId] = useState(defaultSpaceId ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>(
    "private" as Visibility,
  );
  const [aliasLocalpart, setAliasLocalpart] = useState("");
  const [joinRule, setJoinRule] = useState<JoinRule | "">("");
  const [guestAccess, setGuestAccess] = useState<GuestAccess | "">("");
  const [historyVisibility, setHistoryVisibility] = useState<
    HistoryVisibility | ""
  >("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const spaces = useMemo(() => getJoinedSpaces(client), [client]);
  const myDomain = (client.getUserId() ?? "").split(":")[1] ?? "";
  const aliasPreview = aliasLocalpart.trim()
    ? `#${aliasLocalpart.trim()}:${myDomain}`
    : "";

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const aliasInvalid =
    aliasLocalpart.trim().length > 0 &&
    !/^[a-zA-Z0-9._-]+$/.test(aliasLocalpart.trim());

  async function create() {
    if (busy || !name.trim() || aliasInvalid) return;
    setBusy(true);
    setError(null);
    try {
      const roomId = await createGroupRoom(client, {
        name,
        topic,
        encrypted,
        parentSpaceId: parentSpaceId || undefined,
        visibility: visibility || undefined,
        aliasLocalpart: aliasLocalpart.trim() || undefined,
        joinRule: (joinRule as JoinRule) || undefined,
        guestAccess: (guestAccess as GuestAccess) || undefined,
        historyVisibility:
          (historyVisibility as HistoryVisibility) || undefined,
      });
      onCreated(roomId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} size="md">
      <ModalHeader title={t("modal.newRoom.title")} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <FieldGroup>
          <Field label={t("field.roomName")}>
            <TextInput
              ref={inputRef}
              value={name}
              onChange={setName}
              placeholder={t("ph.roomName")}
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
              }}
            />
          </Field>
          <Field label={t("field.topic")}>
            <TextInput
              value={topic}
              onChange={setTopic}
              placeholder={t("ph.roomDesc")}
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
              }}
            />
          </Field>
          {spaces.length > 0 && (
            <Field label={t("field.parentSpace")}>
              <Select value={parentSpaceId} onChange={setParentSpaceId}>
                <option value="">{t("alias.noSpace")}</option>
                {spaces.map((s) => (
                  <option key={s.roomId} value={s.roomId}>
                    {s.name || s.roomId}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {/* 체크박스 row — Field 패턴이지만 토글 형태라 인라인. */}
          <label className="flex cursor-pointer items-stretch">
            <span className="flex w-24 shrink-0 items-center pl-5 text-[12px] text-fg-3">
              {t("field.encryption")}
            </span>
            <span className="flex flex-1 items-center gap-2 py-2.5 pl-3 pr-5">
              <input
                type="checkbox"
                checked={encrypted}
                onChange={(e) => setEncrypted(e.target.checked)}
                className="accent-fg-1"
              />
              <span className="text-[13px] text-fg-1">{t("e2ee.on")}</span>
            </span>
          </label>
        </FieldGroup>

        {/* 고급 토글 */}
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex w-full items-center gap-1.5 border-y border-line bg-bg-2/40 px-5 py-2 text-left text-[12px] font-medium text-fg-2 hover:bg-bg-2 hover:text-fg-0"
        >
          {advancedOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          {t("modal.advanced")}
        </button>

        {advancedOpen && (
          <FieldGroup>
            <Field label={t("field.directory")}>
              <Select
                value={visibility}
                onChange={(v) => setVisibility(v as Visibility)}
              >
                <option value="private">{t("vis.privateDesc")}</option>
                <option value="public">{t("vis.publicDesc")}</option>
              </Select>
            </Field>
            <Field
              label={t("field.alias")}
              description={
                aliasInvalid
                  ? t("alias.invalidChars")
                  : aliasPreview || undefined
              }
            >
              {/* 별칭 row — # prefix 시각만 보여주고 입력은 localpart만. */}
              <span className="flex flex-1 items-center gap-1 py-2.5 pl-3 pr-5">
                <span className="text-[13px] text-fg-3">#</span>
                <input
                  type="text"
                  value={aliasLocalpart}
                  onChange={(e) => setAliasLocalpart(e.target.value)}
                  placeholder={t("ph.aliasRoom")}
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-fg-0 outline-none placeholder:text-fg-3"
                />
                {myDomain && (
                  <span className="truncate text-[11px] text-fg-3">
                    :{myDomain}
                  </span>
                )}
              </span>
            </Field>
            <Field label={t("field.joinRule")}>
              <Select
                value={joinRule}
                onChange={(v) => setJoinRule(v as JoinRule)}
              >
                <option value="">{t("join.default")}</option>
                <option value="invite">{t("join.invite")}</option>
                <option value="public">{t("join.public")}</option>
                <option value="knock">{t("join.knock")}</option>
              </Select>
            </Field>
            <Field label={t("field.guest")}>
              <Select
                value={guestAccess}
                onChange={(v) => setGuestAccess(v as GuestAccess)}
              >
                <option value="">{t("guest.default")}</option>
                <option value="forbidden">{t("guest.forbidden")}</option>
                <option value="can_join">{t("guest.canJoin")}</option>
              </Select>
            </Field>
            <Field label={t("field.history")}>
              <Select
                value={historyVisibility}
                onChange={(v) => setHistoryVisibility(v as HistoryVisibility)}
              >
                <option value="">{t("hist.default")}</option>
                <option value="invited">{t("hist.invited")}</option>
                <option value="joined">{t("hist.joined")}</option>
                <option value="shared">{t("hist.shared.full")}</option>
                <option value="world_readable">
                  {t("hist.worldReadableGuest")}
                </option>
              </Select>
            </Field>
          </FieldGroup>
        )}

        {error && (
          <p className="px-5 py-2.5 text-[12px] text-red-400">{error}</p>
        )}
      </div>

      <ModalFooter
        onCancel={onClose}
        onConfirm={create}
        cancelLabel={t("common.cancel")}
        confirmLabel={busy ? t("common.creating") : t("common.create")}
        busy={busy}
        disabled={!name.trim() || aliasInvalid}
      />
    </Modal>
  );
}
