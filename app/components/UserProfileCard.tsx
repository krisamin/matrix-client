import { Check, Copy, ShieldCheck } from "lucide-react";
import type { MatrixClient, Room, RoomMember } from "matrix-js-sdk";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "./Avatar";

/** 파워레벨 → 역할 라벨 (Element 관례: 100 관리자 / 50 중재자) */
export function roleLabel(power: number): string | null {
  if (power >= 100) return "관리자";
  if (power >= 50) return "중재자";
  return null;
}

const W = 280;
const MARGIN = 8;
const GAP = 6;
const EST_H = 230; // 위/아래 열림 판단용 추정 높이

/** 유저 프로필 카드 팝오버 — 앵커(클릭 요소 rect) 기준 포털.
 *  아바타/표시이름/userId 복사/역할/멤버십. 배경 클릭·Esc 닫기 */
export function UserProfileCard({
  client,
  room,
  userId,
  anchor,
  onClose,
}: {
  client: MatrixClient;
  room: Room;
  userId: string;
  /** 트리거 요소의 getBoundingClientRect() */
  anchor: DOMRect;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const member: RoomMember | null = room.getMember(userId);
  const name = member?.name ?? userId;
  const role = member ? roleLabel(member.powerLevel) : null;
  const isMe = userId === client.getUserId();

  // 위치: 앵커 왼쪽 정렬 + 뷰포트 클램프, 아래 우선 / 공간 부족 시 위
  const x = Math.min(
    Math.max(MARGIN, anchor.left),
    window.innerWidth - W - MARGIN,
  );
  const openBelow = anchor.bottom + EST_H + GAP <= window.innerHeight - MARGIN;
  const y = openBelow
    ? anchor.bottom + GAP
    : Math.max(MARGIN, anchor.top - EST_H - GAP);

  async function copyUserId() {
    try {
      await navigator.clipboard.writeText(userId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      console.warn("클립보드 복사 실패:", e);
    }
  }

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      />
      <div
        className="msg-in fixed z-50 overflow-hidden rounded-lg border border-line bg-bg-2 shadow-xl"
        style={{ left: x, top: y, width: W }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        {/* 상단: 아바타 + 이름 */}
        <div className="flex flex-col items-center gap-2 border-b border-line px-4 pb-4 pt-5">
          <Avatar
            client={client}
            mxcUrl={member?.getMxcAvatarUrl()}
            name={name}
            shape="round"
            size={56}
          />
          <p className="max-w-full truncate text-[15px] font-semibold text-fg-0">
            {name}
            {isMe && <span className="ml-1.5 text-[11px] text-fg-3">(나)</span>}
          </p>
          <button
            type="button"
            className="flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] text-fg-3 hover:bg-bg-3 hover:text-fg-1"
            title="userId 복사"
            onClick={copyUserId}
          >
            <span className="truncate">{userId}</span>
            {copied ? (
              <Check className="h-3 w-3 shrink-0 text-green-400" />
            ) : (
              <Copy className="h-3 w-3 shrink-0" />
            )}
          </button>
        </div>

        {/* 이 방에서의 상태 */}
        <div className="flex flex-col gap-1 px-4 py-3 text-[12px] text-fg-2">
          <span className="flex items-center justify-between">
            <span className="text-fg-3">역할</span>
            <span className="flex items-center gap-1 text-fg-1">
              {role && <ShieldCheck className="h-3 w-3" />}
              {role ?? "멤버"}
              <span className="ml-1 font-mono text-[10px] text-fg-3">
                PL{member?.powerLevel ?? 0}
              </span>
            </span>
          </span>
          <span className="flex items-center justify-between">
            <span className="text-fg-3">상태</span>
            <span className="text-fg-1">
              {member?.membership === "join"
                ? "참여 중"
                : member?.membership === "invite"
                  ? "초대됨"
                  : member?.membership === "leave"
                    ? "나감"
                    : member?.membership === "ban"
                      ? "차단됨"
                      : "알 수 없음"}
            </span>
          </span>
        </div>
      </div>
    </>,
    document.body,
  );
}
