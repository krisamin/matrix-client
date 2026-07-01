import { useEffect } from "react";
import { useT } from "../lib/i18n";

/** 예약 발송 시간 선택 팝오버 — 5분/30분/1시간/내일 9시 quick presets.
 *  앵커(시계 버튼) 위에 띄우고 바깥 클릭/Esc로 닫힘. */
export function SchedulePopover({
  anchor,
  onPick,
  onClose,
}: {
  anchor: DOMRect;
  onPick: (delayMs: number) => void;
  onClose: () => void;
}) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const presets: Array<[string, number]> = [
    [t("schedule.5min"), 5 * 60 * 1000],
    [t("schedule.30min"), 30 * 60 * 1000],
    [t("schedule.1hour"), 60 * 60 * 1000],
    [t("schedule.tomorrow9"), tomorrow9amDelay()],
  ];

  return (
    <div className="fixed inset-0 z-50" onClick={onClose} role="presentation">
      <div
        className="msg-in absolute flex w-[180px] flex-col overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl"
        style={{
          left: Math.max(8, anchor.left - 60),
          top: anchor.top - 200,
        }}
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <p className="border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-fg-3">
          {t("schedule.title")}
        </p>
        {presets.map(([label, ms]) => (
          <button
            key={label}
            type="button"
            onClick={() => onPick(ms)}
            className="px-3 py-2 text-left text-[13px] text-fg-1 hover:bg-bg-2 hover:text-fg-0"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 내일 오전 9시까지 ms (현재 시각 기준). */
function tomorrow9amDelay(): number {
  const now = new Date();
  const t = new Date(now);
  t.setDate(t.getDate() + 1);
  t.setHours(9, 0, 0, 0);
  return t.getTime() - now.getTime();
}
