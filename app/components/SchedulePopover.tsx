import { useT } from "../lib/i18n";
import { AnchoredPopover } from "./AnchoredPopover";

const W = 180;
/** 플립 판단용 추정 높이 (타이틀 + 프리셋 4개) */
const EST_H = 170;

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

  const presets: Array<[string, number]> = [
    [t("schedule.5min"), 5 * 60 * 1000],
    [t("schedule.30min"), 30 * 60 * 1000],
    [t("schedule.1hour"), 60 * 60 * 1000],
    [t("schedule.tomorrow9"), tomorrow9amDelay()],
  ];

  return (
    <AnchoredPopover
      anchor={anchor}
      width={W}
      estimatedHeight={EST_H}
      align="right"
      prefer="above"
      className="flex flex-col"
      onClose={onClose}
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
    </AnchoredPopover>
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
