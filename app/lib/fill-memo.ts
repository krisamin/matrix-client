import { ls } from "./storage";

/**
 * "채우기 예산을 소진한 방/스레드" 기억 — **localStorage 영속**.
 *
 * ## 배경
 * 방에 들어가면 화면을 채울 만큼(15개) 표시 가능한 메시지가 모일 때까지
 * backwards 페이지네이션을 돈다. 그런데 어떤 방은 그 목표가 **원천적으로
 * 도달 불가능**하다:
 *   - 리액션 위주 방: 실측(krisam.in DM) 한 페이지의 95%가 `m.reaction`이다.
 *     limit을 40→80→160→320으로 키우며 4번 왕복해도 표시 가능한 메시지는 15개
 *     (총 600 이벤트 / **844 KB**). 리액션은 칩 렌더의 데이터 소스라 뺄 수 없다.
 *   - 스레드 위주 방: 메인 타임라인에 남는 게 원래 거의 없다.
 *
 * 기존에도 `fillExhaustedRooms` Set으로 "한 번 소진한 방은 다음부터 1페이지만"
 * 하는 메모가 있었지만 **모듈 레벨(메모리)** 이라 페이지가 새로 로드되면 사라졌다.
 * 그래서 마로의 실제 사용 패턴 — 모바일 PWA가 OS에 discard된 뒤 아이콘 재실행,
 * 즉 **콜드 스타트** — 에서는 메모가 매번 비어 있어 방에 들어갈 때마다 844 KB를
 * 처음부터 다시 긁었다. "홈 갔다 오면 로딩 걸린다"의 직접적 원인 중 하나.
 *
 * ## 처방
 * 소진 사실을 localStorage에 남겨 **재부팅 후에도 유지**한다. 두 번째 방문부터는
 * 1페이지(≈45 KB)만 긁고 최신분만 보충한다.
 *
 * 만료(TTL)를 두는 이유: 방 성격은 바뀔 수 있다(리액션 놀이가 끝나고 일반 대화
 * 방이 되는 등). 만료되면 한 번 더 정상 예산으로 시도해 재평가한다.
 */
const KEY = "fill-exhausted";

/** 소진 기록 유효기간 — 7일. 지나면 방 성격 재평가. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 엔트리 상한 — 무한 성장 방지. 초과 시 오래된 것부터 버린다. */
const MAX_ENTRY = 300;

type Store = Record<string, number>; // id → 기록 시각(ms)

const load = (): Store => ls.getJSON<Store>(KEY, {});

const save = (store: Store): void => {
  const entry = Object.entries(store);
  if (entry.length > MAX_ENTRY) {
    entry.sort((a, b) => b[1] - a[1]); // 최신순
    ls.setJSON(KEY, Object.fromEntries(entry.slice(0, MAX_ENTRY)));
    return;
  }
  ls.setJSON(KEY, store);
};

/** 이 id(방 또는 스레드 루트)가 "예산 소진" 상태로 기억돼 있는가.
 *  TTL이 지난 기록은 무시하고 지운다(다음 진입에서 재평가). */
export const isFillExhausted = (id: string): boolean => {
  const store = load();
  const at = store[id];
  if (at === undefined) return false;
  if (Date.now() - at > TTL_MS) {
    delete store[id];
    save(store);
    return false;
  }
  return true;
};

/** 예산을 다 쓰고도 목표 미달이었음을 기록. */
export const markFillExhausted = (id: string): void => {
  const store = load();
  store[id] = Date.now();
  save(store);
};

/** 소진 기록 해제 — 방이 실제로 채워졌으면(성격이 바뀌었으면) 즉시 정상화. */
export const clearFillExhausted = (id: string): void => {
  const store = load();
  if (store[id] === undefined) return;
  delete store[id];
  save(store);
};

