import type { IdTokenClaims } from "oidc-client-ts";

export interface MatrixSession {
  homeserverUrl: string;
  accessToken: string;
  refreshToken?: string;
  userId: string;
  deviceId: string;
  issuer: string;
  clientId: string;
  /** 토큰 갱신(OidcTokenRefresher)에 필요 */
  redirectUri?: string;
  idTokenClaims?: IdTokenClaims;
}

const KEY = "matrix_session";

export function saveSession(session: MatrixSession): void {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function loadSession(): MatrixSession | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MatrixSession;
  } catch {
    return null;
  }
}

/** 갱신된 토큰만 부분 업데이트 */
export function updateSessionTokens(
  accessToken: string,
  refreshToken?: string,
): void {
  const session = loadSession();
  if (!session) return;
  session.accessToken = accessToken;
  if (refreshToken) session.refreshToken = refreshToken;
  saveSession(session);
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}
