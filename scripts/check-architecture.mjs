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

// ── 4. 테스트가 복제한 로직의 드리프트 ───────────────────────────
// SPA 코드는 브라우저 전용 번들이라 node:test에서 직접 import할 수 없다.
// 그래서 일부 테스트는 소스 함수를 **손으로 복제**해 검증한다. 복제본은
// 소스가 바뀌어도 조용히 옛 로직을 계속 통과시킨다 — §3의 쌍둥이 발산과
// 정확히 같은 사고다. 여기서 본문을 기계 대조한다.
{
  const twins = [
    {
      test: "scripts/server-name.test.mjs",
      src: "lib/uia.ts",
      fn: "serverNameFromInput",
    },
  ];
  // 함수 본문만 뽑는다(주석/타입 표기/들여쓰기 차이는 무시).
  //
  // ★ 중괄호를 세서 끝을 찾을 때 **문자열·정규식 리터럴 안의 괄호**를 반드시
  //   건너뛰어야 한다. 처음에 그냥 셌더니 `replace(/\/+$/, "")` 의 `$/` 뒤
  //   중괄호를 함수 끝으로 오인해 본문이 잘렸고, 잘린 뒷부분에 넣은 사보타주가
  //   비교에서 빠져 가드가 조용히 통과했다(A/B 둘 다 통과 = 계측 무효).
  const bodyOf = (text, fn) => {
    const i = text.search(new RegExp(`function\\s+${fn}\\b`));
    if (i < 0) return null;
    const open = text.indexOf("{", i);
    if (open < 0) return null;
    let depth = 0;
    let j = open;
    while (j < text.length) {
      const c = text[j];
      // 줄/블록 주석
      if (c === "/" && text[j + 1] === "/") {
        j = text.indexOf("\n", j);
        if (j < 0) return null;
        continue;
      }
      if (c === "/" && text[j + 1] === "*") {
        j = text.indexOf("*/", j + 2);
        if (j < 0) return null;
        j += 2;
        continue;
      }
      // 문자열 리터럴
      if (c === '"' || c === "'" || c === "`") {
        j++;
        while (j < text.length && text[j] !== c) j += text[j] === "\\" ? 2 : 1;
        j++;
        continue;
      }
      // 정규식 리터럴 — 직전 유효 문자로 나눗셈과 구분한다.
      if (c === "/") {
        const prev = text.slice(open, j).trimEnd().slice(-1);
        if (prev === "" || "(,=:[!&|?{};+-*%~^".includes(prev)) {
          j++;
          let cls = false;
          while (j < text.length) {
            if (text[j] === "\\") j += 2;
            else if (text[j] === "[") (cls = true), j++;
            else if (text[j] === "]") (cls = false), j++;
            else if (text[j] === "/" && !cls) break;
            else j++;
          }
          j++;
          continue;
        }
      }
      if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        return text
          .slice(open + 1, j)
          .replace(/:\s*string\b/g, "")
          .replace(/\s+/g, "");
      }
      j++;
    }
    return null;
  };
  for (const t of twins) {
    const testPath = path.resolve(APP, "..", t.test);
    const srcText = source.get(t.src);
    if (!fs.existsSync(testPath) || srcText === undefined) {
      problems.push(
        `복제 대조 불가: ${t.test} 또는 ${t.src} 를 찾을 수 없다.\n` +
          `    경로가 바뀌었으면 check-architecture.mjs 의 twins 목록도 갱신할 것.`,
      );
      continue;
    }
    const a = bodyOf(srcText, t.fn);
    const b = bodyOf(fs.readFileSync(testPath, "utf8"), t.fn);
    if (a === null || b === null) {
      problems.push(
        `복제 대조 불가: ${t.fn} 본문을 ${a === null ? t.src : t.test} 에서 못 찾았다.`,
      );
    } else if (a !== b) {
      problems.push(
        `테스트 복제본 드리프트: ${t.test} 의 ${t.fn} 이 ${t.src} 와 다르다.\n` +
          `    복제본이 옛 로직을 통과시키고 있다 — 소스 본문을 그대로 옮길 것.`,
      );
    }
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
