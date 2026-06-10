export interface MatrixSession {
  homeserverUrl: string;
  accessToken: string;
  refreshToken?: string;
  userId: string;
  deviceId: string;
  issuer: string;
  clientId: string;
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

export function clearSession(): void {
  localStorage.removeItem(KEY);
}
