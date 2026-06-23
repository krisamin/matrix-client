import { Ban, Loader2, ShieldOff, Upload, UserMinus } from "lucide-react";
import type {
  GuestAccess,
  HistoryVisibility,
  JoinRule,
  MatrixClient,
  Room,
  Visibility,
} from "matrix-js-sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  banMember,
  canSendStateEvent,
  getRoomDirectoryVisibility,
  getRoomPowerLevels,
  kickMember,
  setRoomAvatar,
  setRoomCanonicalAlias,
  setRoomDirectoryVisibility,
  setRoomGuestAccess,
  setRoomHistoryVisibility,
  setRoomJoinRule,
  setRoomNameAndTopic,
  setUserPowerLevel,
  unbanMember,
} from "../lib/matrix";
import { RoomAvatar } from "./Avatar";

type Tab = "general" | "access" | "permissions" | "danger";

// 역할 ↔ PL 매핑 (Element 관례)
const ROLE_LEVELS = { 멤버: 0, 모더레이터: 50, 관리자: 100 } as const;
function levelToRole(lvl: number): string {
  if (lvl >= 100) return "관리자";
  if (lvl >= 50) return "모더레이터";
  return "멤버";
}

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
        {/* 좌측 탭 */}
        <aside className="flex w-40 shrink-0 flex-col border-r border-line bg-bg-1">
          <header className="flex h-12 items-center border-b border-line px-4">
            <h2 className="truncate font-semibold text-fg-0">방 설정</h2>
          </header>
          {(
            [
              { id: "general", label: "일반" },
              { id: "access", label: "접근" },
              { id: "permissions", label: "권한" },
              { id: "danger", label: "위험" },
            ] as { id: Tab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`border-b border-line px-4 py-2.5 text-left text-[13px] ${
                tab === t.id
                  ? "bg-bg-2 text-fg-0"
                  : "text-fg-2 hover:bg-bg-2 hover:text-fg-0"
              } ${t.id === "danger" ? "text-red-400" : ""}`}
            >
              {t.label}
            </button>
          ))}
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
            <PermissionsTab client={client} room={room} />
          )}
          {tab === "danger" && (
            <DangerTab client={client} room={room} onClose={onClose} />
          )}
        </section>
      </div>
    </div>
  );
}

/* ──────────── 공용 row 컴포넌트 ──────────── */

function Row({
  label,
  children,
  description,
}: {
  label: string;
  children: React.ReactNode;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-1 px-5 py-2.5">
      <div className="flex items-center gap-3">
        <span className="w-28 shrink-0 text-[12px] text-fg-3">{label}</span>
        <div className="flex flex-1 items-center">{children}</div>
      </div>
      {description && (
        <p className="pl-[7.75rem] text-[11px] text-fg-3">{description}</p>
      )}
    </div>
  );
}

function Footer({
  busy,
  dirty,
  onCancel,
  onSave,
  saveLabel = "저장",
}: {
  busy: boolean;
  dirty: boolean;
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
}) {
  return (
    <div className="flex border-t border-line">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 border-r border-line py-2.5 text-[13px] text-fg-2 hover:bg-bg-2 hover:text-fg-0"
      >
        취소
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={busy || !dirty}
        className="flex-1 bg-bg-2 py-2.5 text-[13px] font-medium text-fg-0 hover:bg-bg-3 disabled:opacity-50"
      >
        {busy ? "저장 중…" : saveLabel}
      </button>
    </div>
  );
}

/* ──────────── 일반 탭: 이름·주제·아바타 ──────────── */

