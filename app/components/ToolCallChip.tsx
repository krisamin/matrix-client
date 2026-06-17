import { ChevronRight, Wrench } from "lucide-react";
import type { MatrixClient, MatrixEvent } from "matrix-js-sdk";
import { useState } from "react";
import { MessageBody } from "./MessageBody";

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

/** tool_progress 메시지(게이트웨이가 m.notice + tool_progress 필드로 태깅)를
 *  일반 채팅 버블이 아니라 "접힌 칩 → 클릭 시 펼침"으로 렌더한다.
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
