import type { MatrixClient, Room } from "matrix-js-sdk";
import { useEffect, useState } from "react";
import { getDmUserId } from "../lib/matrix";
import { getThumbnailBlobUrl } from "../lib/media";

/** 아바타 — Space/룸은 정사각형(4px 라운드), DM 유저는 완전 원형.
 *  mxc 아바타가 없거나 로딩 전엔 이니셜 블록 표시 */
export function Avatar({
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

  const borderRadius = shape === "round" ? "9999px" : "4px";

  if (!url) {
    return (
      <span
        aria-hidden
        className="flex shrink-0 select-none items-center justify-center bg-bg-3 font-semibold text-fg-2"
        style={{
          width: size,
          height: size,
          borderRadius,
          fontSize: Math.max(8, Math.round(size * 0.45)),
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
      className="shrink-0 object-cover"
      style={{ width: size, height: size, borderRadius }}
    />
  );
}

/** 방 아바타 — DM이면 상대 멤버 아바타(원형), 아니면 방 아바타(사각) */
export function RoomAvatar({
  client,
  room,
  size = 16,
}: {
  client: MatrixClient;
  room: Room;
  size?: number;
}) {
  const dmUserId = getDmUserId(client, room);
  if (dmUserId) {
    const member = room.getMember(dmUserId);
    return (
      <Avatar
        client={client}
        mxcUrl={member?.getMxcAvatarUrl() ?? room.getMxcAvatarUrl()}
        name={member?.name ?? room.name}
        shape="round"
        size={size}
      />
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
