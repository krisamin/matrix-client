import type { MatrixClient, Room } from "matrix-js-sdk";
import { memo, useEffect, useState } from "react";
import { type Presence, usePresence } from "../hooks/usePresence";
import { useT } from "../lib/i18n";
import { getDmUserId } from "../lib/matrix";
import { getThumbnailBlobUrl } from "../lib/media";

/** presence 점 — 아바타 우하단에 겹치는 상태 표시.
 *  online=초록 / unavailable(자리비움)=노랑 / offline=회색 테두리만 */
export function PresenceDot({
  presence,
  size = 10,
}: {
  presence: Presence;
  size?: number;
}) {
  const t = useT();
  if (!presence) return null;
  const color =
    presence === "online"
      ? "bg-emerald-500"
      : presence === "unavailable"
        ? "bg-amber-500"
        : "bg-fg-3";
  const label = t(
    presence === "online"
      ? "presence.online"
      : presence === "unavailable"
        ? "presence.away"
        : "presence.offline",
  );
  return (
    <span
      className={`block rounded-full border-2 border-bg-1 ${color}`}
      style={{ width: size, height: size }}
      title={label}
      aria-label={label}
    />
  );
}

/** 아바타 — Space/룸은 정사각형(4px 라운드), DM 유저는 완전 원형.
 *  mxc 아바타가 없거나 로딩 전엔 이니셜 블록 표시 */
function AvatarInner({
  client,
  mxcUrl,
  name,
  shape = "square",
  size = 16,
}: {
  client: MatrixClient;
  mxcUrl?: string | null;
  name: string;
  shape?: "square" | "round";
  size?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(null);
    if (!mxcUrl) return;
    let alive = true;
    getThumbnailBlobUrl(client, mxcUrl, size * 2)
      ?.then((u) => alive && setUrl(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [client, mxcUrl, size]);

  const borderRadius =
    shape === "round" ? "9999px" : size >= 32 ? "8px" : "5px";

  if (!url) {
    // 이니셜 fallback — 이미지와 정확히 같은 box(size×size). 배경/색만 다름.
    return (
      <span
        aria-hidden
        className="flex shrink-0 select-none items-center justify-center bg-fg-3 font-semibold text-bg-1"
        style={{
          width: size,
          height: size,
          borderRadius,
          fontSize: Math.max(10, Math.round(size * 0.55)),
          lineHeight: 1,
        }}
      >
        {(name?.[0] ?? "?").toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      className="shrink-0 object-cover"
      style={{ width: size, height: size, borderRadius }}
    />
  );
}

/** 방 아바타 — DM이면 상대 멤버 아바타(원형) + presence 점, 아니면 방 아바타(사각).
 *  showPresence: DM일 때 우하단에 온라인 상태 점 표시 (사이드바 등) */
export function RoomAvatar({
  client,
  room,
  size = 16,
  showPresence = false,
}: {
  client: MatrixClient;
  room: Room;
  size?: number;
  showPresence?: boolean;
}) {
  const dmUserId = getDmUserId(client, room);
  // 훅은 조건부 호출 불가 — 항상 부르고, DM 아닐 때/끌 때는 null 전달
  const presence = usePresence(client, showPresence ? dmUserId : null);
  if (dmUserId) {
    const member = room.getMember(dmUserId);
    return (
      <span className="relative inline-flex shrink-0">
        <Avatar
          client={client}
          mxcUrl={member?.getMxcAvatarUrl() ?? room.getMxcAvatarUrl()}
          name={member?.name ?? room.name}
          shape="round"
          size={size}
        />
        {showPresence && presence && (
          <span className="absolute -bottom-0.5 -right-0.5">
            <PresenceDot presence={presence} size={Math.max(8, size * 0.45)} />
          </span>
        )}
      </span>
    );
  }
  return (
    <Avatar
      client={client}
      mxcUrl={room.getMxcAvatarUrl()}
      name={room.name}
      shape="square"
      size={size}
    />
  );
}

export const Avatar = memo(AvatarInner);
