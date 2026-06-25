import type { ReactNode } from "react";

/** 키보드 단축키 표시용 `<kbd>` 스타일.
 *  Cmd+K hint / 단축키 안내 모달 / 검색 빠른 전환 등에서 동일 패턴. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-bg-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-2">
      {children}
    </kbd>
  );
}
