import type { ReactNode } from "react";

/** 페인 상단 헤더 — 높이 48px 통일 (사이드바/채팅/스레드 모두 같은 라인) */
export function PaneHeader({
  children,
  actions,
}: {
  children: ReactNode;
  /** 우측 액션 버튼 영역 */
  actions?: ReactNode;
}) {
  return (
    <header className="app-titlebar flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-5">
      {children}
      {actions && (
        <div className="ml-auto flex items-center gap-0.5 text-fg-2">
          {actions}
        </div>
      )}
    </header>
  );
}

/** 헤더 우측 아이콘 버튼 */
export function PaneHeaderButton({
  onClick,
  title,
  children,
}: {
  onClick?: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="rounded-md p-2 hover:bg-bg-2 hover:text-fg-0"
    >
      {children}
    </button>
  );
}
