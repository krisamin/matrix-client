import type { ReactNode } from "react";

/** 모달/카드의 읽기 전용 라벨 + 값 행.
 *  좌측 라벨 컬럼(고정 폭) + 우측 값 영역.
 *  Field와 비슷하지만 input/edit 없이 단순 표시용. */
export function InfoRow({
  label,
  labelWidth = "w-20",
  children,
}: {
  label: ReactNode;
  /** 라벨 컬럼 폭 (Tailwind 클래스). 기본 w-20(80px). */
  labelWidth?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className={`${labelWidth} shrink-0 text-[12px] text-fg-3`}>
        {label}
      </span>
      <span className="flex flex-1 items-center gap-1 text-[13px] text-fg-1">
        {children}
      </span>
    </div>
  );
}
