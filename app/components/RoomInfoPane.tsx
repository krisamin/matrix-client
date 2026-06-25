import {
  Check,
  Copy,
  Lock,
  LockOpen,
  LogOut,
  Settings,
  UserPlus,
  X,
} from "lucide-react";
import type { MatrixClient, Room, RoomMember } from "matrix-js-sdk";
import { RoomMemberEvent, RoomStateEvent } from "matrix-js-sdk";
import { memo, useEffect, useMemo, useState } from "react";
import { looksLikeUserId, useUserSearch } from "../hooks/useUserSearch";
import { useT } from "../lib/i18n";
import { getDmUserId } from "../lib/matrix";
import { Avatar, RoomAvatar } from "./Avatar";
import { EmptyState } from "./EmptyState";
import { SectionHeader } from "./Form";
import { InlineSpinner } from "./InlineSpinner";
import { PaneHeader, PaneHeaderButton } from "./PaneHeader";
import { RoomSettingsModal } from "./RoomSettingsModal";
import { roleLabel, UserProfileCard } from "./UserProfileCard";
import { UserResultRow } from "./UserResultRow";

const KOREAN_COLLATOR = new Intl.Collator("ko");

const MemberRow = memo(function MemberRowInner({
  client,
  member,
  isMe,
  onClick,
}: {
  client: MatrixClient;
  member: RoomMember;
  isMe: boolean;
  onClick: (rect: DOMRect) => void;
}) {
  const role = roleLabel(member.powerLevel);
  const t = useT();
  return (
    <li>
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-bg-2"
        title={member.userId}
        onClick={(e) => onClick(e.currentTarget.getBoundingClientRect())}
      >
        <Avatar
          client={client}
          mxcUrl={member.getMxcAvatarUrl()}
          name={member.name}
          shape="round"
          size={20}
        />
        <span className="min-w-0 flex-1 truncate text-[13px] text-fg-1">
          {member.name}
          {isMe && (
            <span className="ml-1.5 text-[11px] text-fg-3">
              {t("roomInfo.member.tag")}
            </span>
          )}
        </span>
        {role && (
          <span className="shrink-0 rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-fg-2">
            {role}
          </span>
        )}
      </button>
    </li>
  );
});

/** 방 정보 패널 (우측 분할) — 아바타/이름/토픽, roomId 복사,
 *  E2EE 상태, 멤버 목록 (파워레벨순 정렬 + 역할 배지, 멤버십 변화 실시간 반영) */
