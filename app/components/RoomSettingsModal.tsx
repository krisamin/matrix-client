import { Ban, ShieldOff, UserMinus } from "lucide-react";
import type {
  GuestAccess,
  HistoryVisibility,
  JoinRule,
  MatrixClient,
  Room,
  Visibility,
} from "matrix-js-sdk";
import { useEffect, useMemo, useState } from "react";
import { useT } from "../lib/i18n";
import {
  banMember,
  canSendStateEvent,
  getRoomDirectoryVisibility,
  getRoomPowerLevels,
  kickMember,
  setRoomCanonicalAlias,
  setRoomDirectoryVisibility,
  setRoomGuestAccess,
  setRoomHistoryVisibility,
  setRoomJoinRule,
  setUserPowerLevel,
  unbanMember,
} from "../lib/matrix";
import { SectionHeader, TextInput } from "./Form";
import { InlineSpinner } from "./InlineSpinner";
import { GeneralTab } from "./room-settings/GeneralTab";
import { type Tab, Footer, Row, ROLE_LEVELS, levelToRole } from "./room-settings/_shared";

/** 방 설정 모달 — 일반/접근/권한/위험 탭 (B-final 톤). */
export function RoomSettingsModal({
  client,
  room,
  onClose,
}: {
  client: MatrixClient;
  room: Room;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("general");
  const t = useT();
  const isSpace = room.isSpaceRoom();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[10vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex h-[80vh] w-[720px] max-w-[95vw] overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        {/* 좌측 탭 — Sidebar 톤(좌측 accent + bg-bg-2/30 헤더 띠) */}
        <aside className="flex w-44 shrink-0 flex-col border-r border-line bg-bg-1">
          <header className="flex h-12 items-center border-b border-line pl-5">
            <h2 className="truncate font-semibold text-fg-0">
              {isSpace
                ? t("roomSettings.title.space")
                : t("roomSettings.title.room")}
            </h2>
          </header>
          {(
            [
              { id: "general", label: t("roomSettings.tab.general") },
              { id: "access", label: t("roomSettings.tab.access") },
              { id: "permissions", label: t("roomSettings.tab.permissions") },
              { id: "danger", label: t("roomSettings.tab.danger") },
            ] as { id: Tab; label: string }[]
          ).map((t) => {
            const active = tab === t.id;
            const danger = t.id === "danger";
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`relative border-b border-line py-2.5 pl-5 pr-4 text-left text-[13px] transition-colors ${
                  active
                    ? danger
                      ? "bg-red-950/30 font-medium text-red-300"
                      : "bg-bg-2 font-medium text-fg-0"
                    : danger
                      ? "text-red-400/80 hover:bg-bg-2 hover:text-red-300"
                      : "text-fg-2 hover:bg-bg-2 hover:text-fg-0"
                }`}
              >
                {/* 활성 인디케이터 — 좌측 2px accent bar */}
                {active && (
                  <span
                    className={`absolute inset-y-0 left-0 w-[2px] ${
                      danger ? "bg-red-400" : "bg-fg-0"
                    }`}
                  />
                )}
                {t.label}
              </button>
            );
          })}
        </aside>
        {/* 우측 컨텐츠 */}
        <section className="flex min-w-0 flex-1 flex-col">
          {tab === "general" && (
            <GeneralTab client={client} room={room} onClose={onClose} />
          )}
          {tab === "access" && (
            <AccessTab client={client} room={room} onClose={onClose} />
          )}
          {tab === "permissions" && (
            <PermissionsTab client={client} room={room} onClose={onClose} />
          )}
          {tab === "danger" && (
            <DangerTab client={client} room={room} onClose={onClose} />
          )}
        </section>
      </div>
    </div>
  );
}

/* ──────────── 접근 탭: alias·directory·join_rule·guest·history ──────────── */

