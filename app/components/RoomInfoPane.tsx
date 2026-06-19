import {
  Check,
  Copy,
  Loader2,
  Lock,
  LockOpen,
  LogOut,
  UserPlus,
  X,
} from "lucide-react";
import type { MatrixClient, Room, RoomMember } from "matrix-js-sdk";
import { RoomMemberEvent, RoomStateEvent } from "matrix-js-sdk";
import { useEffect, useMemo, useState } from "react";
import { looksLikeUserId, useUserSearch } from "../hooks/useUserSearch";
import { getDmUserId } from "../lib/matrix";
import { Avatar, RoomAvatar } from "./Avatar";
import { PaneHeader, PaneHeaderButton } from "./PaneHeader";
import { roleLabel, UserProfileCard } from "./UserProfileCard";
import { UserResultRow } from "./UserResultRow";

function MemberRow({
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
  return (
    <li>
      <button
        type="button"
        className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left hover:bg-bg-2"
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
          {isMe && <span className="ml-1.5 text-[11px] text-fg-3">(나)</span>}
        </span>
        {role && (
          <span className="shrink-0 rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-fg-2">
            {role}
          </span>
        )}
      </button>
    </li>
  );
}

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
    (a, b) => b.powerLevel - a.powerLevel || a.name.localeCompare(b.name, "ko"),
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
      setInviteMsg("형식: @user:server");
      return;
    }
    setInviteBusy(true);
    setInviteMsg(null);
    try {
      await client.invite(room.roomId, target);
      setInviteMsg(`${target} 초대함`);
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
    <section className="flex w-[320px] shrink-0 flex-col border-l border-line">
      <PaneHeader
        actions={
          <PaneHeaderButton title="닫기" onClick={onClose}>
            <X className="h-[15px] w-[15px]" />
          </PaneHeaderButton>
        }
      >
        <h2 className="truncate font-semibold text-fg-0">방 정보</h2>
      </PaneHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* 방 프로필 */}
        <div className="flex flex-col items-center gap-2.5 border-b border-line px-5 py-6">
          <RoomAvatar client={client} room={room} size={56} />
          <p className="max-w-full truncate text-[15px] font-semibold text-fg-0">
            {room.name}
          </p>
          {topic && (
            <p className="max-w-full whitespace-pre-wrap break-words text-center text-[12px] leading-relaxed text-fg-2">
              {topic}
            </p>
          )}
          {/* roomId 복사 — DM이면 상대 userId가 더 유용 */}
          <button
            type="button"
            className="flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] text-fg-3 hover:bg-bg-2 hover:text-fg-1"
            title="복사"
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
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
              encrypted ? "border-line text-fg-1" : "border-line text-fg-3"
            }`}
          >
            {encrypted ? (
              <>
                <Lock className="h-3 w-3" /> 종단간 암호화됨
              </>
            ) : (
              <>
                <LockOpen className="h-3 w-3" /> 암호화 안 됨
              </>
            )}
          </span>
        </div>

        {/* 멤버 목록 */}
        <div className="p-2">
          <div className="flex items-center justify-between px-3 pb-1 pt-2">
            <p className="font-mono text-[11px] text-fg-3">
              멤버 — {members.length}명
            </p>
            {canInvite && (
              <button
                type="button"
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-fg-2 hover:bg-bg-2 hover:text-fg-0"
                onClick={() => {
                  setInviteOpen((v) => !v);
                  setInviteMsg(null);
                }}
              >
                <UserPlus className="h-3 w-3" />
                초대
              </button>
            )}
          </div>
          {/* 초대 폼 — 디렉토리 검색 + 직접 @user:server 입력 */}
          {inviteOpen && (
            <div className="mx-1 mb-2 flex flex-col gap-1.5 rounded-lg border border-line p-2">
              <input
                className="w-full rounded-md border border-line bg-bg-2 px-2 py-1.5 text-[12px] text-fg-0 outline-none placeholder:text-fg-3 focus:border-line-strong"
                placeholder="이름 또는 @user:server 검색"
                value={inviteTerm}
                autoFocus
                onChange={(e) => setInviteTerm(e.target.value)}
              />
              {inviteMsg && (
                <p className="px-1 text-[11px] text-fg-2">{inviteMsg}</p>
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
                      <p className="px-2 py-3 text-center text-[12px] text-fg-3">
                        검색 중…
                      </p>
                    )}
                    {!inviteSearching &&
                      !directEntry &&
                      inviteResults.length === 0 &&
                      trimmed.length > 0 && (
                        <p className="px-2 py-3 text-center text-[12px] text-fg-3">
                          결과 없음. @user:server로 직접 입력 가능
                        </p>
                      )}
                  </div>
                );
              })()}
            </div>
          )}
          <ul>
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
        </div>

        {/* 위험 영역: 방 나가기 (2단계 확인) */}
        <div className="border-t border-line p-3">
          {leaveArmed ? (
            <div className="flex flex-col gap-1.5">
              <p className="px-1 text-[12px] text-fg-2">
                정말 나갈까?{" "}
                {encrypted &&
                  "암호화 방은 다시 들어와도 이전 메시지를 못 읽을 수 있어."}
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-red-950/60 py-1.5 text-[12px] font-medium text-red-300 hover:bg-red-900/60 disabled:opacity-50"
                  disabled={leaveBusy}
                  onClick={leave}
                >
                  {leaveBusy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <LogOut className="h-3 w-3" />
                  )}
                  나가기
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-md border border-line py-1.5 text-[12px] text-fg-2 hover:bg-bg-2"
                  disabled={leaveBusy}
                  onClick={() => setLeaveArmed(false)}
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] text-fg-2 hover:bg-bg-2 hover:text-red-300"
              onClick={() => setLeaveArmed(true)}
            >
              <LogOut className="h-3 w-3" />방 나가기
            </button>
          )}
        </div>
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
    </section>
  );
}
