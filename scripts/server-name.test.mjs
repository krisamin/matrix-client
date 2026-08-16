// serverNameFromInput 동작 실측 — 회귀 방지용.
import assert from "node:assert/strict";
import test from "node:test";

// app/lib/uia.ts 의 구현을 그대로 옮긴 것 (SPA는 브라우저 전용 번들이라
// node:test 에서 직접 import 불가 — 로직만 검증)
function serverNameFromInput(input) {
  let raw = input.trim();
  if (raw.startsWith("@") && raw.includes(":")) {
    raw = raw.split(":").slice(1).join(":");
  }
  return raw.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

test("apex 입력은 apex 그대로 유지 (delegation 결과로 덮이지 않음)", () => {
  assert.equal(serverNameFromInput("krisam.in"), "krisam.in");
  assert.equal(serverNameFromInput("https://krisam.in"), "krisam.in");
  assert.equal(serverNameFromInput("https://krisam.in/"), "krisam.in");
  assert.equal(serverNameFromInput("  krisam.in  "), "krisam.in");
});

test("MXID 에서 서버 이름 추출", () => {
  assert.equal(serverNameFromInput("@krisam:krisam.in"), "krisam.in");
  assert.equal(serverNameFromInput("@a:matrix.org"), "matrix.org");
});

test("과거에 저장된 base URL 을 서버 이름으로 정규화", () => {
  // 이 마이그레이션이 없으면 기존 사용자 폼에 서브도메인이 남는다
  assert.equal(
    serverNameFromInput("https://matrix.krisam.in"),
    "matrix.krisam.in",
  );
});

test("포트·경로 있는 로컬 홈서버", () => {
  assert.equal(serverNameFromInput("http://localhost:8008"), "localhost:8008");
  assert.equal(serverNameFromInput("http://localhost:8008/"), "localhost:8008");
});

test("discoverHomeserver 의 스킴 보존 규칙", () => {
  const scheme = (i) => (i.trim().startsWith("http://") ? "http://" : "https://");
  assert.equal(
    scheme("http://localhost:8008") + serverNameFromInput("http://localhost:8008"),
    "http://localhost:8008",
  );
  assert.equal(
    scheme("krisam.in") + serverNameFromInput("krisam.in"),
    "https://krisam.in",
  );
});
