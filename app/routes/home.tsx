import { MessageSquareDashed } from "lucide-react";
import { useT } from "../lib/i18n";

export function meta() {
  return [{ title: "matrix-client" }];
}

/** 방 미선택 빈 화면 — 사이드바에서 방 선택 또는 Cmd/Ctrl+K. */
export default function Home() {
  const t = useT();
  const isMac =
    typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
  const mod = isMac ? "⌘" : "Ctrl";
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-fg-3">
      <MessageSquareDashed className="h-10 w-10" strokeWidth={1.25} />
      <p className="text-[14px] text-fg-2">{t("home.empty")}</p>
      <div className="flex flex-col items-center gap-1.5 text-[12px] text-fg-3">
        <span className="flex items-center gap-1.5">
          <kbd className="rounded border border-line bg-bg-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-2">
            {mod}
          </kbd>
          <kbd className="rounded border border-line bg-bg-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-2">
            K
          </kbd>
          <span>{t("home.hint.switch")}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="rounded border border-line bg-bg-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-2">
            ?
          </kbd>
          <span>{t("home.hint.shortcuts")}</span>
        </span>
      </div>
    </div>
  );
}
