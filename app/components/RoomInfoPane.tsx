import { Check, Copy, Lock, LockOpen, X } from "lucide-react";
import type { MatrixClient, Room, RoomMember } from "matrix-js-sdk";
import { RoomMemberEvent, RoomStateEvent } from "matrix-js-sdk";
import { useEffect, useState } from "react";
import { getDmUserId } from "../lib/matrix";
import { Avatar, RoomAvatar } from "./Avatar";
import { PaneHeader, PaneHeaderButton } from "./PaneHeader";
import { roleLabel, UserProfileCard } from "./UserProfileCard";

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
}: {
  client: MatrixClient;
  room: Room;
  onClose: () => void;
}) {
  const [, force] = useState(0);
  const [copied, setCopied] = useState(false);
  // 멤버 클릭 → 프로필 카드 (anchor + 대상 userId)
  const [profile, setProfile] = useState<{
    userId: string;
    anchor: DOMRect;
  } | null>(null);
  const myUserId = client.getUserId() ?? "";
  const encrypted = room.hasEncryptionStateEvent();
  const dmUserId = getDmUserId(client, room);

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

  async function copyRoomId() {
    try {
      await navigator.clipboard.writeText(room.roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      console.warn("클립보드 복사 실패:", e);
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
          <p className="px-3 pb-1 pt-2 font-mono text-[11px] text-fg-3">
            멤버 — {members.length}명
          </p>
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
