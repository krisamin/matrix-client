#!/usr/bin/env node
/**
 * 아키텍처 가드 — import 그래프를 검사해 구조 규칙 위반을 CI에서 잡는다.
 *
 * ## 왜 이게 있나 (실제 사고)
 * `useRoomTimeline`과 `useThreadTimeline`은 같은 "채우기" 알고리즘을 각자
 * 복사해 갖고 있었다. git 이력상 두 훅을 건드린 24개 커밋 중 **16개가 한쪽만**
 * 고쳤고, 실제로 두 가지가 갈라졌다:
 *   1) 소진 판정 조건 (thread는 시간 예산 탈출 시 메모를 영영 기록 못 함)
 *   2) 페이지 limit (thread는 한 장에 최대 2.5MB — room은 80으로 조정됨)
 * 사람 리뷰로는 "쌍둥이 파일의 한쪽만 고쳤다"를 놓친다. 기계가 본다.
 *
 * ## 검사 항목
 *  1. 레이어 방향  lib/i18n → hooks → components → routes (역방향 import 금지)
 *  2. 순환 의존
 *  3. 공유돼야 할 정책 상수가 훅에서 재선언되는지 (쌍둥이 발산 재발 방지)
 *
 * 실행: node scripts/check-architecture.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../app");

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name)) files.push(p);
  }
})(APP);

const rel = (p) => path.relative(APP, p).split(path.sep).join("/");
const layerOf = (r) => r.split("/")[0].replace(/\.tsx?$/, "");

/** 레이어 서열 — 숫자가 큰 쪽이 상위(=하위를 import 해도 되는 쪽). */
const RANK = { lib: 0, i18n: 0, hooks: 1, components: 2, routes: 3 };

// ── import 그래프 ────────────────────────────────────────────────
const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g;
const graph = new Map();
const source = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  source.set(rel(f), src);
  const deps = [];
  let m;
  while ((m = IMPORT_RE.exec(src))) {
    const spec = m[1];
    if (!spec.startsWith(".") && !spec.startsWith("~")) continue;
    const base = spec.startsWith("~/")
      ? path.join(APP, spec.slice(2))
      : path.resolve(path.dirname(f), spec);
    const hit = [
      `${base}.ts`,
      `${base}.tsx`,
      path.join(base, "index.ts"),
      path.join(base, "index.tsx"),
      base,
    ].find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
    if (hit) deps.push(rel(hit));
  }
  graph.set(rel(f), deps);
}

const problems = [];

// ── 1. 레이어 방향 ───────────────────────────────────────────────
for (const [f, deps] of graph) {
  const fr = RANK[layerOf(f)];
  if (fr === undefined) continue;
  for (const d of deps) {
    const dr = RANK[layerOf(d)];
    if (dr === undefined) continue;
    if (dr > fr) {
      problems.push(
        `레이어 역방향: ${f} → ${d}\n` +
          `    ${layerOf(f)}(${fr})가 상위 레이어 ${layerOf(d)}(${dr})를 import 한다.` +
          ` 공유 타입/로직이면 lib/로 옮길 것.`,
      );
    }
  }
}

// ── 2. 순환 의존 ─────────────────────────────────────────────────
{
  const state = new Map();
  const stack = [];
  const seen = new Set();
  const visit = (n) => {
    if (state.get(n) === 1) {
      const i = stack.indexOf(n);
      if (i >= 0) {
        const cyc = [...stack.slice(i), n].join(" → ");
        if (!seen.has(cyc)) {
          seen.add(cyc);
          problems.push(`순환 의존: ${cyc}`);
        }
      }
      return;
    }
    if (state.get(n) === 2) return;
    state.set(n, 1);
    stack.push(n);
    for (const d of graph.get(n) || []) visit(d);
    stack.pop();
    state.set(n, 2);
  };
  for (const n of graph.keys()) visit(n);
}

// ── 3. 공유 정책 상수의 지역 재선언 ──────────────────────────────
// lib/fill-memo가 단일 소유해야 하는 이름들. 훅에서 `const X =`로 다시
// 선언하면 두 타임라인 훅의 값이 갈라지는 그 사고가 재발한다.
const OWNED = [
  "FILL_BUDGET_MS",
  "FILL_TARGET_VISIBLE",
  "FILL_MAX_PAGES",
  "FILL_LIMIT_START",
  "FILL_LIMIT_STEP",
  "FILL_LIMIT_MAX",
];
for (const [f, src] of source) {
  if (f === "lib/fill-memo.ts") continue;
  for (const name of OWNED) {
    // 지역 선언만 잡는다(import는 무시).
    const re = new RegExp(`^\\s*(?:const|let|var)\\s+${name}\\b`, "m");
    if (re.test(src)) {
      problems.push(
        `정책 상수 재선언: ${f} 에서 ${name} 를 지역 선언했다.\n` +
          `    lib/fill-memo가 단일 소유 — import 해서 쓸 것.` +
          ` (room/thread 훅 값이 갈라져 버그가 났던 지점)`,
      );
    }
  }
  // 예산/목표를 다른 이름으로 몰래 복제하는 흔한 패턴도 잡는다.
  const clone = src.match(/^\s*const\s+(\w*FILL\w*|\w*BUDGET_MS)\s*=/m);
  if (clone && !OWNED.includes(clone[1])) {
    problems.push(
      `정책 상수 복제 의심: ${f} 의 ${clone[1]}\n` +
        `    채우기 예산은 lib/fill-memo에 모은다. 새 값이 정말 필요하면 거기 추가할 것.`,
    );
  }
}

// ── 결과 ─────────────────────────────────────────────────────────
if (problems.length === 0) {
  console.log(`✅ 아키텍처 검사 통과 (${files.length}개 모듈)`);
  process.exit(0);
}
console.error(`❌ 아키텍처 위반 ${problems.length}건\n`);
for (const p of problems) console.error(`  - ${p}\n`);
process.exit(1);
