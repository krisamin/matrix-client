import { ChevronDown, ChevronRight } from "lucide-react";
import type {
  HistoryVisibility,
  JoinRule,
  MatrixClient,
  Visibility,
} from "matrix-js-sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { createSpace, getJoinedSpaces } from "../lib/matrix";
import { Field, FieldGroup, SectionHeader, Select, TextInput } from "./Form";
import { Modal, ModalFooter, ModalHeader } from "./Modal";

/** 새 Space 만들기 모달 — 공용 Modal/Form 사용. */
export function NewSpaceModal({
  client,
  onClose,
  onCreated,
  defaultSpaceId,
}: {
  client: MatrixClient;
  onClose: () => void;
  onCreated: (spaceId: string) => void;
  defaultSpaceId?: string;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [parentSpaceId, setParentSpaceId] = useState(defaultSpaceId ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>(
    "private" as Visibility,
  );
  const [aliasLocalpart, setAliasLocalpart] = useState("");
  const [joinRule, setJoinRule] = useState<JoinRule | "">("");
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
      const spaceId = await createSpace(client, {
        name,
        topic,
        parentSpaceId: parentSpaceId || undefined,
        visibility: visibility || undefined,
        aliasLocalpart: aliasLocalpart.trim() || undefined,
        joinRule: (joinRule as JoinRule) || undefined,
        historyVisibility:
          (historyVisibility as HistoryVisibility) || undefined,
      });
      onCreated(spaceId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} size="md" fixedHeight>
      <ModalHeader title={t("modal.newSpace.title")} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <FieldGroup>
          <Field label={t("field.spaceName")}>
            <TextInput
              ref={inputRef}
              value={name}
              onChange={setName}
              placeholder={t("ph.spaceName")}
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
              }}
            />
          </Field>
          <Field label={t("field.description")}>
            <TextInput
              value={topic}
              onChange={setTopic}
              placeholder={t("ph.spaceDesc")}
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
              }}
            />
          </Field>
          {spaces.length > 0 && (
            <Field label={t("field.parentSpace")}>
              <Select value={parentSpaceId} onChange={setParentSpaceId}>
                <option value="">{t("alias.noSpaceForSpace")}</option>
                {spaces.map((s) => (
                  <option key={s.roomId} value={s.roomId}>
                    {s.name || s.roomId}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </FieldGroup>

        <SectionHeader
          onClick={() => setAdvancedOpen((v) => !v)}
          actions={
            <span className="flex items-center pr-5 text-fg-3">
              {advancedOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </span>
          }
        >
          {t("modal.advanced")}
        </SectionHeader>

        {advancedOpen && (
          <FieldGroup>
            <Field label={t("field.directory")}>
              <Select
                value={visibility}
                onChange={(v) => setVisibility(v as Visibility)}
              >
                <option value="private">{t("vis.private")}</option>
                <option value="public">{t("vis.publicSpaceDesc")}</option>
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
              <TextInput
                value={aliasLocalpart}
                onChange={setAliasLocalpart}
                placeholder={t("ph.aliasSpace")}
                prefix="#"
                suffix={myDomain ? `:${myDomain}` : undefined}
              />
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
            <Field label={t("field.priorInfo")}>
              <Select
                value={historyVisibility}
                onChange={(v) => setHistoryVisibility(v as HistoryVisibility)}
              >
                <option value="">{t("hist.spaceDefault")}</option>
                <option value="invited">{t("hist.invited")}</option>
                <option value="joined">{t("hist.joined")}</option>
                <option value="shared">{t("hist.shared")}</option>
                <option value="world_readable">
                  {t("hist.worldReadable")}
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
