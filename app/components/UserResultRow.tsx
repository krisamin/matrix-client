import type { MatrixClient } from "matrix-js-sdk";
import { Avatar } from "./Avatar";

/** 사용자 검색 결과 한 줄 — 아바타 + 표시이름 + MXID.
 *  NewDmModal / RoomInfoPane 초대 등에서 공용으로 사용. */
export function UserResultRow({
  client,
  userId,
  displayName,
  avatarUrl,
  busy,
  onClick,
}: {
  client: MatrixClient;
  userId: string;
  displayName?: string;
  avatarUrl?: string;
  busy: boolean;
  onClick: () => void;
}) {
  const name = displayName || userId.slice(1).split(":")[0];
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-bg-2 disabled:opacity-50"
    >
      <Avatar
        client={client}
        mxcUrl={avatarUrl}
        name={name}
        shape="round"
        size={32}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-fg-0">{name}</span>
        <span className="block truncate font-mono text-[11px] text-fg-3">
          {userId}
        </span>
      </span>
    </button>
  );
}
