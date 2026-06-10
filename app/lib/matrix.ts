import { createClient, type MatrixClient } from "matrix-js-sdk";
import { loadSession } from "./session";

let clientPromise: Promise<MatrixClient> | null = null;

/**
 * 세션이 있으면 rust crypto까지 초기화된 싱글턴 MatrixClient를 돌려준다.
 * 없으면 null. (crypto stack은 thread-unsafe라 반드시 인스턴스 1개 유지)
 */
export function getReadyClient(): Promise<MatrixClient> | null {
  if (clientPromise) return clientPromise;
  const session = loadSession();
  if (!session) return null;
  clientPromise = (async () => {
    const client = createClient({
      baseUrl: session.homeserverUrl,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      userId: session.userId,
      deviceId: session.deviceId,
    });
    await client.initRustCrypto({
      useIndexedDB: true,
      cryptoDatabasePrefix: `matrix-client-crypto-${session.deviceId}`,
    });
    return client;
  })();
  return clientPromise;
}

export function resetClient(): void {
  clientPromise?.then((c) => c.stopClient()).catch(() => {});
  clientPromise = null;
}
