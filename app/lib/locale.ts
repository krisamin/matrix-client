/** 표시 언어 — 우리가 지원하는 코드 */
export type Locale = "ko" | "en" | "ja";

/** 사용자 설정값 — "auto"면 브라우저 감지, 그 외엔 명시 선택. */
export type LocalePref = Locale | "auto";

export const SUPPORTED_LOCALES: Locale[] = ["ko", "en", "ja"];

export const LOCALE_LABEL: Record<Locale, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
};

const STORAGE_KEY = "matrix-client:locale";

/** 브라우저 navigator.language → 우리 지원 언어로 매핑.
 *  fallback: ko (마로 기본 사용 언어). */
export function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return "ko";
  const langs = (
    navigator.languages?.length
      ? navigator.languages
      : [navigator.language ?? ""]
  ).map((l) => l.toLowerCase());
  for (const lang of langs) {
    if (lang.startsWith("ko")) return "ko";
    if (lang.startsWith("ja")) return "ja";
    if (lang.startsWith("en")) return "en";
  }
  return "ko";
}

/** 저장된 사용자 선택 — "auto" / "ko" / "en" / "ja". 없으면 "auto". */
export function loadLocalePref(): LocalePref {
  if (typeof localStorage === "undefined") return "auto";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "auto") return "auto";
    if (saved && SUPPORTED_LOCALES.includes(saved as Locale)) {
      return saved as Locale;
    }
  } catch {
    // localStorage 막힌 환경
  }
  return "auto";
}

/** 사용자 선택을 실제 적용할 Locale로 변환. */
export function resolveLocale(pref: LocalePref): Locale {
  return pref === "auto" ? detectBrowserLocale() : pref;
}

/** 사용자 선택 저장. "auto"면 키 자체를 제거(다음 로드에 브라우저 따라감). */
export function saveLocalePref(pref: LocalePref): void {
  try {
    if (pref === "auto") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, pref);
    }
  } catch {
    // ignore
  }
}
