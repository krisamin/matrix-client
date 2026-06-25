import type { LucideIcon } from "lucide-react";
import { forwardRef } from "react";

/** 공용 아이콘 버튼 — 사이드바 헤더/입력창 등 동일 톤.
 *  PaneHeaderButton과는 별개: 명시적 size 박스(h-12/h-9)로,
 *  헤더 외 영역에서도 같은 톤을 재사용. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  {
    icon: LucideIcon;
    onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
    title?: string;
    size?: "sm" | "md";
    /** true면 부모 높이에 맞춰 정사각형 — 헤더(h-12 border-b로 콘텐츠 47px)
     *  안에서 h-12 고정이 1px 삐져나오는 문제 회피. */
    fillParent?: boolean;
    disabled?: boolean;
    variant?: "default" | "danger";
    iconSize?: number;
    type?: "button" | "submit";
    className?: string;
  }
>(function IconButton(
  {
    icon: Icon,
    onClick,
    title,
    size = "md",
    fillParent = false,
    disabled,
    variant = "default",
    iconSize,
    type = "button",
    className = "",
  },
  ref,
) {
  const box = fillParent
    ? "aspect-square h-full"
    : size === "sm"
      ? "h-9 w-9"
      : "h-12 w-12";
  const tone =
    variant === "danger"
      ? "text-fg-2 hover:bg-red-950/40 hover:text-red-300"
      : "text-fg-2 hover:bg-bg-2 hover:text-fg-0";
  const px = iconSize ?? (size === "sm" ? 14 : 15);
  return (
    <button
      ref={ref}
      type={type === "submit" ? "submit" : "button"}
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`flex ${box} shrink-0 items-center justify-center ${tone} disabled:opacity-50 ${className}`.trim()}
    >
      <Icon style={{ width: px, height: px }} />
    </button>
  );
});
