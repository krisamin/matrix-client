import fs from "node:fs";
const CDN = "https://cdn.jsdelivr.net/gh/toss/tossface/dist";
const css = await (await fetch(`${CDN}/tossface.css`)).text();
const VALID = /^U\+[0-9A-Fa-f?]{1,6}(-[0-9A-Fa-f]{1,6})?$/;
const out = [
  "/* Tossface v1.0.3 @font-face — 자동 생성(scripts/gen-tossface-css.mjs). 직접 수정 금지.",
  " *",
  " * 원본 https://cdn.jsdelivr.net/gh/toss/tossface/dist/tossface.css 는 chunk 11의",
  " * unicode-range에 스펙 위반 토큰(U+26F9200D2640, U+26F9200D2642 — 7자리 초과라",
  " * 파싱 불가)이 있다. CSS 파서는 해당 토큰만 버리는 게 아니라 range 전체를 무효로",
  " * 처리하고, unicode-range가 없는 @font-face는 '전 범위 매칭'이 되어 화면에 어떤",
  " * 글자든 있으면 chunk 11(532KB)을 무조건 받는다. 이모지가 하나도 없어도 받는다.",
  " * (2026-08 실측: 순수 라틴/한글 화면에서도 다운로드됨)",
  " *",
  " * → 잘못된 토큰을 걷어내 range를 되살린다. woff2 파일은 그대로 jsDelivr에서 받는다.",
  " */",
];
let dropped = 0, kept = 0;
for (const m of css.matchAll(/@font-face\s*\{[^}]*\}/g)) {
  const file = m[0].match(/Mac-(\w+)\.woff2/)?.[1];
  const ur = m[0].match(/unicode-range:([^;}]*)/);
  if (!file || !ur) continue;
  const all = ur[1].replace(/\s+/g, " ").split(",").map(t => t.trim()).filter(Boolean);
  const good = all.filter(t => VALID.test(t));
  dropped += all.length - good.length; kept++;
  if (!good.length) continue;
  out.push(`@font-face{font-family:"Tossface";font-style:normal;font-weight:400;font-display:swap;src:url("${CDN}/TossFaceFontMac-${file}.woff2") format("woff2");unicode-range:${good.join(",")}}`);
}
fs.writeFileSync("app/tossface.css", out.join("\n") + "\n");
console.log(`@font-face ${kept}개 생성, 잘못된 토큰 ${dropped}개 제거, ${fs.statSync("app/tossface.css").size}B`);
console.log("※ 생성 후 `pnpm exec biome check --write app/tossface.css` 로 포맷을 맞출 것.");