function AccessTab({
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
            <p className="px-5 py-1.5 text-[11px] text-red-400">
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
              className="flex-1 bg-transparent py-2.5 pl-3 pr-5 text-[13px] text-fg-0 outline-none disabled:opacity-50"
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
              className="flex-1 bg-transparent py-2.5 pl-3 pr-5 text-[13px] text-fg-0 outline-none disabled:opacity-50"
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
              className="flex-1 bg-transparent py-2.5 pl-3 pr-5 text-[13px] text-fg-0 outline-none disabled:opacity-50"
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
              className="flex-1 bg-transparent py-2.5 pl-3 pr-5 text-[13px] text-fg-0 outline-none disabled:opacity-50"
            >
              <option value="invited">{t("hist.invited")}</option>
              <option value="joined">{t("hist.joined")}</option>
              <option value="shared">{t("hist.shared")}</option>
              <option value="world_readable">{t("hist.worldReadable")}</option>
            </select>
          </Row>
          {error && (
            <p className="px-5 py-2.5 text-[12px] text-red-400">{error}</p>
          )}
        </div>
      </div>
      <Footer busy={busy} dirty={dirty} onCancel={onClose} onSave={save} />
    </>
  );
}

/* ──────────── 권한 탭: 역할 + 기본 액션 PL + 이벤트별 PL (고급) ──────────── */

