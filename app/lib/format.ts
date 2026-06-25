/** 시간/날짜 포맷 + 라우트 경로 헬퍼.
 *  여러 컴포넌트에 흩어진 toLocaleString / encodeURIComponent 패턴을 모은다. */

/** HH:MM 24시간제. 메시지 행 시각 표시. */
export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** 메시지 hover 툴팁용 정확 시각 — 한국어 long format.
 *  예: "2026년 6월 18일 (목) 오후 2:35:07" */
export function formatFullTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

/** 검색 결과 행 컴팩트 표시 — 연도 생략, 분까지.
 *  예: "6. 18. 14:35" */
export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** ms를 사람이 읽는 형태로 — '1d' / '2h 30m' / '45m' / '30s'. 0 이하면 '0s'. */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "0s";
  const totalMin = Math.floor(ms / 60000);
  const totalHour = Math.floor(totalMin / 60);
  const day = Math.floor(totalHour / 24);
  if (day > 0) return `${day}d`;
  if (totalHour > 0) return `${totalHour}h ${totalMin % 60}m`;
  if (totalMin > 0) return `${totalMin}m`;
  return `${Math.ceil(ms / 1000)}s`;
}

/** 방 라우트 경로. roomId는 항상 encodeURIComponent 필요(! 문자 등). */
export function roomPath(roomId: string): string {
  return `/room/${encodeURIComponent(roomId)}`;
}

/** 방 thread 라우트 경로. full=true면 ?full=1 추가 (사이드바 thread 클릭 시). */
export function threadPath(
  roomId: string,
  threadId: string,
  full = false,
): string {
  const base = `${roomPath(roomId)}/thread/${encodeURIComponent(threadId)}`;
  return full ? `${base}?full=1` : base;
}
