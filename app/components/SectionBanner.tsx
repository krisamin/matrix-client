import type { ReactNode } from "react";

/** 회색 안내문 헤더 — 모달 상단의 보조 컨텍스트(예: "읽기 전용", forward 대상
 *  메시지 미리보기). border-b로 다음 영역과 분리, bg-bg-2/40로 입력 영역과
 *  살짝 톤 분리. 본문 row와 같은 px-4 inset.
 *
 *  variant:
 *    - "info" (기본): bg-bg-2/40 text-fg-3
 *
 *  className: 호출부에서 truncate/shrink-0 같은 레이아웃 클래스 추가 가능. */
export function SectionBanner({
  children,
  variant = "info",
  className,
}: {
  children: ReactNode;
  variant?: "info";
  className?: string;
}) {
  const variantCls =
    variant === "info" ? "bg-bg-2/40 text-fg-3" : "bg-bg-2/40 text-fg-3";
  return (
    <p
      className={`border-b border-line px-4 py-2 text-[12px] ${variantCls}${
        className ? ` ${className}` : ""
      }`}
    >
      {children}
    </p>
  );
}
