import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { en } from "../i18n/en";
import { ja } from "../i18n/ja";
import { type DictKey, ko } from "../i18n/ko";
import {
  type Locale,
  type LocalePref,
  loadLocalePref,
  resolveLocale,
  saveLocalePref,
} from "./locale";

const DICTS: Record<Locale, Record<DictKey, string>> = { ko, en, ja };

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

  const t = useCallback(
    (key: DictKey, params?: Record<string, string | number>) => {
      const dict = DICTS[locale];
      const raw = dict[key] ?? ko[key] ?? key;
      if (!params) return raw;
      // {{name}} 치환 — 간단한 mustache. 이스케이프는 안 함(텍스트 노드로 들어감).
      return raw.replace(/\{\{(\w+)\}\}/g, (_, k) =>
        String(params[k] ?? `{{${k}}}`),
      );
    },
    [locale],
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
