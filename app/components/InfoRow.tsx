import type { ComponentType, ReactNode } from "react";

/** 모달/카드의 읽기 전용 라벨 + 값 행.
 *  좌측 (옵션 icon) + 라벨 컬럼(고정 폭) + 우측 값 영역.
 *  Field와 비슷하지만 input/edit 없이 단순 표시용.
 *  inset: 'modal'(px-4 py-2.5 text-[13px]) | 'pane'(px-5 py-2 text-[12px]) */
export function InfoRow({
  icon: Icon,
  label,
  labelWidth = "w-20",
  inset = "modal",
  children,
}: {
  icon?: ComponentType<{ className?: string }>;
  label: ReactNode;
  /** 라벨 컬럼 폭 (Tailwind 클래스). 기본 w-20(80px). */
  labelWidth?: string;
  /** 영역 패딩 — modal(좌우 16px) / pane(좌우 20px, 메인 영역 톤) */
  inset?: "modal" | "pane";
  children: ReactNode;
}) {
  const padding =
    inset === "pane" ? "px-5 py-2 text-[12px]" : "px-4 py-2.5 text-[13px]";
  return (
    <div className={`flex items-center gap-2.5 ${padding}`}>
      {Icon && <Icon className="h-3 w-3 shrink-0 text-fg-3" />}
      <span className={`${labelWidth} shrink-0 text-fg-3`}>{label}</span>
      <span className="flex flex-1 items-center gap-1 text-fg-1">
        {children}
      </span>
    </div>
  );
}
