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

/** {t("modal.newRoom.title")} 모달 (B-final 톤 + 고급 옵션 풀셋). */
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
  // 고급
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
  // alias 미리보기: localpart + 홈서버 도메인
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

  // alias 검증 (Matrix 스펙: 알파벳/숫자/_/-/.만, 빈 칸이면 OK)
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
            {t("modal.newRoom.title")}
          </h2>
        </header>
        <div className="max-h-[calc(80vh-7rem)] overflow-y-auto">
          <div className="flex flex-col divide-y divide-line">
            {/* 기본 */}
            <label className="flex items-center gap-3 px-5 py-2.5">
              <span className="w-24 shrink-0 text-[12px] text-fg-3">
                {t("field.roomName")}
              </span>
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") create();
                }}
                placeholder={t("ph.roomName")}
                className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none placeholder:text-fg-3"
              />
            </label>
            <label className="flex items-center gap-3 px-5 py-2.5">
              <span className="w-24 shrink-0 text-[12px] text-fg-3">
                {t("field.topic")}
              </span>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") create();
                }}
                placeholder={t("ph.roomDesc")}
                className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none placeholder:text-fg-3"
              />
            </label>
            {spaces.length > 0 && (
              <label className="flex items-center gap-3 px-5 py-2.5">
                <span className="w-24 shrink-0 text-[12px] text-fg-3">
                  상위 Space
                </span>
                <select
                  value={parentSpaceId}
                  onChange={(e) => setParentSpaceId(e.target.value)}
                  className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none"
                >
                  <option value="">{t("alias.noSpace")}</option>
                  {spaces.map((s) => (
                    <option key={s.roomId} value={s.roomId}>
                      {s.name || s.roomId}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex cursor-pointer items-center gap-3 px-5 py-2.5">
              <span className="w-24 shrink-0 text-[12px] text-fg-3">
                {t("field.encryption")}
              </span>
              <input
                type="checkbox"
                checked={encrypted}
                onChange={(e) => setEncrypted(e.target.checked)}
                className="accent-fg-1"
              />
              <span className="text-[13px] text-fg-1">{t("e2ee.on")}</span>
            </label>

            {/* 고급 토글 */}
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
                {/* 공개 디렉토리 */}
                <label className="flex items-center gap-3 px-5 py-2.5">
                  <span className="w-24 shrink-0 text-[12px] text-fg-3">
                    {t("field.directory")}
                  </span>
                  <select
                    value={visibility}
                    onChange={(e) =>
                      setVisibility(e.target.value as Visibility)
                    }
                    className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none"
                  >
                    <option value="private">{t("vis.privateDesc")}</option>
                    <option value="public">{t("vis.publicDesc")}</option>
                  </select>
                </label>

                {/* 별칭 */}
                <label className="flex items-center gap-3 px-5 py-2.5">
                  <span className="w-24 shrink-0 text-[12px] text-fg-3">
                    {t("field.alias")}
                  </span>
                  <div className="flex flex-1 items-center gap-1">
                    <span className="text-[13px] text-fg-3">#</span>
                    <input
                      type="text"
                      value={aliasLocalpart}
                      onChange={(e) => setAliasLocalpart(e.target.value)}
                      placeholder={t("ph.aliasRoom")}
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

                {/* 가입 규칙 */}
                <label className="flex items-center gap-3 px-5 py-2.5">
                  <span className="w-24 shrink-0 text-[12px] text-fg-3">
                    {t("field.joinRule")}
                  </span>
                  <select
                    value={joinRule}
                    onChange={(e) => setJoinRule(e.target.value as JoinRule)}
                    className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none"
                  >
                    <option value="">{t("join.default")}</option>
                    <option value="invite">{t("join.invite")}</option>
                    <option value="public">{t("join.public")}</option>
                    <option value="knock">{t("join.knock")}</option>
                  </select>
                </label>

                {/* 게스트 */}
                <label className="flex items-center gap-3 px-5 py-2.5">
                  <span className="w-24 shrink-0 text-[12px] text-fg-3">
                    {t("field.guest")}
                  </span>
                  <select
                    value={guestAccess}
                    onChange={(e) =>
                      setGuestAccess(e.target.value as GuestAccess)
                    }
                    className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none"
                  >
                    <option value="">{t("guest.default")}</option>
                    <option value="forbidden">{t("guest.forbidden")}</option>
                    <option value="can_join">{t("guest.canJoin")}</option>
                  </select>
                </label>

                {/* 히스토리 */}
                <label className="flex items-center gap-3 px-5 py-2.5">
                  <span className="w-24 shrink-0 text-[12px] text-fg-3">
                    {t("field.history")}
                  </span>
                  <select
                    value={historyVisibility}
                    onChange={(e) =>
                      setHistoryVisibility(e.target.value as HistoryVisibility)
                    }
                    className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none"
                  >
                    <option value="">{t("hist.default")}</option>
                    <option value="invited">{t("hist.invited")}</option>
                    <option value="joined">{t("hist.joined")}</option>
                    <option value="shared">{t("hist.shared.full")}</option>
                    <option value="world_readable">
                      {t("hist.worldReadableGuest")}
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
