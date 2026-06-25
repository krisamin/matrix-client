import type { ReactNode } from "react";

/** 모달/카드 상단 Avatar 헤더 영역 — 살짝 어두운 띠로 컨텐츠 영역과 시각 구분.
 *  Profile 편집 / User 카드 / 방 설정 General 등 동일 패턴이 반복돼 공용화. */
export function CardHeader({
  children,
  className = "",
}: {
  children: ReactNode;
  /** shrink-0 같은 부가 클래스 (form 내부 vs 모달 상단 등 컨텍스트 차이) */
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-2 border-b border-line bg-bg-2/30 px-4 py-5 ${className}`.trim()}
    >
      {children}
    </div>
  );
}
