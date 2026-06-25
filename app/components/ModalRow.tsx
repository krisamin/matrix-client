import type { ReactNode } from "react";

/** 모달/카드 안의 정보 행 — `px-4 py-2.5` 표준.
 *  좌측 라벨/아이콘 + 우측 값 패턴이 모달마다 반복돼서 공용화.
 *  세부 톤이 다르면 className으로 보강. */
export function ModalRow({
  children,
  className = "",
}: {
  children: ReactNode;
  /** 추가 클래스 — gap/border/cursor 등 보강용. */
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 ${className}`.trim()}
    >
      {children}
    </div>
  );
}
