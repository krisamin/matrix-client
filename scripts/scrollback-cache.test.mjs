#!/usr/bin/env node
/**
 * 회귀 테스트 — 스크롤백 캐시(lib/scrollback-cache)의 배선 순서와 안전 규칙.
 *
 * ## 왜 이 파일이 있나 (실제 버그)
 * 캐시 저장을 `settleFillOutcome` **앞**에 두는 첫 구현에서, fill 루프의
 * 페이지네이션이 타임라인에 반영되기 전 상태가 저장됐다. 실측상 저장 시점
 * 이벤트가 20개뿐이라 다음 방문에 캐시가 목표 행수를 못 채우고 결국
 * `/messages`를 다시 쏘게 된다 — 캐시가 있는데도 이득이 사라지는 조용한 실패.
 * 로그를 심어 `save 진입 events=20`을 눈으로 보고서야 잡혔다.
 *
 * 또 하나: 캐시는 SDK 스토어 **밖**의 별도 IndexedDB라 `resetClient()`가
 * `store.deleteAllData()`만 부르면 로그아웃 후에도 이전 계정 메시지가 남는다.
 *
 * 브라우저 없이 소스 배선만 검사한다. `node --test scripts/`로 실행.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const HOOK = read("app/hooks/useRoomTimeline.ts");
const CACHE = read("app/lib/scrollback-cache.ts");
const MATRIX = read("app/lib/matrix.ts");

test("저장은 fill 루프가 끝난 뒤에 — settleFillOutcome보다 뒤여야 한다", () => {
  const settle = HOOK.indexOf("settleFillOutcome(");
  const save = HOOK.indexOf("saveScrollback(");
  assert.ok(settle > 0, "settleFillOutcome 호출이 있어야 한다");
  assert.ok(save > 0, "saveScrollback 호출이 있어야 한다");
  assert.ok(
    save > settle,
    "saveScrollback이 settleFillOutcome보다 앞이면 페이지네이션 반영 전 상태(20건)가 저장된다",
  );
});

test("재생은 페이지네이션 앞에서 — restoreScrollback이 paginate보다 먼저", () => {
  const restore = HOOK.indexOf("restoreScrollback(");
  const paginate = HOOK.indexOf("paginateEventTimeline(");
  assert.ok(restore > 0 && paginate > 0);
  assert.ok(
    restore < paginate,
    "캐시 재생이 페이지네이션 뒤면 아낄 요청을 이미 쏜 뒤가 된다",
  );
});

test("재생만으로 끝난 방문은 저장하지 않는다 (pages 가드)", () => {
  assert.match(
    HOOK,
    /if\s*\(\s*pages\s*>\s*0\s*&&/,
    "pages > 0 가드가 없으면 같은 내용을 매 방문 다시 쓴다",
  );
});

test("방 전환 경합 가드 — 재생 후 gen 확인", () => {
  const restore = HOOK.indexOf("restoreScrollback(");
  const after = HOOK.slice(restore, restore + 400);
  assert.match(
    after,
    /gen\s*!==\s*genRef\.current/,
    "await 사이 방이 바뀌면 남의 방 캐시를 현재 타임라인에 주입하게 된다",
  );
});

test("local echo는 저장하지 않는다", () => {
  assert.match(
    CACHE,
    /status\s*!==\s*null/,
    "전송 중 이벤트를 캐시하면 재생 시 유령 메시지가 된다",
  );
  assert.match(CACHE, /startsWith\("\$"\)/, "서버 확정 event_id만 저장해야 한다");
});

test("SDK의 /messages 처리 순서를 따른다 (partition → add → 관계 집계)", () => {
  // 주석에도 같은 이름이 나오므로 실제 호출부(`set.` / `room.`)만 본다.
  const part = CACHE.indexOf("room.partitionThreadedEvents");
  const add = CACHE.indexOf("set.addEventsToTimeline");
  const agg = CACHE.indexOf("room.relations.aggregateChildEvent");
  assert.ok(part > 0, "partitionThreadedEvents 없이 주입하면 스레드 답글이 메인에 섞인다");
  assert.ok(part < add, "분리 전에 타임라인에 넣으면 안 된다");
  assert.ok(add < agg, "관계 집계는 이벤트 주입 뒤에");
});

test("로그아웃 시 캐시를 지운다 — 별도 IndexedDB라 store.deleteAllData로 안 지워짐", () => {
  assert.match(
    MATRIX,
    /clearScrollbackCache\(\)/,
    "resetClient에서 캐시를 지우지 않으면 다음 계정에 이전 사용자 메시지가 남는다",
  );
  const reset = MATRIX.indexOf("export function resetClient");
  const clear = MATRIX.indexOf("clearScrollbackCache()", reset);
  assert.ok(clear > reset && clear - reset < 800, "resetClient 안에서 호출돼야 한다");
});

test("캐시 수명 한도가 있다 — 낡은 본문 고착 방지", () => {
  assert.match(CACHE, /MAX_AGE_MS/, "만료가 없으면 편집/삭제 반영이 안 된 본문이 남는다");
  assert.match(CACHE, /savedAt\s*>\s*MAX_AGE_MS/, "읽을 때 만료를 검사해야 한다");
});

test("스키마 버전으로 옛 레코드를 폐기한다", () => {
  assert.match(CACHE, /schema\s*!==\s*SCHEMA/, "구조 변경 시 옛 캐시를 읽으면 깨진다");
});
