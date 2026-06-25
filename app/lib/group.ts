import type { MatrixEvent } from "matrix-js-sdk";

/** 같은 그룹(같은 발신자, 5분 이내 연속)이면 헤더 생략 */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

interface TimelineItem {
  ev: MatrixEvent;
  /** 그룹 첫 메시지 — 발신자/시각 헤더 표시 */
  showHeader: boolean;
  /** 이 메시지 앞에 날짜 구분선 표시 (YYYY-MM-DD WED 형식) */
  dateDivider: string | null;
  /** 내용 버전 스냅샷 — memo 무효화 키.
   *  MatrixEvent는 복호화/수정/삭제 시 같은 인스턴스를 in-place로 mutate해서
   *  참조 비교(React.memo 기본)로는 변화를 감지 못 한다. 그래서 변화를 일으키는
   *  상태들을 문자열로 박제해 prop으로 내려, 다음 refresh 때 값이 달라지면
   *  EventLine이 리렌더되게 한다. (복호화 안 됨/수정 미반영 버그의 근본 차단) */
  contentVersion: string;
}

/** 같은 ev 인스턴스라도 시간에 따라 바뀌는 상태(복호화/수정/삭제/스트리밍)를
 *  스냅샷 문자열로. groupTimeline 호출 시점의 값을 박제하는 게 핵심 —
 *  이래야 다음 빌드 때 값이 달라져 memo가 무효화된다. */
export function eventVersion(ev: MatrixEvent): string {
  const replace = ev.replacingEvent();
  return [
    ev.getType(), // 복호화: m.room.encrypted → m.room.message
    ev.isRedacted() ? "R" : "", // 삭제
    ev.isDecryptionFailure() ? "F" : "", // 복호화 실패 상태
    replace?.getId() ?? "", // 수정 반영
    replace?.getTs() ?? "", // 스트리밍 봇의 연속 수정
  ].join("|");
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
      contentVersion: eventVersion(ev),
    });
    prev = ev;
    prevDate = date;
  }
  return items;
}
