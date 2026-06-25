import type { MatrixClient, Room } from "matrix-js-sdk";
import { useEffect, useMemo, useState } from "react";
import { useT } from "../../lib/i18n";
import {
  canSendStateEvent,
  getRoomPowerLevels,
  setUserPowerLevel,
} from "../../lib/matrix";
import { SectionHeader, TextInput } from "../Form";
import { FormError } from "../FormError";
import { SectionBanner } from "../SectionBanner";
import { ROLE_LEVELS, levelToRole } from "./_shared";

/* ──────────── 권한 탭: 역할 + 기본 액션 PL + 이벤트별 PL (고급) ──────────── */

export function PermissionsTab({
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
          <SectionBanner>{t("perm.viewOnly")}</SectionBanner>
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
                <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate py-2.5 pl-4 text-[13px] text-fg-1">
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
                    className="bg-transparent py-2.5 pl-3 pr-4 text-[12px] text-fg-0 outline-none disabled:opacity-50"
                  >
                    <option value="멤버">{t("perm.role.member")} (0)</option>
                    <option value="모더레이터">
                      {t("perm.role.moderator")} (50)
                    </option>
                    <option value="관리자">{t("perm.role.admin")} (100)</option>
                  </select>
                ) : (
                  <span className="flex items-center py-2.5 pr-4 text-[12px] text-fg-2">
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
          <div className="border-t border-line">
            <FormError>{error}</FormError>
          </div>
        )}
      </div>
      {/* 외곽 푸터 — DefaultPLEditor의 dirty/busy/error/save를 끌어올려 렌더.
          모달 바닥에 Cancel + Save defaults 버튼 (다른 탭의 Footer와 동일
          좌/우 풀폭 패턴). 에러는 푸터 위 별도 줄. */}
      {canEditPL && defaultsState && (
        <>
          {defaultsState.error && (
            <p className="shrink-0 border-t border-line px-4 py-2 text-[12px] text-red-400">
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
            <header className="flex h-12 items-center border-b border-line pl-4">
              <h3 className="font-semibold text-fg-0">
                {t("perm.demoteSelf.title")}
              </h3>
            </header>
            <p className="px-4 py-4 text-[13px] text-fg-2">
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
          <span className="flex w-28 shrink-0 items-center pl-4 text-[12px] text-fg-2">
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
