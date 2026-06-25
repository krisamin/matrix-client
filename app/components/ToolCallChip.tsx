import { ChevronRight, Wrench } from "lucide-react";
import type { MatrixClient, MatrixEvent } from "matrix-js-sdk";
import { useState } from "react";

/** Hermes 게이트웨이가 보내는 도구 호출 진행 메시지를 본문 모양으로 식별/분할한다.
 *
 *  배경: 게이트웨이는 `tool_progress: true` 마커를 박지만 hermes 로컬 패치
 *  의존이라 update 시 풀려 평문으로 떨어짐. 또 한 turn의 여러 도구 호출이
 *  하나의 m.text 메시지로 묶여 와서 칩 하나로 합쳐 보이는 문제도 있었다.
 *
 *  해결:
 *  - 본문 모든 라인을 스캔해 도구 헤더 패턴을 찾고 (첫 줄 한정 X)
 *  - 헤더 발견마다 새 섹션 시작 → 한 메시지에 N개 도구가 있으면 N개 칩 렌더 */

/** Hermes 코어/플러그인이 노출하는 모델 도구 이름.
 *  agent/display.py의 primary_args 딕셔너리 + 흔한 모델 도구 추가. */
const KNOWN_TOOL_NAMES = new Set<string>([
  "terminal",
  "process",
  "web_search",
  "web_extract",
  "read_file",
  "write_file",
  "patch",
  "search_files",
  "browser_navigate",
  "browser_click",
  "browser_type",
  "browser_snapshot",
  "browser_press",
  "browser_scroll",
  "browser_back",
  "browser_vision",
  "browser_console",
  "browser_get_images",
  "image_generate",
  "text_to_speech",
  "vision_analyze",
  "mixture_of_agents",
  "skill_view",
  "skills_list",
  "skill_manage",
  "cronjob",
  "execute_code",
  "delegate_task",
  "clarify",
  "memory",
  "todo",
  "session_search",
  "x_search",
]);

/** 한 줄에서 도구 이름 추출. 자연 채팅 텍스트와 구분되도록 엄격 패턴만 인정.
 *
 *  Hermes 게이트웨이가 한 turn에서 같은 메시지에 여러 도구 호출을 누적할 때,
 *  두 번째 이후 헤더는 이모지 prefix(`💻` 등) 없이 도구 이름 한 단어만 오기도
 *  한다(예: `terminal\n\`\`\`\ncmd\n\`\`\``). 그래서 단독 도구이름 라인도
 *  "다음 라인이 코드블록 시작이면" 헤더로 인정한다.
 *
 *  - 패턴 A: `<prefix(이모지 등)> <tool_name>` — 마커 없이 단독이어도 OK
 *  - 패턴 B: `<tool_name>(...)` 또는 `<tool_name>: "..."` 등 명시적 마커
 *  - 패턴 C: `<tool_name>` 단독 + nextLine이 \`\`\` 로 시작 (휴리스틱)
 *
 *  화이트리스트 통과는 모든 패턴에 필수. */
