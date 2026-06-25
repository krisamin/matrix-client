import { Loader2 } from "lucide-react";

/** 공용 인라인 스피너 — Loader2 animate-spin. */
export function InlineSpinner({
  size = "sm",
  className = "",
}: {
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const sz =
    size === "xs" ? "h-3 w-3" : size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  return <Loader2 className={`${sz} animate-spin ${className}`.trim()} />;
}
