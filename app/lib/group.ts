import type { MatrixEvent } from "matrix-js-sdk";

/** 같은 그룹(같은 발신자, 5분 이내 연속)이면 헤더 생략 */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

export interface TimelineItem {
  ev: MatrixEvent;
  /** 그룹 첫 메시지 — 발신자/시각 헤더 표시 */
  showHeader: boolean;
  /** 이 메시지 앞에 날짜 구분선 표시 (YYYY-MM-DD WED 형식) */
  dateDivider: string | null;
}

function dateLabel(ts: number): string {
  const d = new Date(ts);
  const weekday = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][d.getDay()];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${weekday}`;
}

/** 이벤트 배열 → 그룹핑(연속 발신자) + 날짜 구분선 메타 부착 */
export function groupTimeline(events: MatrixEvent[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  let prev: MatrixEvent | null = null;
  let prevDate = "";
  for (const ev of events) {
    const date = dateLabel(ev.getTs());
    const newDay = date !== prevDate;
    const sameGroup =
      !newDay &&
      prev != null &&
      prev.getSender() === ev.getSender() &&
      ev.getTs() - prev.getTs() < GROUP_WINDOW_MS;
    items.push({
      ev,
      showHeader: !sameGroup,
      dateDivider: newDay ? date : null,
    });
    prev = ev;
    prevDate = date;
  }
  return items;
}
