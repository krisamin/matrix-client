import { createClient, type MatrixClient } from "matrix-js-sdk";
import { loadSession } from "./session";

let client: MatrixClient | null = null;

/** 세션이 있으면 싱글턴 MatrixClient를 돌려준다. 없으면 null. */
export function getClient(): MatrixClient | null {
  if (client) return client;
  const session = loadSession();
  if (!session) return null;
  client = createClient({
    baseUrl: session.homeserverUrl,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    userId: session.userId,
    deviceId: session.deviceId,
  });
  return client;
}

export function resetClient(): void {
  client?.stopClient();
  client = null;
}