function matchToolHeader(line: string, nextLine?: string): string | null {
  // edit fallback("* ..." 접두) 제거
  const cleaned = line.replace(/^\*\s+/, "").trim();
  if (!cleaned) return null;
  if (cleaned.startsWith("```")) return null;
  // 패턴 A: prefix(이모지 등) + 공백 + tool_name [+ 마커 없어도 OK]
  let m = cleaned.match(
    /^\S+\s+([a-z_][a-z0-9_]*)(?:\s*\(|\s*:\s*"|\s*\.\.\.|\s*$)/,
  );
  if (m && KNOWN_TOOL_NAMES.has(m[1])) return m[1];
  // 패턴 B: prefix 없이 tool_name + 마커
  m = cleaned.match(/^([a-z_][a-z0-9_]*)(?:\s*\(|\s*:\s*"|\s*\.\.\.)/);
  if (m && KNOWN_TOOL_NAMES.has(m[1])) return m[1];
  // 패턴 C: prefix 없이 tool_name 단독 라인 + 다음 줄이 코드블록 시작
  // (hermes가 같은 m.replace 메시지에 도구 호출 누적할 때 두번째 헤더 케이스)
  m = cleaned.match(/^([a-z_][a-z0-9_]*)$/);
  if (m && KNOWN_TOOL_NAMES.has(m[1]) && nextLine?.trim().startsWith("```")) {
    return m[1];
  }
  return null;
}

/** 도구 진행 섹션 — 헤더 줄 + 그 도구의 본문 영역(다음 헤더 직전까지). */
interface ToolSection {
  /** 도구 이름 (KNOWN_TOOL_NAMES 중 하나) */
  tool: string;
  /** 헤더 줄 원본 (이모지 + 도구이름 + 마커 등) */
  header: string;
  /** 헤더 다음부터 다음 헤더 직전까지의 본문 (트림됨) */
  body: string;
}

/** 본문을 도구 진행 섹션 목록으로 분할.
 *  도구 헤더가 하나도 없으면 빈 배열 → 호출부에서 일반 메시지로 처리. */
function splitToolSections(rawBody: string): ToolSection[] {
  const lines = rawBody.split("\n");
  const sections: { tool: string; header: string; bodyLines: string[] }[] = [];
  let current: (typeof sections)[number] | null = null;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const tool = matchToolHeader(raw, lines[i + 1]);
    if (tool) {
      if (current) sections.push(current);
      current = {
        tool,
        header: raw.replace(/^\*\s+/, "").trim(),
        bodyLines: [],
      };
    } else if (current) {
      current.bodyLines.push(raw);
    }
    // 헤더 발견 전의 줄들(인사말 등 prefix)은 버림 — 도구 진행 메시지에선 거의 없음
  }
  if (current) sections.push(current);
  return sections.map((s) => ({
    tool: s.tool,
    header: s.header,
    body: s.bodyLines.join("\n").trim(),
  }));
}

/** 본문이 도구 진행 메시지로 보이는지 (헤더 한 개 이상). */
export function isToolProgressEvent(ev: MatrixEvent): boolean {
  const content = ev.getContent() as {
    msgtype?: string;
    body?: string;
    tool_progress?: boolean;
  };
  // 레거시 마커 우선 (패치 적용 상태)
  if (content.tool_progress === true) return true;
  // m.notice(패치 상태) 또는 m.text(패치 풀린 상태) 둘 다 검사.
  if (content.msgtype !== "m.notice" && content.msgtype !== "m.text")
    return false;
  const body = (content.body ?? "").trim();
  if (!body) return false;
  return splitToolSections(body).length > 0;
}

/** 헤더에서 도구 이름 다음의 마커/괄호 부분을 추출 — 칩 라벨 미리보기용.
 *  예: `🧠 memory(['target', 'operations'])` → `(['target', 'operations'])` */
function previewFromHeader(header: string, tool: string): string {
  const idx = header.indexOf(tool);
  if (idx < 0) return "";
  const tail = header.slice(idx + tool.length).trim();
  if (!tail) return "";
  // 너무 길면 자름
  return tail.length > 60 ? `${tail.slice(0, 60)}…` : tail;
}

/** 단일 도구 호출 칩 — 헤더만 보여주고 클릭 시 그 도구의 본문(코드/결과) 펼침. */
function ToolSectionRow({ section }: { section: ToolSection }) {
  const [open, setOpen] = useState(false);
  const preview = previewFromHeader(section.header, section.tool);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group/chip flex max-w-full items-center gap-1.5 rounded-md border border-line bg-bg-2/50 px-2 py-1 text-[12px] text-fg-2 transition-colors hover:border-line-strong hover:bg-bg-2 hover:text-fg-1"
        title={open ? "접기" : "펼치기"}
      >
        <Wrench className="h-3 w-3 shrink-0 text-fg-3" />
        <ChevronRight
          className={`h-3 w-3 shrink-0 text-fg-3 transition-transform ${
            open ? "rotate-90" : ""
          }`}
        />
        <span className="shrink-0 font-mono font-medium text-fg-1">
          {section.tool}
        </span>
        {preview && (
          <span className="truncate font-mono text-fg-3">{preview}</span>
        )}
      </button>
      {open && section.body && (
        <pre className="mt-1 max-h-[400px] overflow-auto whitespace-pre-wrap rounded-md border border-line bg-bg-1/40 px-3 py-2 font-mono text-[12px] text-fg-2">
          {section.body}
        </pre>
      )}
    </div>
  );
}

/** 도구 호출 진행 메시지를 칩(들)로 렌더한다.
 *  - 본문에 도구 헤더가 1개면 칩 1개
 *  - 여러 개면 도구별로 분리해서 N개 칩 — 각각 독립적으로 펼침
 *  - 라이브 갱신(m.replace edit)되면 ev.getContent()가 최신을 반환하므로
 *    splitToolSections가 매 렌더마다 새 섹션 목록을 만들어 따라간다. */
export function ToolCallChip({
  client: _client,
  ev,
}: {
  client: MatrixClient;
  ev: MatrixEvent;
}) {
  const body = (ev.getContent().body as string) ?? "";
  const sections = splitToolSections(body);
  if (sections.length === 0) {
    // 안전망 — isToolProgressEvent를 통과했지만 split이 비어 있으면
    // 평문 한 줄 칩으로 폴백 (자체 마커 케이스 등).
    return (
      <div className="my-0.5">
        <button
          type="button"
          className="flex max-w-full items-center gap-1.5 rounded-md border border-line bg-bg-2/50 px-2 py-1 text-[12px] text-fg-2"
          disabled
        >
          <Wrench className="h-3 w-3 shrink-0 text-fg-3" />
          <span className="truncate font-mono">도구 실행</span>
        </button>
      </div>
    );
  }
  return (
    <div className="my-0.5 flex flex-col gap-1">
      {sections.map((s) => (
        // 헤더 원문이 같은 turn 안에서 도구별 안정 키 — 같은 도구가 같은 args로
        // 두 번 호출되는 극단 케이스에서만 충돌하지만 그땐 펼침 상태 공유돼도 무해.
        <ToolSectionRow key={s.header} section={s} />
      ))}
    </div>
  );
}
