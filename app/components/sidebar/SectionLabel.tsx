import type React from "react";

/** 섹션 라벨 (Direct / Spaces / Rooms) — SpaceView Section 톤과 통일.
 *  uppercase tracking-wider 톤으로 정보 위계 강조. */
export function SectionLabel({
  children,
  count,
}: {
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <div className="mt-3 flex items-center gap-1.5 px-1.5 pb-1 first:mt-0">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-3">
        {children}
      </span>
      {typeof count === "number" && count > 0 && (
        <span className="font-mono text-[11px] text-fg-3">{count}</span>
      )}
    </div>
  );
}
