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
import { createGroupRoom, createSpace, getJoinedSpaces } from "../lib/matrix";
import { Field, FieldGroup, SectionHeader, Select, TextInput } from "./Form";
import { Modal, ModalFooter, ModalHeader } from "./Modal";

export type RoomCreateKind = "room" | "space";

/**
 * 새 방 / 새 Space 공용 생성 폼.
 * kind="room" vs "space" 로 분기 (i18n 키 / 추가 필드).
 * - encryption row: room 전용
 * - guestAccess: room 전용
 * - 호출: createGroupRoom vs createSpace
 */
export function RoomCreateForm({
  kind,
  client,
  onClose,
  onCreated,
  defaultSpaceId,
}: {
  kind: RoomCreateKind;
  client: MatrixClient;
  onClose: () => void;
  onCreated: (id: string) => void;
  defaultSpaceId?: string;
}) {
  const t = useT();
  const isRoom = kind === "room";

  // 두 모달 공통 state — 동일 shape.
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [encrypted, setEncrypted] = useState(true); // room 전용
  const [parentSpaceId, setParentSpaceId] = useState(defaultSpaceId ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>(
    "private" as Visibility,
  );
  const [aliasLocalpart, setAliasLocalpart] = useState("");
  const [joinRule, setJoinRule] = useState<JoinRule | "">("");
  const [guestAccess, setGuestAccess] = useState<GuestAccess | "">(""); // room 전용
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
      const id = isRoom
        ? await createGroupRoom(client, {
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
          })
        : await createSpace(client, {
            name,
            topic,
            parentSpaceId: parentSpaceId || undefined,
            visibility: visibility || undefined,
            aliasLocalpart: aliasLocalpart.trim() || undefined,
            joinRule: (joinRule as JoinRule) || undefined,
            historyVisibility:
              (historyVisibility as HistoryVisibility) || undefined,
          });
      onCreated(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  // i18n 키 분기 — 원본 모달의 키를 그대로 유지.
  const k = isRoom
    ? ({
        title: "modal.newRoom.title",
        nameLabel: "field.roomName",
        namePh: "ph.roomName",
        topicLabel: "field.topic",
        topicPh: "ph.roomDesc",
        noParent: "alias.noSpace",
        aliasPh: "ph.aliasRoom",
        visPrivate: "vis.privateDesc",
        visPublic: "vis.publicDesc",
        histDefault: "hist.default",
        histShared: "hist.shared.full",
        histWorldReadable: "hist.worldReadableGuest",
        historyLabel: "field.history",
      } as const)
    : ({
        title: "modal.newSpace.title",
        nameLabel: "field.spaceName",
        namePh: "ph.spaceName",
        topicLabel: "field.description",
        topicPh: "ph.spaceDesc",
        noParent: "alias.noSpaceForSpace",
        aliasPh: "ph.aliasSpace",
        visPrivate: "vis.private",
        visPublic: "vis.publicSpaceDesc",
        histDefault: "hist.spaceDefault",
        histShared: "hist.shared",
        histWorldReadable: "hist.worldReadable",
        historyLabel: "field.priorInfo",
      } as const);

  return (
    <Modal onClose={onClose} size="md">
      <ModalHeader title={t(k.title)} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <FieldGroup>
          <Field label={t(k.nameLabel)}>
            <TextInput
              ref={inputRef}
              value={name}
              onChange={setName}
              placeholder={t(k.namePh)}
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
              }}
            />
          </Field>
          <Field label={t(k.topicLabel)}>
            <TextInput
              value={topic}
              onChange={setTopic}
              placeholder={t(k.topicPh)}
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
              }}
            />
          </Field>
          {spaces.length > 0 && (
            <Field label={t("field.parentSpace")}>
              <Select value={parentSpaceId} onChange={setParentSpaceId}>
                <option value="">{t(k.noParent)}</option>
                {spaces.map((s) => (
                  <option key={s.roomId} value={s.roomId}>
                    {s.name || s.roomId}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {isRoom && (
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
                <option value="private">{t(k.visPrivate)}</option>
                <option value="public">{t(k.visPublic)}</option>
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
                placeholder={t(k.aliasPh)}
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
            {isRoom && (
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
            )}
            <Field label={t(k.historyLabel)}>
              <Select
                value={historyVisibility}
                onChange={(v) => setHistoryVisibility(v as HistoryVisibility)}
              >
                <option value="">{t(k.histDefault)}</option>
                <option value="invited">{t("hist.invited")}</option>
                <option value="joined">{t("hist.joined")}</option>
                <option value="shared">{t(k.histShared)}</option>
                <option value="world_readable">
                  {t(k.histWorldReadable)}
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