export function RoomInfoPane({
  client,
  room,
  onClose,
  onLeft,
}: {
  client: MatrixClient;
  room: Room;
  onClose: () => void;
  /** 방을 나간 뒤 호출 (라우팅은 호출부 책임) */
  onLeft: () => void;
}) {
  const t = useT();
  const [, force] = useState(0);
  const [copied, setCopied] = useState(false);
  // 초대 폼 상태
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteTerm, setInviteTerm] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  // 나가기 (2단계 확인)
  const [leaveArmed, setLeaveArmed] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  // 멤버 클릭 → 프로필 카드 (anchor + 대상 userId)
  const [profile, setProfile] = useState<{
    userId: string;
    anchor: DOMRect;
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const myUserId = client.getUserId() ?? "";
  const encrypted = room.hasEncryptionStateEvent();
  const dmUserId = getDmUserId(client, room);
  const canInvite = room.canInvite(myUserId);

  // 멤버십/프로필/파워레벨 변화 실시간 반영
  useEffect(() => {
    const bump = () => force((n) => n + 1);
    client.on(RoomStateEvent.Members, bump);
    client.on(RoomMemberEvent.Name, bump);
    client.on(RoomMemberEvent.PowerLevel, bump);
    return () => {
      client.off(RoomStateEvent.Members, bump);
      client.off(RoomMemberEvent.Name, bump);
      client.off(RoomMemberEvent.PowerLevel, bump);
    };
  }, [client]);

  const topic: string =
    room.currentState.getStateEvents("m.room.topic", "")?.getContent().topic ??
    "";

  // 정렬: 파워레벨 내림차순 → 이름순 (Element과 동일한 감각).
  // useMemo 안 씀 — 멤버 변화 리스너가 tick으로 리렌더를 트리거하는 구조라
  // 렌더마다 재계산이 곧 의도. (멤버 수백 명 수준에선 비용 무시 가능)
  const members = [...room.getJoinedMembers()].sort(
    (a, b) =>
      b.powerLevel - a.powerLevel || KOREAN_COLLATOR.compare(a.name, b.name),
  );

  // 초대 검색: 이미 방에 있거나(join) 초대 대기중(invite)인 사람은 후보에서 제외
  const excludeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of room.getMembersWithMembership("join")) ids.add(m.userId);
    for (const m of room.getMembersWithMembership("invite")) ids.add(m.userId);
    return ids;
    // members 리스너 tick으로 리렌더되므로 room 참조만으로 충분
  }, [room]);
  const { results: inviteResults, searching: inviteSearching } = useUserSearch(
    client,
    inviteTerm,
    excludeIds,
  );

  async function copyRoomId() {
    try {
      await navigator.clipboard.writeText(room.roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      console.warn("클립보드 복사 실패:", e);
    }
  }

  async function invite(target: string) {
    if (inviteBusy) return;
    // 형식 검증: @local:server
    if (!looksLikeUserId(target)) {
      setInviteMsg(t("invite.formatError"));
      return;
    }
    setInviteBusy(true);
    setInviteMsg(null);
    try {
      await client.invite(room.roomId, target);
      setInviteMsg(t("invite.invited", { user: target }));
      setInviteTerm("");
    } catch (e) {
      setInviteMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setInviteBusy(false);
    }
  }

  async function leave() {
    if (leaveBusy) return;
    setLeaveBusy(true);
    try {
      await client.leave(room.roomId);
      onLeft();
    } catch (e) {
      console.warn("방 나가기 실패:", e);
      setLeaveBusy(false);
      setLeaveArmed(false);
    }
  }

  return (
    <section className="flex w-[340px] shrink-0 flex-col border-l border-line">
      <PaneHeader
        actions={
          <>
            <PaneHeaderButton
              title={t("roomInfo.action.settings")}
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="h-[15px] w-[15px]" />
            </PaneHeaderButton>
            <PaneHeaderButton
              title={t("roomInfo.action.close")}
              onClick={onClose}
            >
              <X className="h-[15px] w-[15px]" />
            </PaneHeaderButton>
          </>
        }
      >
        <h2 className="truncate font-semibold text-fg-0">
          {t("roomInfo.title")}
        </h2>
      </PaneHeader>

      <div className="min-h-0 flex-1 overflow-y-auto bg-bg-1">
        {/* 방 프로필 — 헤더 띠 톤 (border-b는 다음 SectionHeader가 책임) */}
        <div className="flex flex-col items-center gap-2.5 bg-bg-2/30 px-4 py-6">
          <RoomAvatar client={client} room={room} size={56} />
          <p className="max-w-full truncate text-[15px] font-semibold text-fg-0">
            {room.name}
          </p>
          {topic && (
            <p className="selectable max-w-full whitespace-pre-wrap break-words text-center text-[12px] leading-relaxed text-fg-2">
              {topic}
            </p>
          )}
          {/* roomId 복사 — DM이면 상대 userId가 더 유용 */}
          <button
            type="button"
            className="flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] text-fg-3 hover:bg-bg-2 hover:text-fg-1"
            title={t("roomInfo.copy.title")}
            onClick={copyRoomId}
          >
            <span className="truncate">{dmUserId ?? room.roomId}</span>
            {copied ? (
              <Check className="h-3 w-3 shrink-0 text-green-400" />
            ) : (
              <Copy className="h-3 w-3 shrink-0" />
            )}
          </button>
          {/* E2EE 상태 */}
          <span
            className={`flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[11px] ${
              encrypted ? "text-fg-1" : "text-fg-3"
            }`}
          >
            {encrypted ? (
              <>
                <Lock className="h-3 w-3" /> {t("roomInfo.e2ee.on")}
              </>
            ) : (
              <>
                <LockOpen className="h-3 w-3" /> {t("roomInfo.e2ee.off")}
              </>
            )}
          </span>
        </div>

        {/* 멤버 섹션 — SectionHeader + 우측 +초대 액션 */}
        <SectionHeader
          actions={
            canInvite && (
              <button
                type="button"
                className="flex aspect-square h-full shrink-0 items-center justify-center text-fg-2 hover:bg-bg-2 hover:text-fg-0"
                onClick={() => {
                  setInviteOpen((v) => !v);
                  setInviteMsg(null);
                }}
                title={t("roomInfo.invite.title")}
              >
                <UserPlus className="h-3.5 w-3.5" />
              </button>
            )
          }
        >
          {t("roomInfo.section.members")}
          <span className="ml-1.5 font-mono text-[11px] text-fg-3">
            {members.length}
          </span>
        </SectionHeader>
        {/* 초대 폼 — 섹션 헤더 바로 아래 슬라이드인. wrapper의 border-b
            제거 — 자식 label/p가 각자 border-b로 처리. */}
        {inviteOpen && (
          <div className="flex flex-col bg-bg-2/20">
            <label className="flex items-center gap-2 border-b border-line px-4 py-2">
              <span className="shrink-0 text-[11px] text-fg-3">
                {t("roomInfo.search.label")}
              </span>
              <input
                className="flex-1 bg-transparent text-[12px] text-fg-0 outline-none placeholder:text-fg-3"
                placeholder={t("roomInfo.search.placeholder")}
                value={inviteTerm}
                autoFocus
                onChange={(e) => setInviteTerm(e.target.value)}
              />
            </label>
            {inviteMsg && (
              <p className="border-b border-line px-4 py-1.5 text-[11px] text-fg-2">
                {inviteMsg}
              </p>
            )}
            {(() => {
              const trimmed = inviteTerm.trim();
              const directEntry =
                looksLikeUserId(trimmed) &&
                !inviteResults.some((r) => r.userId === trimmed) &&
                !excludeIds.has(trimmed)
                  ? trimmed
                  : null;
              return (
                <div className="max-h-[30vh] overflow-y-auto">
                  {directEntry && (
                    <UserResultRow
                      client={client}
                      userId={directEntry}
                      busy={inviteBusy}
                      onClick={() => invite(directEntry)}
                    />
                  )}
                  {inviteResults.map((r) => (
                    <UserResultRow
                      key={r.userId}
                      client={client}
                      userId={r.userId}
                      displayName={r.displayName}
                      avatarUrl={r.avatarUrl}
                      busy={inviteBusy}
                      onClick={() => invite(r.userId)}
                    />
                  ))}
                  {inviteSearching && (
                    <EmptyState
                      size="sm"
                      body={t("roomInfo.search.searching")}
                    />
                  )}
                  {!inviteSearching &&
                    !directEntry &&
                    inviteResults.length === 0 &&
                    trimmed.length > 0 && (
                      <EmptyState
                        size="sm"
                        body={t("roomInfo.search.notFound")}
                      />
                    )}
                </div>
              );
            })()}
          </div>
        )}
        <ul className="flex flex-col divide-y divide-line">
          {members.map((m) => (
            <MemberRow
              key={m.userId}
              client={client}
              member={m}
              isMe={m.userId === myUserId}
              onClick={(rect) =>
                setProfile((v) =>
                  v?.userId === m.userId
                    ? null
                    : { userId: m.userId, anchor: rect },
                )
              }
            />
          ))}
        </ul>

        {/* 위험 영역 — SectionHeader로 시각 구분, 풀폭 버튼 */}
        <SectionHeader>{t("roomInfo.section.danger")}</SectionHeader>
        {leaveArmed ? (
          <>
            <p className="border-b border-line px-4 py-3 text-[12px] text-fg-2">
              {t("roomInfo.leave.confirm")}
              {encrypted && t("roomInfo.leave.warn")}
            </p>
            <div className="flex">
              <button
                type="button"
                className="flex-1 border-r border-line py-2.5 text-[13px] text-fg-2 hover:bg-bg-2 hover:text-fg-0 disabled:opacity-50"
                disabled={leaveBusy}
                onClick={() => setLeaveArmed(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="flex flex-1 items-center justify-center gap-1.5 bg-red-950/40 py-2.5 text-[13px] font-medium text-red-300 hover:bg-red-900/50 disabled:opacity-50"
                disabled={leaveBusy}
                onClick={leave}
              >
                {leaveBusy ? (
                  <InlineSpinner size="xs" />
                ) : (
                  <LogOut className="h-3 w-3" />
                )}
                {t("roomInfo.leave.confirmBtn")}
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1.5 py-2.5 text-[13px] text-fg-2 hover:bg-bg-2 hover:text-red-300"
            onClick={() => setLeaveArmed(true)}
          >
            <LogOut className="h-3 w-3" />
            {t("roomInfo.leave.action")}
          </button>
        )}
      </div>
      {profile && (
        <UserProfileCard
          client={client}
          room={room}
          userId={profile.userId}
          anchor={profile.anchor}
          onClose={() => setProfile(null)}
        />
      )}
      {settingsOpen && (
        <RoomSettingsModal
          client={client}
          room={room}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </section>
  );
}
