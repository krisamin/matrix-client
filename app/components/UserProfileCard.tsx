import { Check, Copy, ShieldCheck } from "lucide-react";
import type { MatrixClient, Room, RoomMember } from "matrix-js-sdk";
import { useState } from "react";
import { createPortal } from "react-dom";
import { usePresence } from "../hooks/usePresence";
import { useT } from "../lib/i18n";
import { Avatar, PresenceDot } from "./Avatar";
import { CardHeader } from "./CardHeader";
import { InfoRow } from "./InfoRow";

/** 파워레벨 → 역할 라벨 (Element 관례: 100 관리자 / 50 중재자) */
export function roleLabel(power: number): string | null {
  if (power >= 100) return "admin";
  if (power >= 50) return "mod";
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
  const t = useT();
  const [copied, setCopied] = useState(false);
  const member: RoomMember | null = room.getMember(userId);
  const name = member?.name ?? userId;
  const role = member ? roleLabel(member.powerLevel) : null;
  const isMe = userId === client.getUserId();
  const presence = usePresence(client, userId);

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
        className="msg-in fixed z-50 overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl"
        style={{ left: x, top: y, width: W }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        {/* 상단: 아바타 + 이름 (모달 헤더 톤과 같은 살짝 어두운 띠) */}
        <CardHeader>
          <Avatar
            client={client}
            mxcUrl={member?.getMxcAvatarUrl()}
            name={name}
            shape="round"
            size={56}
          />
          <p className="max-w-full truncate text-[15px] font-semibold text-fg-0">
            {name}
            {isMe && (
              <span className="ml-1.5 text-[11px] text-fg-3">
                {t("userCard.me")}
              </span>
            )}
          </p>
          <button
            type="button"
            className="flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] text-fg-3 hover:bg-bg-2 hover:text-fg-1"
            title={t("userCard.copyTitle")}
            onClick={copyUserId}
          >
            <span className="truncate">{userId}</span>
            {copied ? (
              <Check className="h-3 w-3 shrink-0 text-green-400" />
            ) : (
              <Copy className="h-3 w-3 shrink-0" />
            )}
          </button>
        </CardHeader>

        {/* 이 방에서의 상태 — divide-y 그리드 */}
        <div className="flex flex-col divide-y divide-line">
          <InfoRow label={t("userCard.field.role")} labelWidth="w-16">
            {role && <ShieldCheck className="h-3 w-3" />}
            {t(
              role === "admin"
                ? "userCard.role.admin"
                : role === "mod"
                  ? "userCard.role.mod"
                  : "userCard.member",
            )}
            <span className="ml-auto font-mono text-[11px] text-fg-3">
              PL{member?.powerLevel ?? 0}
            </span>
          </InfoRow>
          <InfoRow label={t("userCard.field.status")} labelWidth="w-16">
            {member?.membership === "join"
              ? t("userCard.membership.join")
              : member?.membership === "invite"
                ? t("userCard.membership.invite")
                : member?.membership === "leave"
                  ? t("userCard.membership.leave")
                  : member?.membership === "ban"
                    ? t("userCard.membership.ban")
                    : t("userCard.membership.unknown")}
          </InfoRow>
          {presence && (
            <InfoRow label={t("userCard.field.presence")} labelWidth="w-16">
              <PresenceDot presence={presence} size={8} />
              {t(
                presence === "online"
                  ? "presence.online"
                  : presence === "unavailable"
                    ? "presence.away"
                    : "presence.offline",
              )}
            </InfoRow>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
