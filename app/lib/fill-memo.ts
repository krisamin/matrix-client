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
