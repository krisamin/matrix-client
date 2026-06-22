import type { ReactNode } from "react";

/** 페인 상단 헤더 — 높이 48px (PWA WCO에선 env(titlebar-area-height)에 종속).
 *  자식이 h-full aspect-square로 정사각화하면 헤더 높이에 자동으로 따라간다. */
export function PaneHeader({
  children,
  actions,
}: {
  children: ReactNode;
  /** 우측 액션 버튼 영역 */
  actions?: ReactNode;
}) {
  return (
    <header className="app-titlebar flex h-12 shrink-0 items-center gap-2.5 border-b border-line bg-bg-1 pl-5">
      {children}
      {actions && (
        <div className="ml-auto flex h-full items-stretch text-fg-2">
          {actions}
        </div>
      )}
    </header>
  );
}

/** 헤더 우측 아이콘 버튼 — 정사각(헤더 높이에 종속), 라운드/간격 없음.
 *  PWA WCO에서 헤더가 작아지면 버튼도 같이 작아져 OS 컨트롤 영역을 침범 안 함. */
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
      className="flex aspect-square h-full shrink-0 items-center justify-center hover:bg-bg-2 hover:text-fg-0"
    >
      {children}
    </button>
  );
}
