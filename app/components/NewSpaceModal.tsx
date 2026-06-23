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

/** {t("modal.newSpace.title")} 모달 (B-final 톤 + 고급 옵션). */
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[15vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[80vh] w-[460px] max-w-[90vw] overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <header className="flex h-12 items-center border-b border-line px-5">
          <h2 className="font-semibold text-fg-0">
            {t("modal.newSpace.title")}
          </h2>
        </header>
        <p className="border-b border-line bg-bg-2/40 px-5 py-2 text-[12px] text-fg-3">
          {t("modal.spaceFolder")}
        </p>
        <div className="max-h-[calc(80vh-9rem)] overflow-y-auto">
          <div className="flex flex-col divide-y divide-line">
            <label className="flex items-stretch">
              <span className="flex w-24 shrink-0 items-center pl-5 text-[12px] text-fg-3">
                {t("field.spaceName")}
              </span>
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") create();
                }}
                placeholder={t("ph.spaceName")}
                className="flex-1 bg-transparent py-2.5 pl-3 pr-5 text-[13px] text-fg-0 outline-none placeholder:text-fg-3"
              />
            </label>
            <label className="flex items-stretch">
              <span className="flex w-24 shrink-0 items-center pl-5 text-[12px] text-fg-3">
                {t("field.description")}
              </span>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") create();
                }}
                placeholder={t("ph.spaceDesc")}
                className="flex-1 bg-transparent py-2.5 pl-3 pr-5 text-[13px] text-fg-0 outline-none placeholder:text-fg-3"
              />
            </label>
            {spaces.length > 0 && (
              <label className="flex items-stretch">
                <span className="flex w-24 shrink-0 items-center pl-5 text-[12px] text-fg-3">
                  {t("field.parentSpace")}
                </span>
                <select
                  value={parentSpaceId}
                  onChange={(e) => setParentSpaceId(e.target.value)}
                  className="flex-1 bg-transparent py-2.5 pl-3 pr-5 text-[13px] text-fg-0 outline-none"
                >
                  <option value="">{t("alias.noSpaceForSpace")}</option>
                  {spaces.map((s) => (
                    <option key={s.roomId} value={s.roomId}>
                      {s.name || s.roomId}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex items-center gap-1.5 bg-bg-2/40 px-5 py-2 text-left text-[12px] font-medium text-fg-2 hover:bg-bg-2 hover:text-fg-0"
            >
              {advancedOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              {t("modal.advanced")}
            </button>

            {advancedOpen && (
              <>
                <label className="flex items-stretch">
                  <span className="flex w-24 shrink-0 items-center pl-5 text-[12px] text-fg-3">
                    {t("field.directory")}
                  </span>
                  <select
                    value={visibility}
                    onChange={(e) =>
                      setVisibility(e.target.value as Visibility)
                    }
                    className="flex-1 bg-transparent py-2.5 pl-3 pr-5 text-[13px] text-fg-0 outline-none"
                  >
                    <option value="private">{t("vis.private")}</option>
                    <option value="public">{t("vis.publicSpaceDesc")}</option>
                  </select>
                </label>
                <label className="flex items-stretch">
                  <span className="flex w-24 shrink-0 items-center pl-5 text-[12px] text-fg-3">
                    {t("field.alias")}
                  </span>
                  <div className="flex flex-1 items-center gap-1">
                    <span className="text-[13px] text-fg-3">#</span>
                    <input
                      type="text"
                      value={aliasLocalpart}
                      onChange={(e) => setAliasLocalpart(e.target.value)}
                      placeholder={t("ph.aliasSpace")}
                      className="min-w-0 flex-1 bg-transparent text-[13px] text-fg-0 outline-none placeholder:text-fg-3"
                    />
                    {aliasPreview && (
                      <span className="truncate text-[11px] text-fg-3">
                        :{myDomain}
                      </span>
                    )}
                  </div>
                </label>
                {aliasInvalid && (
                  <p className="px-5 py-1.5 text-[11px] text-red-400">
                    {t("alias.invalidChars")}
                  </p>
                )}
                <label className="flex items-stretch">
                  <span className="flex w-24 shrink-0 items-center pl-5 text-[12px] text-fg-3">
                    {t("field.joinRule")}
                  </span>
                  <select
                    value={joinRule}
                    onChange={(e) => setJoinRule(e.target.value as JoinRule)}
                    className="flex-1 bg-transparent py-2.5 pl-3 pr-5 text-[13px] text-fg-0 outline-none"
                  >
                    <option value="">{t("join.default")}</option>
                    <option value="invite">{t("join.invite")}</option>
                    <option value="public">{t("join.public")}</option>
                    <option value="knock">{t("join.knock")}</option>
                  </select>
                </label>
                <label className="flex items-stretch">
                  <span className="flex w-24 shrink-0 items-center pl-5 text-[12px] text-fg-3">
                    {t("field.priorInfo")}
                  </span>
                  <select
                    value={historyVisibility}
                    onChange={(e) =>
                      setHistoryVisibility(e.target.value as HistoryVisibility)
                    }
                    className="flex-1 bg-transparent py-2.5 pl-3 pr-5 text-[13px] text-fg-0 outline-none"
                  >
                    <option value="">{t("hist.spaceDefault")}</option>
                    <option value="invited">{t("hist.invited")}</option>
                    <option value="joined">{t("hist.joined")}</option>
                    <option value="shared">{t("hist.shared")}</option>
                    <option value="world_readable">
                      {t("hist.worldReadable")}
                    </option>
                  </select>
                </label>
              </>
            )}

            {error && (
              <p className="px-5 py-2.5 text-[12px] text-red-400">{error}</p>
            )}
          </div>
        </div>
        <div className="flex border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border-r border-line py-2.5 text-[13px] text-fg-2 hover:bg-bg-2 hover:text-fg-0"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={create}
            disabled={busy || !name.trim() || aliasInvalid}
            className="flex-1 bg-bg-2 py-2.5 text-[13px] font-medium text-fg-0 hover:bg-bg-3 disabled:opacity-50"
          >
            {busy ? t("common.creating") : t("common.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