function GeneralTab({
  client,
  room,
  onClose,
}: {
  client: MatrixClient;
  room: Room;
  onClose: () => void;
}) {
  const initialName = room.name;
  const initialTopic =
    room.currentState.getStateEvents("m.room.topic", "")?.getContent().topic ??
    "";
  const [name, setName] = useState(initialName);
  const [topic, setTopic] = useState(initialTopic);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canName = canSendStateEvent(room, client, "m.room.name");
  const canTopic = canSendStateEvent(room, client, "m.room.topic");
  const canAvatar = canSendStateEvent(room, client, "m.room.avatar");

  // 새로 고른 파일의 로컬 미리보기 (objectURL) — ProfileEdit 패턴 그대로
  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("이미지 파일만 가능해");
      return;
    }
    setError(null);
    setPendingFile(f);
  }

  const dirty =
    name.trim() !== initialName ||
    topic !== initialTopic ||
    pendingFile !== null;

  async function save() {
    if (busy || !dirty) return;
    setBusy(true);
    setError(null);
    try {
      const changes: { name?: string; topic?: string } = {};
      if (name.trim() !== initialName) changes.name = name.trim();
      if (topic !== initialTopic) changes.topic = topic;
      if (changes.name || changes.topic) {
        await setRoomNameAndTopic(client, room.roomId, changes);
      }
      if (pendingFile) {
        const up = await client.uploadContent(pendingFile, {
          type: pendingFile.type,
        });
        await setRoomAvatar(client, room.roomId, up.content_uri);
        setPendingFile(null);
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
        {/* 아바타 영역 — ProfileEditModal과 동일한 헤더 띠 톤.
         *  현재 방 아바타가 즉시 보이고 (RoomAvatar는 mxc 자동 해석),
         *  클릭/호버 Upload 오버레이로 이미지 변경. 새 파일 고르면 로컬 미리보기. */}
        <div className="flex flex-col items-center gap-2 border-b border-line bg-bg-2/30 px-5 py-5">
          <button
            type="button"
            className="group relative rounded-md disabled:cursor-not-allowed"
            onClick={() => fileRef.current?.click()}
            disabled={!canAvatar}
            title={canAvatar ? "아바타 변경" : "권한 없음"}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="새 아바타 미리보기"
                className="h-20 w-20 rounded-md object-cover"
              />
            ) : (
              <RoomAvatar client={client} room={room} size={80} />
            )}
            {canAvatar && (
              <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <Upload className="h-5 w-5 text-white" />
              </span>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={pickFile}
          />
          <span className="font-mono text-[11px] text-fg-3">{room.roomId}</span>
        </div>

        {/* 필드 — divide-y row */}
        <div className="flex flex-col divide-y divide-line">
          <Row label="방 이름">
            <input
              type="text"
              value={name}
              disabled={!canName}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none placeholder:text-fg-3 disabled:opacity-50"
            />
          </Row>
          <Row label="주제">
            <input
              type="text"
              value={topic}
              disabled={!canTopic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="(설명 없음)"
              className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none placeholder:text-fg-3 disabled:opacity-50"
            />
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
          <Row label="별칭" description={`형식: #이름:${myDomain}`}>
            <div className="flex flex-1 items-center gap-1">
              <span className="text-[13px] text-fg-3">#</span>
              <input
                type="text"
                value={aliasLocalpart}
                disabled={!canAlias}
                onChange={(e) => setAliasLocalpart(e.target.value)}
                placeholder="(없음)"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-fg-0 outline-none placeholder:text-fg-3 disabled:opacity-50"
              />
              {aliasLocalpart && (
                <span className="text-[11px] text-fg-3">:{myDomain}</span>
              )}
            </div>
          </Row>
          {aliasInvalid && (
            <p className="px-5 py-1.5 text-[11px] text-red-400">
              영문/숫자/_-. 만 사용 가능
            </p>
          )}
          <Row label="디렉토리" description="홈서버 공개 방 목록 노출 여부">
            <select
              value={directory === "loading" ? "private" : directory}
              disabled={directory === "loading"}
              onChange={(e) =>
                setDirectory(e.target.value as "public" | "private")
              }
              className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none disabled:opacity-50"
            >
              <option value="private">비공개</option>
              <option value="public">공개</option>
            </select>
          </Row>
          <Row label="가입 방식">
            <select
              value={joinRule}
              disabled={!canJoin}
              onChange={(e) => setJoinRule(e.target.value as JoinRule)}
              className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none disabled:opacity-50"
            >
              <option value="invite">초대받은 사람만</option>
              <option value="public">누구나</option>
              <option value="knock">노크 후 승인</option>
              <option value="restricted">제한적 (Space 멤버)</option>
            </select>
          </Row>
          <Row label="게스트">
            <select
              value={guestAccess}
              disabled={!canGuest}
              onChange={(e) => setGuestAccess(e.target.value as GuestAccess)}
              className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none disabled:opacity-50"
            >
              <option value="forbidden">금지</option>
              <option value="can_join">허용</option>
            </select>
          </Row>
          <Row label="이전 메시지">
            <select
              value={historyVis}
              disabled={!canHistory}
              onChange={(e) =>
                setHistoryVis(e.target.value as HistoryVisibility)
              }
              className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none disabled:opacity-50"
            >
              <option value="invited">초대받은 시점부터</option>
              <option value="joined">참여한 시점부터</option>
              <option value="shared">공유 시점부터</option>
              <option value="world_readable">누구나</option>
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
}: {
  client: MatrixClient;
  room: Room;
}) {
  const myUserId = client.getUserId() ?? "";
  const [, force] = useState(0);
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
      setError("자신보다 권한이 같거나 높은 사람은 변경할 수 없어");
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
            보기 전용 — 권한 변경 권한이 없어
          </p>
        )}
        <div className="flex flex-col divide-y divide-line">
          {/* 멤버 역할 */}
          <div className="px-5 py-2 text-[11px] font-medium text-fg-3">
            멤버 — {members.length}명
          </div>
          {members.map((m) => {
            const lvl = pls.users[m.userId] ?? pls.users_default;
            const role = levelToRole(lvl);
            const isMe = m.userId === myUserId;
            const canEditThis = canEditPL && (isMe ? lvl > 0 : lvl < myLevel);
            return (
              <div key={m.userId} className="flex items-center gap-3 px-5 py-2">
                <span className="min-w-0 flex-1 truncate text-[13px] text-fg-1">
                  {m.name}
                  {isMe && (
                    <span className="ml-1.5 text-[11px] text-fg-3">(나)</span>
                  )}
                </span>
                <span className="font-mono text-[11px] text-fg-3">{lvl}</span>
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
                    className="rounded-md border border-line bg-bg-2 px-2 py-1 text-[12px] text-fg-0 outline-none focus:bg-bg-3"
                  >
                    <option value="멤버">멤버 (0)</option>
                    <option value="모더레이터">모더레이터 (50)</option>
                    <option value="관리자">관리자 (100)</option>
                  </select>
                ) : (
                  <span className="rounded-md border border-line px-2 py-1 text-[12px] text-fg-2">
                    {role}
                  </span>
                )}
              </div>
            );
          })}

          {/* 기본 액션 PL */}
          <div className="px-5 py-2 text-[11px] font-medium text-fg-3">
            기본 권한 — 액션별 최소 레벨
          </div>
          <DefaultPLEditor
            client={client}
            room={room}
            pls={pls}
            canEdit={canEditPL}
          />
        </div>
        {error && (
          <p className="border-t border-line px-5 py-2.5 text-[12px] text-red-400">
            {error}
          </p>
        )}
      </div>

      {/* 자기 강등 확인 */}
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
            <header className="flex h-12 items-center border-b border-line px-5">
              <h3 className="font-semibold text-fg-0">정말 자기 강등?</h3>
            </header>
            <p className="px-5 py-4 text-[13px] text-fg-2">
              자신의 권한을 낮추면{" "}
              <strong className="text-fg-0">되돌릴 수 없어</strong>. 더 높은
              권한자가 다시 올려줘야 해.
            </p>
            <div className="flex border-t border-line">
              <button
                type="button"
                onClick={() => setPendingTarget(null)}
                className="flex-1 border-r border-line py-2.5 text-[13px] text-fg-2 hover:bg-bg-2 hover:text-fg-0"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() =>
                  pendingTarget &&
                  applyLevel(pendingTarget.userId, pendingTarget.newLevel)
                }
                className="flex-1 bg-red-950/60 py-2.5 text-[13px] font-medium text-red-300 hover:bg-red-900/60"
              >
                강등
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
}: {
  client: MatrixClient;
  room: Room;
  pls: ReturnType<typeof getRoomPowerLevels>;
  canEdit: boolean;
}) {
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
      setError(`내 권한(${myLevel})보다 높은 값은 설정할 수 없어`);
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
    { label: "메시지 보내기", value: eventsDefault, set: setEventsDefault },
    { label: "상태 이벤트", value: stateDefault, set: setStateDefault },
    { label: "초대", value: invite, set: setInvite },
    { label: "강퇴", value: kick, set: setKick },
    { label: "추방", value: ban, set: setBan },
    { label: "메시지 삭제", value: redact, set: setRedact },
  ];

  return (
    <>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3 px-5 py-2">
          <span className="w-28 shrink-0 text-[12px] text-fg-2">{r.label}</span>
          <input
            type="number"
            min={0}
            max={100}
            value={r.value}
            disabled={!canEdit}
            onChange={(e) => r.set(Number(e.target.value))}
            className="w-20 rounded-md border border-line bg-bg-2 px-2 py-1 text-[12px] text-fg-0 outline-none focus:bg-bg-3 disabled:opacity-50"
          />
          <span className="text-[11px] text-fg-3">
            (기본 {r.label === "메시지 보내기" || r.label === "초대" ? 0 : 50})
          </span>
        </div>
      ))}
      {canEdit && (
        <div className="flex items-center justify-end gap-2 px-5 py-2">
          {error && (
            <span className="mr-auto text-[12px] text-red-400">{error}</span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={busy || !dirty}
            className="rounded-md bg-bg-2 px-3 py-1 text-[12px] font-medium text-fg-0 hover:bg-bg-3 disabled:opacity-50"
          >
            {busy ? "저장 중…" : "기본 권한 저장"}
          </button>
        </div>
      )}
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
        <div className="flex flex-col divide-y divide-line">
          <div className="px-5 py-2 text-[11px] font-medium text-fg-3">
            멤버 — {members.length}명 (나 제외)
          </div>
          {members.map((m) => (
            <div key={m.userId} className="flex items-center gap-2 px-5 py-2">
              <span className="min-w-0 flex-1 truncate text-[13px] text-fg-1">
                {m.name}
              </span>
              <button
                type="button"
                onClick={() => doKick(m.userId)}
                disabled={!canKick || busy === m.userId}
                title="강퇴 (다시 들어올 수 있음)"
                className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-fg-2 hover:bg-bg-2 hover:text-fg-0 disabled:opacity-50"
              >
                <UserMinus className="h-3 w-3" />
                강퇴
              </button>
              <button
                type="button"
                onClick={() => doBan(m.userId)}
                disabled={!canKick || busy === m.userId}
                title="추방 (재가입 차단)"
                className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-red-400 hover:bg-red-950/30 disabled:opacity-50"
              >
                <Ban className="h-3 w-3" />
                추방
              </button>
              {busy === m.userId && (
                <Loader2 className="h-3 w-3 animate-spin text-fg-3" />
              )}
            </div>
          ))}

          {banned.length > 0 && (
            <>
              <div className="px-5 py-2 text-[11px] font-medium text-fg-3">
                추방됨 — {banned.length}명
              </div>
              {banned.map((m) => (
                <div
                  key={m.userId}
                  className="flex items-center gap-2 px-5 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg-2">
                    {m.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => doUnban(m.userId)}
                    disabled={busy === m.userId}
                    className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-fg-2 hover:bg-bg-2 hover:text-fg-0 disabled:opacity-50"
                  >
                    <ShieldOff className="h-3 w-3" />
                    추방 해제
                  </button>
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
          닫기
        </button>
      </div>
    </>
  );
}
