import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useT } from "../lib/i18n";
import {
  clearLifecycleLog,
  getLifecycleLog,
  type LifecycleEntry,
} from "../lib/lifecycle-log";
import { Modal, ModalHeader } from "./Modal";

/** 라이프사이클 항목별 톤 — 문제 신호는 눈에 띄게. */
function entryTone(e: LifecycleEntry): string {
  if (
    e.type === "error" ||
    e.type === "unhandledrejection" ||
    e.type === "session-logged-out"
  )
    return "text-red-400";
  if (e.type === "boot") return "text-fg-0";
  if (e.type === "sync" && e.detail === "ERROR") return "text-amber-400";
  if (e.type === "offline") return "text-amber-400";
  return "text-fg-2";
}

function formatTime(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 진단 — 앱 동작 기록 뷰어.
 *  모바일 PWA "저절로 새로고침" 원인 판별용: boot 항목의 nav/discarded와
 *  직전 항목(hidden/freeze/error)을 대조하면 OS discard/크래시/코드 문제를
 *  구분할 수 있다. */
export function DiagnosticsModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [entries, setEntries] = useState<LifecycleEntry[]>(getLifecycleLog);

  return (
    <Modal onClose={onClose} size="lg" mobileMode="fullscreen">
      <ModalHeader
        title={t("settings.diagnostics.title")}
        actions={
          <button
            type="button"
            onClick={() => {
              clearLifecycleLog();
              setEntries([]);
            }}
            title={t("settings.diagnostics.clear")}
            aria-label={t("settings.diagnostics.clear")}
            className="flex aspect-square h-full items-center justify-center text-fg-2 hover:bg-bg-2 hover:text-fg-0"
          >
            <Trash2 className="h-[15px] w-[15px]" />
          </button>
        }
      />

      <div className="selectable min-h-0 flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-[12px] text-fg-3">
            {t("settings.diagnostics.empty")}
          </div>
        ) : (
          <ul className="flex flex-col font-mono text-[11.5px] leading-[1.6]">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex items-baseline gap-3 border-b border-line px-4 py-1.5"
              >
                <span className="shrink-0 text-fg-3">{formatTime(e.t)}</span>
                <span className={`shrink-0 ${entryTone(e)}`}>{e.type}</span>
                {e.detail && (
                  <span className="min-w-0 break-all text-fg-2">
                    {e.detail}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex shrink-0 border-t border-line">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 text-[13px] text-fg-2 hover:bg-bg-2 hover:text-fg-0"
        >
          {t("common.close")}
        </button>
      </div>
    </Modal>
  );
}
