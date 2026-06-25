/** localStorage 헬퍼 — 키 prefix 일관성 + SSR 안전 + JSON 자동 처리.
 *
 *  모든 키는 'matrix-client:' prefix로 통일 (다른 앱과 충돌 방지, devtools
 *  필터링 용이). 단 historical 키 — session('matrix_session'), emoji-recent —
 *  는 마이그레이션 비용 vs 가치 낮아 그대로 둠. 새로 추가하는 키만 prefix.
 *
 *  사용:
 *    ls.get('locale', 'auto')           // string | null → '...' or 'auto'
 *    ls.getJSON<string[]>('emoji', [])  // unknown → typed
 *    ls.set('locale', 'ko')             // setItem
 *    ls.remove('locale')                // removeItem */
const PREFIX = "matrix-client:";

function fullKey(key: string): string {
  // 이미 prefix가 있거나 absolute key(어쩔 수 없는 historical)면 그대로
  if (key.startsWith(PREFIX) || key.includes(":") || key.startsWith("matrix_"))
    return key;
  return PREFIX + key;
}

export const ls = {
  /** string 값 read. 없으면 fallback 반환. SSR 안전. */
  get<T extends string = string>(key: string, fallback?: T): T | null {
    if (typeof window === "undefined") return fallback ?? null;
    const v = window.localStorage.getItem(fullKey(key));
    return (v as T | null) ?? fallback ?? null;
  },

  /** JSON 값 read. parse 실패 시 fallback 반환. */
  getJSON<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(fullKey(key));
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },

  /** 문자열 또는 JSON 값 write. */
  set(key: string, value: string): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(fullKey(key), value);
  },

  /** JSON으로 직렬화하여 write. */
  setJSON(key: string, value: unknown): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(fullKey(key), JSON.stringify(value));
  },

  /** 키 삭제. */
  remove(key: string): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(fullKey(key));
  },
};
