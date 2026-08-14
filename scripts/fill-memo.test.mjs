#!/usr/bin/env node
/**
 * 회귀 테스트 — 채우기 예산 판정(lib/fill-memo.settleFillOutcome).
 *
 * ## 왜 이 파일이 있나 (실제 버그)
 * 원래 판정 조건이 `pages >= maxPages`뿐이라, 루프가 **시간 예산**(3초)으로
 * 빠져나온 경우엔 "채울 수 없는 방"이라는 메모가 영영 기록되지 않았다.
 * 마로의 방은 이벤트 중앙값이 12KB(E2EE)라 항상 시간 예산에 먼저 걸린다
 * → localStorage 영속화를 해뒀는데도 매 진입마다 3초·850KB를 새로 태웠다.
 * 같은 버그가 방 훅에서 먼저 수정됐는데 스레드 훅에는 그대로 남아 있었다.
 *
 * 브라우저 없이 판정 규칙만 검사한다(순수 함수라 가능). `node --test`로 실행.
 *
 *   node --test scripts/
 */
import assert from "node:assert/strict";
import test from "node:test";

// 정책 상수는 소스와 같은 값 — 여기가 틀어지면 테스트가 의미를 잃으므로
// 실제 모듈에서 읽어온다. (.ts라 직접 import는 불가 → 값만 파싱해 대조)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fs.readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../app/lib/fill-memo.ts",
  ),
  "utf8",
);
const constOf = (name) => {
  const m = SRC.match(new RegExp(`export const ${name} = (\\d+)`));
  assert.ok(m, `${name} 를 lib/fill-memo.ts에서 못 찾음 — 상수가 옮겨졌나?`);
  return Number(m[1]);
};

const FILL_TARGET_VISIBLE = constOf("FILL_TARGET_VISIBLE");
const FILL_MAX_PAGES = constOf("FILL_MAX_PAGES");
const FILL_MAX_PAGES_EXHAUSTED = constOf("FILL_MAX_PAGES_EXHAUSTED");

/** settleFillOutcome의 판정 규칙 사본 — 소스와 동작이 같아야 한다.
 *  (실제 모듈은 localStorage에 의존하므로 여기선 규칙만 검사) */
function settle(store, id, { pages, visibleCount, sawEnd }, now, deadline, wasExhausted) {
  const maxPages = wasExhausted ? FILL_MAX_PAGES_EXHAUSTED : FILL_MAX_PAGES;
  const budgetSpent = pages >= maxPages || now >= deadline;
  if (visibleCount < FILL_TARGET_VISIBLE && !sawEnd && budgetSpent) {
    store.add(id);
  } else if (visibleCount >= FILL_TARGET_VISIBLE && wasExhausted) {
    store.delete(id);
  }
}

const run = (outcome, now, deadline, wasExhausted = false, pre = false) => {
  const store = new Set();
  if (pre) store.add("x");
  settle(store, "x", outcome, now, deadline, wasExhausted);
  return store.has("x");
};

test("★시간 예산으로 탈출했고 목표 미달이면 소진으로 기록한다 (원래 버그)", () => {
  // 3장만 돌았지만 3초를 넘겼다 — 페이지 조건만 보던 옛 코드는 여기서 기록을 놓쳤다.
  assert.equal(run({ pages: 3, visibleCount: 6, sawEnd: false }, 3001, 3000), true);
});

test("페이지 예산을 다 써도 목표 미달이면 기록한다", () => {
  assert.equal(
    run({ pages: FILL_MAX_PAGES, visibleCount: 6, sawEnd: false }, 1500, 3000),
    true,
  );
});

test("타임라인 끝에 닿았으면 기록하지 않는다 (더 받을 게 없는 건 정상)", () => {
  assert.equal(run({ pages: 4, visibleCount: 6, sawEnd: true }, 3500, 3000), false);
});

test("목표를 채웠으면 기록하지 않는다", () => {
  assert.equal(
    run({ pages: 2, visibleCount: FILL_TARGET_VISIBLE, sawEnd: false }, 500, 3000),
    false,
  );
});

test("예산이 남았는데 목표 미달이면 기록하지 않는다 (아직 더 돌 수 있음)", () => {
  assert.equal(run({ pages: 2, visibleCount: 6, sawEnd: false }, 500, 3000), false);
});

test("소진 기록이 있었는데 이번엔 채워졌으면 기록을 해제한다", () => {
  assert.equal(
    run({ pages: 1, visibleCount: 30, sawEnd: false }, 100, 3000, true, true),
    false,
  );
});

test("소진 상태에선 1페이지만 돌고, 그래도 미달이면 기록을 유지한다", () => {
  assert.equal(
    run(
      { pages: FILL_MAX_PAGES_EXHAUSTED, visibleCount: 3, sawEnd: false },
      100,
      3000,
      true,
      true,
    ),
    true,
  );
});
