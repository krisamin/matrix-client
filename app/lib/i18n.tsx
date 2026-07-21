import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type DictKey, ko } from "../i18n/ko";
import {
  type Locale,
  type LocalePref,
  loadLocalePref,
  resolveLocale,
  saveLocalePref,
} from "./locale";

// ko는 fallback master라 정적 번들 — 항상 즉시 사용 가능.
// en/ja는 사용 시점에만 dynamic import → 초기 번들에서 분리.
type Dict = Record<DictKey, string>;
const DICT_CACHE: Partial<Record<Locale, Dict>> = { ko };

// 모듈 레벨 현재 사전/locale — React 훅을 못 쓰는 lib 코드(알림, 미리보기,
// innerHTML 주입 등)용. I18nProvider가 locale 변경 시 갱신한다.
// 반응성은 없지만 해당 텍스트들은 전부 호출 시점 계산이라 충분.
let currentDict: Dict = ko;
let currentLocaleValue: Locale = "ko";

/** 훅 없이 쓰는 번역 — lib 코드 전용. 컴포넌트에선 useT()를 쓸 것. */
export function translate(
  key: DictKey,
  params?: Record<string, string | number>,
): string {
  const raw = currentDict[key] ?? ko[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{\{(\w+)\}\}/g, (_, k) =>
    String(params[k] ?? `{{${k}}}`),
  );
}

/** 현재 적용된 locale — 렌더 캐시 키 등에 사용. */
export function getCurrentLocale(): Locale {
  return currentLocaleValue;
}

async function loadDict(locale: Locale): Promise<Dict> {
  if (DICT_CACHE[locale]) return DICT_CACHE[locale] as Dict;
  if (locale === "en") {
    const m = await import("../i18n/en");
    DICT_CACHE.en = m.en;
    return m.en;
  }
  if (locale === "ja") {
    const m = await import("../i18n/ja");
    DICT_CACHE.ja = m.ja;
    return m.ja;
  }
  return ko;
}

interface I18nContextValue {
  /** 실제 적용된 언어 (auto 해석 후) — 사전 조회용 */
  locale: Locale;
  /** 사용자 선택 — UI select에 표시할 값 ("auto" 포함) */
  pref: LocalePref;
  /** 선택 변경. "auto"로 두면 브라우저 감지 */
  setPref: (p: LocalePref) => void;
  /** 키 → 번역. 없으면 ko fallback → 그래도 없으면 키 자체. */
  t: (key: DictKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/** Provider — App 루트에 마운트. localStorage 변화도 듣는다(다른 탭 동기화). */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<LocalePref>(() => loadLocalePref());
  // 현재 적용된 사전 — 처음엔 ko, locale 바뀌면 비동기로 갱신.
  // 로드 전엔 ko fallback로 그려서 화면 깜빡임 0.
  const [dict, setDict] = useState<Dict>(() => ko);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "matrix-client:locale") {
        setPrefState(loadLocalePref());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setPref = useCallback((p: LocalePref) => {
    saveLocalePref(p);
    setPrefState(p);
  }, []);

  const locale = useMemo(() => resolveLocale(pref), [pref]);

  // locale 변경 시 사전 dynamic load. 같은 locale 재진입은 cache hit으로 즉시.
  useEffect(() => {
    let cancelled = false;
    loadDict(locale).then((d) => {
      if (!cancelled) {
        setDict(d);
        // lib 코드용 모듈 레벨 사전도 함께 갱신 (translate())
        currentDict = d;
        currentLocaleValue = locale;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const t = useCallback(
    (key: DictKey, params?: Record<string, string | number>) => {
      const raw = dict[key] ?? ko[key] ?? key;
      if (!params) return raw;
      // {{name}} 치환 — 간단한 mustache. 이스케이프는 안 함(텍스트 노드로 들어감).
      return raw.replace(/\{\{(\w+)\}\}/g, (_, k) =>
        String(params[k] ?? `{{${k}}}`),
      );
    },
    [dict],
  );

  const value = useMemo(
    () => ({ locale, pref, setPref, t }),
    [locale, pref, setPref, t],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** 컴포넌트에서: const { t, locale, pref, setPref } = useI18n(); */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be inside <I18nProvider>");
  return ctx;
}

/** 짧은 t() 전용 hook — UI 컴포넌트에서 가장 흔한 사용 패턴. */
export function useT() {
  return useI18n().t;
}
