import type { MatrixClient } from "matrix-js-sdk";
import { UserEvent } from "matrix-js-sdk";
import { useEffect, useState } from "react";

export type Presence = "online" | "unavailable" | "offline" | null;

/** presence 문자열 정규화 (서버가 주는 값: online/unavailable/offline) */
function readPresence(client: MatrixClient, userId: string): Presence {
  const user = client.getUser(userId);
  if (!user?.presence) return null;
  const p = user.presence;
  if (p === "online" || p === "unavailable" || p === "offline") return p;
  return null;
}

/**
 * 유저의 presence를 구독한다. (online / unavailable[자리비움] / offline)
 * UserEvent.Presence + CurrentlyActive 변화에 실시간 반영.
 * userId가 없으면(그룹방 등) null 반환 — 호출부에서 표시 생략.
 */
export function usePresence(
  client: MatrixClient,
  userId: string | null,
): Presence {
  const [presence, setPresence] = useState<Presence>(() =>
    userId ? readPresence(client, userId) : null,
  );

  useEffect(() => {
    if (!userId) {
      setPresence(null);
      return;
    }
    setPresence(readPresence(client, userId));

    const user = client.getUser(userId);
    const update = () => setPresence(readPresence(client, userId));
    // User 인스턴스가 아직 없을 수 있음 — 클라이언트 레벨로도 구독
    user?.on(UserEvent.Presence, update);
    user?.on(UserEvent.CurrentlyActive, update);
    client.on(UserEvent.Presence, update);
    return () => {
      user?.off(UserEvent.Presence, update);
      user?.off(UserEvent.CurrentlyActive, update);
      client.off(UserEvent.Presence, update);
    };
  }, [client, userId]);

  return presence;
}

export const PRESENCE_LABEL: Record<NonNullable<Presence>, string> = {
  online: "online",
  unavailable: "away",
  offline: "offline",
};