function PermissionsTab({
  client,
  room,
  onClose,
}: {
  client: MatrixClient;
  room: Room;
  onClose: () => void;
}) {
  const t = useT();
  const myUserId = client.getUserId() ?? "";
  const [, force] = useState(0);
  // DefaultPLEditor에서 끌어올린 푸터 상태
  const [defaultsState, setDefaultsState] = useState<{
    dirty: boolean;
    busy: boolean;
    error: string | null;
    save: () => void;
  } | null>(null);
  const refresh = () => force((n) => n + 1);
  const pls = getRoomPowerLevels(room);
  const myLevel = pls.users[myUserId] ?? pls.users_default;
  const canEditPL = canSendStateEvent(room, client, "m.room.power_levels");

  const [pendingTarget, setPendingTarget] = useState<{
    userId: string;
    newLevel: number;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 멤버 목록 (조인된 사람만, PL 내림차순 → 이름순)
  const members = useMemo(() => {
    return [...room.getJoinedMembers()].sort(
      (a, b) =>
        b.powerLevel - a.powerLevel || a.name.localeCompare(b.name, "ko"),
    );
  }, [room]);

  async function changeLevel(userId: string, newLevel: number) {
    if (busy) return;
    // 자기 강등 안전망
    if (userId === myUserId && newLevel < myLevel) {
      setPendingTarget({ userId, newLevel });
      return;
    }
    // 대상이 나보다 PL 높으면 차단
    const targetLevel = pls.users[userId] ?? pls.users_default;
    if (targetLevel >= myLevel && userId !== myUserId) {
      setError(t("perm.cantChangeHigher"));
      return;
    }
    await applyLevel(userId, newLevel);
  }

  async function applyLevel(userId: string, newLevel: number) {
    setBusy(userId);
    setError(null);
    try {
      await setUserPowerLevel(client, room.roomId, userId, newLevel);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setPendingTarget(null);
    }
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!canEditPL && (
          <p className="border-b border-line bg-bg-2/40 px-5 py-2 text-[12px] text-fg-3">
            {t("perm.viewOnly")}
          </p>
        )}
        {/* divide-y 제거 — SectionHeader가 자체 border-y로 row 사이 경계 책임.
            divide-y와 SectionHeader.border-y가 겹쳐 이중 border 발생함. */}
        <div className="flex flex-col">
          {/* 멤버 역할 */}
          <SectionHeader>
            {t("perm.section.members", { count: members.length })}
          </SectionHeader>
          {members.map((m) => {
            const lvl = pls.users[m.userId] ?? pls.users_default;
            const role = levelToRole(lvl);
            const isMe = m.userId === myUserId;
            const canEditThis = canEditPL && (isMe ? lvl > 0 : lvl < myLevel);
            return (
              <div
                key={m.userId}
                className="flex items-stretch border-b border-line last:border-b-0"
              >
                <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate py-2.5 pl-5 text-[13px] text-fg-1">
                  <span className="truncate">{m.name}</span>
                  {isMe && (
                    <span className="ml-1.5 text-[11px] text-fg-3">
                      {t("perm.member.me")}
                    </span>
                  )}
                </span>
                <span className="flex items-center px-2 py-2.5 font-mono text-[11px] text-fg-3">
                  {lvl}
                </span>
                {canEditThis ? (
                  <select
                    value={role}
                    disabled={busy === m.userId}
                    onChange={(e) =>
                      changeLevel(
                        m.userId,
                        ROLE_LEVELS[e.target.value as keyof typeof ROLE_LEVELS],
                      )
                    }
                    className="bg-transparent py-2.5 pl-3 pr-5 text-[12px] text-fg-0 outline-none disabled:opacity-50"
                  >
                    <option value="멤버">{t("perm.role.member")} (0)</option>
                    <option value="모더레이터">
                      {t("perm.role.moderator")} (50)
                    </option>
                    <option value="관리자">{t("perm.role.admin")} (100)</option>
                  </select>
                ) : (
                  <span className="flex items-center py-2.5 pr-5 text-[12px] text-fg-2">
                    {role}
                  </span>
                )}
              </div>
            );
          })}

          {/* 기본 액션 PL */}
          <SectionHeader>{t("perm.section.defaults")}</SectionHeader>
          <DefaultPLEditor
            client={client}
            room={room}
            pls={pls}
            canEdit={canEditPL}
            onStateChange={setDefaultsState}
          />
        </div>
        {error && (
          <p className="border-t border-line px-5 py-2.5 text-[12px] text-red-400">
            {error}
          </p>
        )}
      </div>
      {/* 외곽 푸터 — DefaultPLEditor의 dirty/busy/error/save를 끌어올려 렌더.
          모달 바닥에 Cancel + Save defaults 버튼 (다른 탭의 Footer와 동일
          좌/우 풀폭 패턴). 에러는 푸터 위 별도 줄. */}
      {canEditPL && defaultsState && (
        <>
          {defaultsState.error && (
            <p className="shrink-0 border-t border-line px-5 py-2 text-[12px] text-red-400">
              {defaultsState.error}
            </p>
          )}
          <div className="flex shrink-0 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border-r border-line py-2.5 text-[13px] text-fg-2 hover:bg-bg-2 hover:text-fg-0"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={defaultsState.save}
              disabled={defaultsState.busy || !defaultsState.dirty}
              className="flex-1 bg-bg-2 py-2.5 text-[13px] font-medium text-fg-0 hover:bg-bg-3 disabled:opacity-50"
            >
              {defaultsState.busy ? t("perm.saving") : t("perm.saveDefaults")}
            </button>
          </div>
        </>
      )}
      {pendingTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
          onClick={() => setPendingTarget(null)}
          role="presentation"
        >
          <div
            className="w-[400px] overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            <header className="flex h-12 items-center border-b border-line pl-5">
              <h3 className="font-semibold text-fg-0">
                {t("perm.demoteSelf.title")}
              </h3>
            </header>
            <p className="px-5 py-4 text-[13px] text-fg-2">
              {t("perm.demoteSelf.body")}
            </p>
            <div className="flex border-t border-line">
              <button
                type="button"
                onClick={() => setPendingTarget(null)}
                className="flex-1 border-r border-line py-2.5 text-[13px] text-fg-2 hover:bg-bg-2 hover:text-fg-0"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() =>
                  pendingTarget &&
                  applyLevel(pendingTarget.userId, pendingTarget.newLevel)
                }
                className="flex-1 bg-red-950/60 py-2.5 text-[13px] font-medium text-red-300 hover:bg-red-900/60"
              >
                {t("perm.demote")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DefaultPLEditor({
  client,
  room,
  pls,
  canEdit,
  onStateChange,
}: {
  client: MatrixClient;
  room: Room;
  pls: ReturnType<typeof getRoomPowerLevels>;
  canEdit: boolean;
  /** 외부 푸터가 dirty/busy/error/save에 접근할 수 있게 끌어올림 */
  onStateChange?: (state: {
    dirty: boolean;
    busy: boolean;
    error: string | null;
    save: () => void;
  }) => void;
}) {
  const t = useT();
  const myUserId = client.getUserId() ?? "";
  const myLevel = pls.users[myUserId] ?? pls.users_default;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 로컬 편집 상태
  const [eventsDefault, setEventsDefault] = useState(pls.events_default);
  const [stateDefault, setStateDefault] = useState(pls.state_default);
  const [invite, setInvite] = useState(pls.invite);
  const [kick, setKick] = useState(pls.kick);
  const [ban, setBan] = useState(pls.ban);
  const [redact, setRedact] = useState(pls.redact);

  const dirty =
    eventsDefault !== pls.events_default ||
    stateDefault !== pls.state_default ||
    invite !== pls.invite ||
    kick !== pls.kick ||
    ban !== pls.ban ||
    redact !== pls.redact;

  // 외부 푸터로 dirty/busy/error/save를 끌어올림
  useEffect(() => {
    onStateChange?.({ dirty, busy, error, save });
    // save는 closure로 잡혀있어 매 렌더 새 ref — deps에 넣으면 무한루프
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, busy, error, onStateChange, save]);

  async function save() {
    if (busy || !dirty) return;
    // 내 PL보다 높은 값 설정 금지
    const max = Math.max(
      eventsDefault,
      stateDefault,
      invite,
      kick,
      ban,
      redact,
    );
    if (max > myLevel) {
      setError(t("perm.cantSetHigher", { level: myLevel }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // 부분 머지 — SDK가 알아서 기존 content와 합쳐주려면 전체 다시 보내야 한다
      const ev = room.currentState.getStateEvents("m.room.power_levels", "");
      const current = (ev?.getContent() ?? {}) as Record<string, unknown>;
      const next = {
        ...current,
        events_default: eventsDefault,
        state_default: stateDefault,
        invite,
        kick,
        ban,
        redact,
      };
      await client.sendStateEvent(
        room.roomId,
        "m.room.power_levels" as never,
        next as never,
        "",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const rows: { label: string; value: number; set: (n: number) => void }[] = [
    {
      label: t("perm.action.sendMsg"),
      value: eventsDefault,
      set: setEventsDefault,
    },
    {
      label: t("perm.action.stateEvent"),
      value: stateDefault,
      set: setStateDefault,
    },
    { label: t("perm.action.invite"), value: invite, set: setInvite },
    { label: t("perm.action.kick"), value: kick, set: setKick },
    { label: t("perm.action.ban"), value: ban, set: setBan },
    { label: t("perm.action.redact"), value: redact, set: setRedact },
  ];

  return (
    <>
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex items-stretch border-b border-line last:border-b-0"
        >
          <span className="flex w-28 shrink-0 items-center pl-5 text-[12px] text-fg-2">
            {r.label}
          </span>
          <TextInput
            value={String(r.value)}
            onChange={(v) => r.set(Number(v) || 0)}
            disabled={!canEdit}
            type="number"
            align="right"
            width="w-12"
            suffix={t("perm.basicHint", {
              level:
                r.label === t("perm.action.sendMsg") ||
                r.label === t("perm.action.invite")
                  ? 0
                  : 50,
            })}
          />
        </div>
      ))}
    </>
  );
}

/* ──────────── 위험 탭: 강퇴/추방/추방 해제 ──────────── */

function DangerTab({
  client,
  room,
  onClose,
}: {
  client: MatrixClient;
  room: Room;
  onClose: () => void;
}) {
  const t = useT();
  const myUserId = client.getUserId() ?? "";
  const [, force] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canKick = canSendStateEvent(room, client, "m.room.member"); // 대체로 m.room.member 권한
  const banned = room.getMembersWithMembership("ban");

  async function doKick(userId: string) {
    if (busy) return;
    setBusy(userId);
    setError(null);
    try {
      await kickMember(client, room.roomId, userId);
      force((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
  async function doBan(userId: string) {
    if (busy) return;
    setBusy(userId);
    setError(null);
    try {
      await banMember(client, room.roomId, userId);
      force((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
  async function doUnban(userId: string) {
    if (busy) return;
    setBusy(userId);
    setError(null);
    try {
      await unbanMember(client, room.roomId, userId);
      force((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const members = [...room.getJoinedMembers()].filter(
    (m) => m.userId !== myUserId,
  );

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col">
          <SectionHeader>
            {t("perm.section.members", { count: members.length })}
            {t("danger.excludeSelf")}
          </SectionHeader>
          {members.map((m) => (
            <div
              key={m.userId}
              className="flex items-stretch border-b border-line last:border-b-0"
            >
              <span className="flex min-w-0 flex-1 items-center truncate py-2.5 pl-5 text-[13px] text-fg-1">
                <span className="truncate">{m.name}</span>
              </span>
              <div className="flex shrink-0 items-stretch">
                <button
                  type="button"
                  onClick={() => doKick(m.userId)}
                  disabled={!canKick || busy === m.userId}
                  title={t("danger.kick.title")}
                  className="flex items-center gap-1.5 px-3 text-[12px] text-fg-2 hover:bg-bg-2 hover:text-fg-0 disabled:opacity-50"
                >
                  <UserMinus className="h-3.5 w-3.5" />
                  {t("danger.kick")}
                </button>
                <button
                  type="button"
                  onClick={() => doBan(m.userId)}
                  disabled={!canKick || busy === m.userId}
                  title={t("danger.ban.title")}
                  className="flex items-center gap-1.5 px-3 text-[12px] text-red-400 hover:bg-red-950/40 disabled:opacity-50"
                >
                  <Ban className="h-3.5 w-3.5" />
                  {t("danger.ban")}
                </button>
                {busy === m.userId && (
                  <span className="flex items-center pr-3">
                    <InlineSpinner size="xs" className="text-fg-3" />
                  </span>
                )}
              </div>
            </div>
          ))}

          {banned.length > 0 && (
            <>
              <SectionHeader>
                {t("danger.section.banned", { count: banned.length })}
              </SectionHeader>
              {banned.map((m) => (
                <div
                  key={m.userId}
                  className="flex items-stretch border-b border-line last:border-b-0"
                >
                  <span className="flex min-w-0 flex-1 items-center truncate py-2.5 pl-5 text-[13px] text-fg-2">
                    <span className="truncate">{m.name}</span>
                  </span>
                  <div className="flex shrink-0 items-center gap-2 py-2 pr-5">
                    <button
                      type="button"
                      onClick={() => doUnban(m.userId)}
                      disabled={busy === m.userId}
                      className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-fg-2 hover:bg-bg-2 hover:text-fg-0 disabled:opacity-50"
                    >
                      <ShieldOff className="h-3 w-3" />
                      {t("danger.unbanAction")}
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        {error && (
          <p className="border-t border-line px-5 py-2.5 text-[12px] text-red-400">
            {error}
          </p>
        )}
      </div>
      <div className="flex border-t border-line">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 text-[13px] text-fg-2 hover:bg-bg-2 hover:text-fg-0"
        >
          {t("common.close")}
        </button>
      </div>
    </>
  );
}
