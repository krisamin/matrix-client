import { Pin, X } from "lucide-react";
import type { MatrixClient, Room } from "matrix-js-sdk";
import { RoomStateEvent } from "matrix-js-sdk";
import { useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { getPinnedEventIds, quotePreviewById, togglePin } from "../lib/matrix";

/** 고정 메시지 배너 — 방 헤더 아래에 고정된 메시지 미리보기.
 *  - 여러 개면 하나씩 순환(클릭으로 다음), 클릭 시 원문으로 점프
 *  - 권한 있으면 X로 해제
 *  - m.room.pinned_events 상태 변화 실시간 반영 */
export function PinnedBanner({
  client,
  room,
  onJumpTo,
}: {
  client: MatrixClient;
  room: Room;
  onJumpTo: (eventId: string) => void;
}) {
  const t = useT();
  const [, force] = useState(0);
  const [idx, setIdx] = useState(0);

  // 고정 상태 변화 실시간 반영
  useEffect(() => {
    const bump = () => force((n) => n + 1);
    client.on(RoomStateEvent.Events, bump);
    return () => {
      client.off(RoomStateEvent.Events, bump);
    };
  }, [client]);

  const pinnedIds = getPinnedEventIds(room);
  if (pinnedIds.length === 0) return null;

  // idx가 범위를 벗어나면 보정
  const safeIdx = idx % pinnedIds.length;
  const currentId = pinnedIds[safeIdx];
  const preview = quotePreviewById(room, currentId);
  const canUnpin = room.currentState.maySendStateEvent(
    "m.room.pinned_events",
    client.getUserId() ?? "",
  );

  async function unpin() {
    try {
      await togglePin(client, room, currentId);
    } catch (e) {
      console.warn("고정 해제 실패:", e);
    }
  }

  return (
    <div className="flex items-center gap-2 border-b border-line bg-bg-1 px-4 py-2">
      <Pin className="h-3.5 w-3.5 shrink-0 text-fg-3" />
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={() => {
          // 여러 개면 다음 고정으로 순환, 항상 현재 항목으로 점프
          onJumpTo(currentId);
          if (pinnedIds.length > 1) setIdx((i) => (i + 1) % pinnedIds.length);
        }}
        title={t("pinned.gotoMessage")}
      >
        {pinnedIds.length > 1 && (
          <span className="shrink-0 font-mono text-[11px] text-fg-3">
            {safeIdx + 1}/{pinnedIds.length}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[13px] text-fg-1">
          {preview || t("pinned.banner")}
        </span>
      </button>
      {canUnpin && (
        <button
          type="button"
          className="shrink-0 rounded p-1 text-fg-3 hover:bg-bg-2 hover:text-fg-1"
          onClick={unpin}
          title={t("pinned.removePin")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
