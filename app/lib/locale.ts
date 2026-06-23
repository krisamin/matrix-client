/** 표시 언어 — 우리가 지원하는 코드 */
export type Locale = "ko" | "en" | "ja";

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

/** 저장된 언어 선택을 읽음. 없으면 브라우저 언어로. */
export function loadLocale(): Locale {
  if (typeof localStorage === "undefined") return "ko";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED_LOCALES.includes(saved as Locale)) {
      return saved as Locale;
    }
  } catch {
    // localStorage 막힌 환경
  }
  return detectBrowserLocale();
}

/** 사용자 선택 저장. */
export function saveLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore
  }
}
