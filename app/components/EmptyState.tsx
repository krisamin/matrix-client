import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** 공용 빈 상태 컴포넌트.
 *  - lg: 라우트 전체 (방 미선택 등)
 *  - md: 패널 섹션 (사이드바 empty 등)
 *  - sm: 모달/리스트 안 한 줄 (아이콘 없음) */
export function EmptyState({
  icon: Icon,
  title,
  body,
  children,
  size = "lg",
}: {
  icon?: LucideIcon;
  title?: string;
  body?: string;
  children?: ReactNode;
  size?: "lg" | "md" | "sm";
}) {
  if (size === "sm") {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        {body && <p className="text-[13px] text-fg-3">{body}</p>}
        {title && !body && <p className="text-[13px] text-fg-3">{title}</p>}
        {children}
      </div>
    );
  }
  if (size === "md") {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        {Icon && <Icon className="h-6 w-6 text-fg-3" strokeWidth={1.25} />}
        {title && <p className="text-[13px] font-medium text-fg-1">{title}</p>}
        {body && (
          <p className="text-[11px] leading-relaxed text-fg-3">{body}</p>
        )}
        {children}
      </div>
    );
  }
  // lg
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      {Icon && <Icon className="h-10 w-10 text-fg-3" strokeWidth={1.25} />}
      {title && <p className="text-[14px] text-fg-2">{title}</p>}
      {body && <p className="text-[12px] text-fg-3">{body}</p>}
      {children}
    </div>
  );
}
