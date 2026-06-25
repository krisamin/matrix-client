import type {
  GuestAccess,
  HistoryVisibility,
  JoinRule,
  MatrixClient,
  Room,
  Visibility,
} from "matrix-js-sdk";
import { useEffect, useState } from "react";
import { useT } from "../../lib/i18n";
import {
  canSendStateEvent,
  getRoomDirectoryVisibility,
  setRoomCanonicalAlias,
  setRoomDirectoryVisibility,
  setRoomGuestAccess,
  setRoomHistoryVisibility,
  setRoomJoinRule,
} from "../../lib/matrix";
import { TextInput } from "../Form";
import { FormError } from "../FormError";
import { Footer, Row } from "./_shared";

/* ──────────── 접근 탭: alias·directory·join_rule·guest·history ──────────── */

export function AccessTab({
  client,
  room,
  onClose,
}: {
  client: MatrixClient;
  room: Room;
  onClose: () => void;
}) {
  const t = useT();
  const myDomain = (client.getUserId() ?? "").split(":")[1] ?? "";

  // 현재 값 추출
  const currentAlias =
    room.currentState.getStateEvents("m.room.canonical_alias", "")?.getContent()
      .alias ?? "";
  const currentJoinRule: JoinRule = room.getJoinRule();
  const currentGuestAccess: GuestAccess = room.getGuestAccess();
  const currentHistoryVis: HistoryVisibility = room.getHistoryVisibility();

  const [aliasLocalpart, setAliasLocalpart] = useState(
    currentAlias.startsWith("#")
      ? (currentAlias.slice(1).split(":")[0] ?? "")
      : "",
  );
  const initialAliasLp = aliasLocalpart;
  const [directory, setDirectory] = useState<"public" | "private" | "loading">(
    "loading",
  );
  const [initialDirectory, setInitialDirectory] = useState<
    "public" | "private" | "loading"
  >("loading");
  const [joinRule, setJoinRule] = useState<JoinRule>(currentJoinRule);
  const [guestAccess, setGuestAccess] =
    useState<GuestAccess>(currentGuestAccess);
  const [historyVis, setHistoryVis] =
    useState<HistoryVisibility>(currentHistoryVis);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 디렉토리 상태 로드
  useEffect(() => {
    (async () => {
      try {
        const v = await getRoomDirectoryVisibility(client, room.roomId);
        setDirectory(v as "public" | "private");
        setInitialDirectory(v as "public" | "private");
      } catch {
        setDirectory("private");
        setInitialDirectory("private");
      }
    })();
  }, [client, room.roomId]);

  const canAlias = canSendStateEvent(room, client, "m.room.canonical_alias");
  const canJoin = canSendStateEvent(room, client, "m.room.join_rules");
  const canGuest = canSendStateEvent(room, client, "m.room.guest_access");
  const canHistory = canSendStateEvent(
    room,
    client,
    "m.room.history_visibility",
  );

  const aliasInvalid =
    aliasLocalpart.trim().length > 0 &&
    !/^[a-zA-Z0-9._-]+$/.test(aliasLocalpart.trim());

  const dirty =
    aliasLocalpart !== initialAliasLp ||
    directory !== initialDirectory ||
    joinRule !== currentJoinRule ||
    guestAccess !== currentGuestAccess ||
    historyVis !== currentHistoryVis;

  async function save() {
    if (busy || !dirty || aliasInvalid) return;
    setBusy(true);
    setError(null);
    try {
      if (aliasLocalpart !== initialAliasLp) {
        const newAlias = aliasLocalpart.trim()
          ? `#${aliasLocalpart.trim()}:${myDomain}`
          : null;
        await setRoomCanonicalAlias(client, room.roomId, newAlias);
      }
      if (directory !== initialDirectory && directory !== "loading") {
        await setRoomDirectoryVisibility(
          client,
          room.roomId,
          directory as Visibility,
        );
      }
      if (joinRule !== currentJoinRule) {
        await setRoomJoinRule(client, room.roomId, joinRule);
      }
      if (guestAccess !== currentGuestAccess) {
        await setRoomGuestAccess(client, room.roomId, guestAccess);
      }
      if (historyVis !== currentHistoryVis) {
        await setRoomHistoryVisibility(client, room.roomId, historyVis);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col divide-y divide-line">
          <Row label={t("field.alias")}>
            <TextInput
              value={aliasLocalpart}
              onChange={setAliasLocalpart}
              disabled={!canAlias}
              placeholder={t("roomSettings.alias.none")}
              prefix="#"
              suffix={aliasLocalpart ? `:${myDomain}` : undefined}
            />
          </Row>
          {aliasInvalid && (
            <p className="px-4 py-1.5 text-[11px] text-red-400">
              {t("alias.invalidChars")}
            </p>
          )}
          <Row label={t("field.directory")}>
            <select
              value={directory === "loading" ? "private" : directory}
              disabled={directory === "loading"}
              onChange={(e) =>
                setDirectory(e.target.value as "public" | "private")
              }
              className="flex-1 bg-transparent py-2.5 pl-3 pr-4 text-[13px] text-fg-0 outline-none disabled:opacity-50"
            >
              <option value="private">{t("vis.private")}</option>
              <option value="public">{t("vis.public")}</option>
            </select>
          </Row>
          <Row label={t("field.joinRule")}>
            <select
              value={joinRule}
              disabled={!canJoin}
              onChange={(e) => setJoinRule(e.target.value as JoinRule)}
              className="flex-1 bg-transparent py-2.5 pl-3 pr-4 text-[13px] text-fg-0 outline-none disabled:opacity-50"
            >
              <option value="invite">{t("join.invite")}</option>
              <option value="public">{t("join.public")}</option>
              <option value="knock">{t("join.knock")}</option>
              <option value="restricted">{t("join.restricted")}</option>
            </select>
          </Row>
          <Row label={t("field.guest")}>
            <select
              value={guestAccess}
              disabled={!canGuest}
              onChange={(e) => setGuestAccess(e.target.value as GuestAccess)}
              className="flex-1 bg-transparent py-2.5 pl-3 pr-4 text-[13px] text-fg-0 outline-none disabled:opacity-50"
            >
              <option value="forbidden">{t("guest.forbidden")}</option>
              <option value="can_join">{t("guest.canJoin")}</option>
            </select>
          </Row>
          <Row label={t("field.history")}>
            <select
              value={historyVis}
              disabled={!canHistory}
              onChange={(e) =>
                setHistoryVis(e.target.value as HistoryVisibility)
              }
              className="flex-1 bg-transparent py-2.5 pl-3 pr-4 text-[13px] text-fg-0 outline-none disabled:opacity-50"
            >
              <option value="invited">{t("hist.invited")}</option>
              <option value="joined">{t("hist.joined")}</option>
              <option value="shared">{t("hist.shared")}</option>
              <option value="world_readable">{t("hist.worldReadable")}</option>
            </select>
          </Row>
          <FormError>{error}</FormError>
        </div>
      </div>
      <Footer busy={busy} dirty={dirty} onCancel={onClose} onSave={save} />
    </>
  );
}
