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
    disabled,
    variant = "default",
    iconSize,
    type = "button",
    className = "",
  },
  ref,
) {
  const box = size === "sm" ? "h-9 w-9" : "h-12 w-12";
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
