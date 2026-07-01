import { useT } from "../lib/i18n";
import { InlineSpinner } from "./InlineSpinner";

/** 페인 중앙 로딩 표시 — 방 바인딩/스레드 초기화 등 공용. */
export function LoadingPane() {
  const t = useT();
  return (
    <div className="flex flex-1 items-center justify-center">
      <span className="flex items-center gap-1.5 font-mono text-[12px] text-fg-3">
        <InlineSpinner size="sm" />
        {t("common.loading")}
      </span>
    </div>
  );
}
