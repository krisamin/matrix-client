import { ChevronRight, Wrench } from "lucide-react";
import type { MatrixClient, MatrixEvent } from "matrix-js-sdk";
import { useState } from "react";
import { useT } from "../lib/i18n";

/** Hermes 게이트웨이가 보내는 도구 호출 진행 메시지를 칩으로 렌더한다.
 *
 *  식별: `tool_progress: true` 마커만 신뢰한다. 마커 없는 메시지는
 *  본문 패턴이 도구처럼 보여도 일반 채팅으로 취급 (옛 패턴 기반
 *  인식은 false positive 위험이 커서 제거).
 *
 *  분할: 한 메시지에 코드블록이 여러 개 들어오면 각각을 독립 칩으로
 *  분리해서 펼침 상태를 개별 관리한다. 도구 이름은 클라이언트가
 *  알 수 없으므로 라벨은 i18n `tool.run`으로 통일. */

/** 도구 진행 섹션 — 칩 라벨로 쓸 헤더 preview + 펼침 시 본문. */
interface ToolSection {
  /** 칩 라벨 옆 preview (코드블록 첫 줄) */
  header: string;
  /** 펼침 시 보여줄 본문 (코드블록 내용) */
  body: string;
}

/** 본문에서 코드블록을 추출해 섹션 목록으로 변환.
 *  코드블록이 없으면 본문 전체를 단일 섹션으로 폴백. */
function buildSections(rawBody: string): ToolSection[] {
  const trimmed = rawBody.trim();
  if (!trimmed) return [];
  const sections: ToolSection[] = [];
  const fenceRe = /```([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: matchAll 대체 — index 보존 필요 X
  while ((m = fenceRe.exec(trimmed)) !== null) {
    const code = m[1].replace(/^\n/, "").replace(/\n$/, "");
    const firstLine = code.split("\n", 1)[0]?.trim() ?? "";
    sections.push({
      header: firstLine || "(empty)",
      body: code,
    });
  }
  if (sections.length === 0) {
    const firstLine = trimmed.split("\n", 1)[0]?.trim() ?? "";
    sections.push({
      header: firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine,
      body: trimmed,
    });
  }
  return sections;
}

/** 도구 이름을 메시지 content에서 읽음 — 게이트웨이 단(matrix-essential)에서
 *  whitelist 검증해서 박은 값이라 클라는 그대로 신뢰. 누락 시 fallback 라벨. */
function getToolName(ev: MatrixEvent): string | null {
  const content = ev.getContent() as { tool_name?: unknown };
  return typeof content.tool_name === "string" && content.tool_name
    ? content.tool_name
    : null;
}

/** 본문이 도구 진행 메시지인지 — `tool_progress: true` 마커만 신뢰. */
export function isToolProgressEvent(ev: MatrixEvent): boolean {
  const content = ev.getContent() as { tool_progress?: boolean };
  return content.tool_progress === true;
}

/** 단일 도구 호출 칩 — 헤더 preview만 보여주고 클릭 시 본문 펼침.
 *  toolName이 있으면 라벨에 표시(예: `terminal`), 없으면 `t("tool.run")` 폴백. */
function ToolSectionRow({
  section,
  toolName,
}: {
  section: ToolSection;
  toolName: string | null;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const label = toolName ?? t("tool.run");
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group/chip flex max-w-full items-center gap-1.5 rounded-md border border-line bg-bg-2/50 px-2 py-1 text-[12px] text-fg-2 transition-colors hover:border-line-strong hover:bg-bg-2 hover:text-fg-1"
        title={open ? t("toolcall.collapse") : t("toolcall.expand")}
      >
        <Wrench className="h-3 w-3 shrink-0 text-fg-3" />
        <ChevronRight
          className={`h-3 w-3 shrink-0 text-fg-3 transition-transform ${
            open ? "rotate-90" : ""
          }`}
        />
        <span className="shrink-0 font-mono font-medium text-fg-1">
          {label}
        </span>
        {section.header && (
          <span className="truncate font-mono text-fg-3">{section.header}</span>
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
 *  - 본문에 코드블록 N개면 칩 N개 — 각각 독립적으로 펼침
 *  - 라이브 갱신(m.replace edit)되면 ev.getContent()가 최신을 반환하므로
 *    buildSections가 매 렌더마다 새 섹션 목록을 만들어 따라간다. */
export function ToolCallChip({
  client: _client,
  ev,
}: {
  client: MatrixClient;
  ev: MatrixEvent;
}) {
  const t = useT();
  const body = (ev.getContent().body as string) ?? "";
  const toolName = getToolName(ev);
  const sections = buildSections(body);
  if (sections.length === 0) {
    // 본문이 비어있으면 라벨만 있는 비활성 칩
    return (
      <div className="my-0.5">
        <button
          type="button"
          className="flex max-w-full items-center gap-1.5 rounded-md border border-line bg-bg-2/50 px-2 py-1 text-[12px] text-fg-2"
          disabled
        >
          <Wrench className="h-3 w-3 shrink-0 text-fg-3" />
          <span className="truncate font-mono">
            {toolName ?? t("tool.run")}
          </span>
        </button>
      </div>
    );
  }
  return (
    <div className="my-0.5 flex flex-col gap-1">
      {sections.map((s) => (
        // 헤더+본문 길이 조합 — 같은 헤더가 두 번 나와도 본문이 다르면 분리
        <ToolSectionRow
          key={`${s.header}:${s.body.length}`}
          section={s}
          toolName={toolName}
        />
      ))}
    </div>
  );
}
