import type React from "react";

/** 섹션 라벨 (Direct / Spaces / Rooms) — RoomInfoPane/SpaceView 카드 헤더 톤
 *  과 같은 패밀리로 (그래픽 uppercase 대신 일관된 한글 라벨 + 카운트). */
export function SectionLabel({
  children,
  count,
}: {
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <div className="mt-3 flex items-center gap-1.5 px-3 pb-1 first:mt-0">
      <span className="text-[11px] font-medium text-fg-2">{children}</span>
      {typeof count === "number" && count > 0 && (
        <span className="font-mono text-[11px] text-fg-3">{count}</span>
      )}
    </div>
  );
}