/**
 * ## 채우기 예산 정책 (방·스레드 공용)
 *
 * ★이 상수들이 여기 있는 이유 — 실제 사고 기록:
 * `useRoomTimeline`과 `useThreadTimeline`은 같은 "표시 가능한 이벤트가
 * 15개 모일 때까지 backwards 페이지네이션" 알고리즘을 각자 복사해서 갖고
 * 있었다. git 이력상 두 훅을 건드린 24개 커밋 중 **16개가 한쪽만** 고쳤고,
 * 그 결과 두 가지 발산이 실제로 누적됐다:
 *
 *  1. 소진 판정 조건 — room은 `pages >= maxPages || 시간초과`로 고쳤는데
 *     thread는 `pages >= maxPages`만 남아, 시간 예산으로 빠져나오는 흔한
 *     경우에 메모가 **영영 기록되지 않았다**(매 진입마다 백필 재실행).
 *  2. 페이지 limit — room은 실측으로 20/+20/상한80으로 재조정했는데
 *     thread는 옛 50/×2/상한320이 남아 한 장에 최대 2.5MB를 받았다.
 *
 * 정책을 여기 한 곳에 두어 "한쪽만 고치는" 일이 구조적으로 불가능하게 한다.
 * 값을 바꿀 땐 반드시 실측 근거를 주석으로 남길 것.
 */

/** 화면을 채웠다고 보는 표시 이벤트 수. 이만큼 모이면 페이지네이션 중단. */
export const FILL_TARGET_VISIBLE = 15;

/** 채우기 루프 시간 예산(ms). 넘기면 목표 미달이어도 중단 —
 *  느린 모바일/콜드 크립토에서 방 진입이 수 초씩 잠기는 것 방지. */
export const FILL_BUDGET_MS = 3000;

/** 최대 페이지 왕복. 소진 기록이 있으면 1장만(최신분 보충용). */
export const FILL_MAX_PAGES = 10;
export const FILL_MAX_PAGES_EXHAUSTED = 1;

/** 첫 페이지 limit.
 *  실측 근거 — /messages(방, 이벤트 중앙값 12KB E2EE): 20→339KB · 40→583KB · 80→1.16MB.
 *  /relations(스레드, 5개 평균): 15→115KB · 50→382KB · 100→749KB · 320→2.55MB.
 *  목표가 15개이므로 20에서 시작해 모자랄 때만 키운다. */
export const FILL_LIMIT_START = 20;

/** 페이지가 모자랄 때 증가폭과 상한.
 *  ★상한은 한 장의 최악 비용을 결정한다 — 옛 320은 스레드에서 2.5MB였다. */
export const FILL_LIMIT_STEP = 20;
export const FILL_LIMIT_MAX = 80;

/** 채우기 루프 1회의 종료 상태. */
export type FillOutcome = {
  /** 실제로 돈 페이지 수 */
  pages: number;
  /** 종료 시점의 표시 가능 이벤트 수 */
  visibleCount: number;
  /** 타임라인 끝(더 받을 게 없음)에 도달했는가 */
  sawEnd: boolean;
};

/**
 * 채우기 결과를 소진 메모에 반영한다 — **두 훅의 유일한 판정 지점**.
 *
 * - 예산(페이지 수 **또는** 시간)을 다 쓰고도 목표 미달 + 끝도 아님
 *   → 이 방/스레드는 채울 수 없다고 기록해 다음 진입의 낭비를 막는다.
 * - 반대로 소진 기록이 있었는데 이번엔 목표를 채웠다 = 성격이 바뀜
 *   → 기록을 지워 정상 예산으로 복귀시킨다.
 *
 * @param deadline `performance.now()` 기준 마감 시각 (루프 시작 시 계산한 값)
 * @param wasExhausted 루프 시작 시점의 `isFillExhausted(id)` 값
 */
export const settleFillOutcome = (
  id: string,
  { pages, visibleCount, sawEnd }: FillOutcome,
  deadline: number,
  wasExhausted: boolean,
): void => {
  const maxPages = wasExhausted ? FILL_MAX_PAGES_EXHAUSTED : FILL_MAX_PAGES;
  // ★"예산을 다 썼는가"로 판정 — 페이지 소진과 시간 초과를 **둘 다** 센다.
  //   페이지 조건만 보면 시간으로 빠져나온 경우가 영영 기록되지 않는다.
  const budgetSpent = pages >= maxPages || performance.now() >= deadline;
  if (visibleCount < FILL_TARGET_VISIBLE && !sawEnd && budgetSpent) {
    markFillExhausted(id);
  } else if (visibleCount >= FILL_TARGET_VISIBLE && wasExhausted) {
    clearFillExhausted(id);
  }
};
