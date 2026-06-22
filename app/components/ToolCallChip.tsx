import { ChevronRight, Wrench } from "lucide-react";
import type { MatrixClient, MatrixEvent } from "matrix-js-sdk";
import { useState } from "react";
import { MessageBody } from "./MessageBody";

/** Hermes 게이트웨이가 보내는 도구 호출 진행 메시지를 본문 모양으로 식별한다.
 *
 *  배경: 게이트웨이는 원래 m.notice + 커스텀 `tool_progress: true` 필드로 칩
 *  분기 마커를 박지만, 그 동작은 hermes 로컬 패치(`matrix-live-streaming.patch`)
 *  의존이라 hermes update 시 패치가 풀려 마커가 사라진다. 그 경우 일반 m.notice로
 *  떨어져 칩이 안 보이고 평문 텍스트로 풀려버린다.
 *
 *  해결: 본문 자체에 단서가 있다. `gateway/platforms/base.py::format_tool_event`
 *  포맷:
 *    - `{emoji} {tool_name}...`
 *    - `{emoji} {tool_name}: "{preview}"`
 *    - `{emoji} {tool_name}([key, key])\n{args_str}`  (verbose)
 *  마커 없이도 첫 줄 모양 + 알려진 도구 이름 화이트리스트로 충분히 판별 가능. */

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

/** 본문이 도구 진행 메시지로 보이는지.
 *
 *  - 메시지 m.notice 이고
 *  - 본문 첫 줄이 `<emoji-or-symbol> <tool_name>(... | : "..." | ...)` 패턴
 *
 *  레거시 호환: `content.tool_progress === true`도 같이 인정. */
export function isToolProgressEvent(ev: MatrixEvent): boolean {
  const content = ev.getContent() as {
    msgtype?: string;
    body?: string;
    tool_progress?: boolean;
  };
  // 레거시 마커 우선
  if (content.tool_progress === true) return true;
  // m.notice 만 — 일반 채팅 텍스트는 m.text라 영향 없음
  if (content.msgtype !== "m.notice") return false;
  const body = (content.body ?? "").trim();
  if (!body) return false;
  // edit fallback("* ..." 접두)이 있을 수 있어 제거
  const head =
    body
      .replace(/^\*\s+/, "")
      .split("\n")[0]
      ?.trim() ?? "";
  if (!head) return false;
  // 첫 토큰을 도구 이름으로 분리:
  //   "{이모지}<공백 1+>{tool_name}<...>"
  // 첫 공백까지가 이모지(또는 prefix). 그 뒤가 도구 이름 후보.
  // 이모지가 두 글자(예: ⚙️)인 경우도 있어 공백 기준이 안전.
  const m = head.match(/^\S+\s+([a-z_][a-z0-9_]*)(?:\s*\.\.\.|\s*:\s*"|\s*\()/);
  if (!m) return false;
  return KNOWN_TOOL_NAMES.has(m[1]);
}

/** 본문에서 접힌 칩에 보여줄 한 줄 요약 추출:
 *  - 마크다운 장식/코드펜스/헤더 마커 제거 후 첫 의미 줄
 *  - 너무 길면 잘라서 말줄임 */
function previewLine(body: string): string {
  const firstMeaningful = body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !/^[`*_>#-]+$/.test(l));
  if (!firstMeaningful) return "도구 실행";
  const cleaned = firstMeaningful
    .replace(/^#+\s*/, "") // 헤더 마커
    .replace(/^[-*>]\s*/, "") // 불릿/인용 마커
    .replace(/[*_`~]/g, "") // 인라인 장식
    .trim();
  return cleaned.length > 80
    ? `${cleaned.slice(0, 80)}…`
    : cleaned || "도구 실행";
}

/** tool_progress 메시지(게이트웨이가 m.notice + tool_progress 필드로 태깅하거나
 *  본문 패턴으로 식별된 메시지)를 일반 채팅 버블이 아니라
 *  "접힌 칩 → 클릭 시 펼침"으로 렌더한다.
 *  - 라이브 갱신(m.replace edit)되는 메시지라 MessageBody를 그대로 재사용해
 *    펼친 상태에서도 진행 내용이 실시간으로 따라간다. */
export function ToolCallChip({
  client,
  ev,
}: {
  client: MatrixClient;
  ev: MatrixEvent;
}) {
  const [open, setOpen] = useState(false);
  const body = (ev.getContent().body as string) ?? "";
  // edit fallback("* ..." prefix)이 평문 body에 섞여있을 수 있어 제거
  const preview = previewLine(body.replace(/^\*\s+/, ""));

  return (
    <div className="my-0.5">
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
        <span className="truncate font-mono">{preview}</span>
      </button>
      {open && (
        <div className="mt-1 rounded-md border border-line bg-bg-1/40 px-3 py-2 text-[13px] text-fg-2">
          <MessageBody client={client} ev={ev} />
        </div>
      )}
    </div>
  );
}
