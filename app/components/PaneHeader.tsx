import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** 페인 상단 헤더 — 높이 48px (PWA WCO에선 env(titlebar-area-height)에 종속).
 *  자식이 h-full aspect-square로 정사각화하면 헤더 높이에 자동으로 따라간다.
 *  leading: 제목 왼쪽 슬롯 (모바일 뒤로가기 버튼 등). PaneHeaderButton을 넣으면
 *  우측 actions와 스타일이 자동 통일된다. */
export function PaneHeader({
  children,
  actions,
  leading,
}: {
  children: ReactNode;
  /** 우측 액션 버튼 영역 */
  actions?: ReactNode;
  /** 좌측 선행 슬롯 (뒤로가기 등) — actions와 동일한 PaneHeaderButton 톤 권장 */
  leading?: ReactNode;
}) {
  return (
    <header className="app-titlebar app-pane-lead flex h-12 shrink-0 items-center gap-2.5 border-b border-line bg-bg-1 pl-5">
      {leading && (
        <div
          data-pane-lead
          className="-ml-5 flex h-full items-stretch text-fg-2"
        >
          {leading}
        </div>
      )}
      {children}
      {actions && (
        <div className="ml-auto flex h-full items-stretch text-fg-2">
          {actions}
        </div>
      )}
    </header>
  );
}

/** 헤더 아이콘 버튼 — 정사각(헤더 높이에 종속), 라운드/간격 없음.
 *
 *  크기·정렬·hover·반응형이 전부 이 컴포넌트 한 곳에 묶여 있다:
 *   - 래퍼: `aspect-square h-full` → 헤더 높이에 종속(48px). PWA WCO에서 헤더가
 *     작아지면 버튼도 자동으로 같이 작아져 OS 컨트롤 영역을 침범하지 않는다.
 *   - 아이콘 크기: 데스크탑 15px / 모바일(max-md) 18px 자동 — 아래 둘 중 하나로 적용.
 *     · `icon` prop으로 lucide 아이콘만 넘기면 크기를 컴포넌트가 직접 책임진다(권장).
 *     · children으로 직접 넣을 땐 `[&>svg]` selector가 svg 크기를 강제한다(호환).
 *   - hover: Tailwind v4가 자동으로 @media (hover:hover) 가드. 단 삼성 안드로이드는
 *     터치인데도 hover:hover를 true로 잘못 보고하는 펌웨어 버그가 있어 hover 배경이
 *     탭 후 잔존할 수 있음 — stuck이 거슬리면 (pointer:fine) AND 가드로 강화할 것.
 *
 *  사용(권장): <PaneHeaderButton icon={Search} title="검색" onClick={...} />
 *  사용(호환): <PaneHeaderButton title="..."><CustomNode/></PaneHeaderButton> */
export function PaneHeaderButton({
  onClick,
  title,
  icon: Icon,
  children,
}: {
  onClick?: () => void;
  title: string;
  /** lucide 아이콘 — 넘기면 크기(데스크탑 15 / 모바일 18)를 자동 적용 */
  icon?: LucideIcon;
  /** icon 대신 커스텀 노드를 직접 넣을 때 (svg는 [&>svg]가 크기 강제) */
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="flex aspect-square h-full shrink-0 items-center justify-center [&>svg]:h-[15px] [&>svg]:w-[15px] max-md:[&>svg]:h-[18px] max-md:[&>svg]:w-[18px] hover:bg-bg-2 hover:text-fg-0"
    >
      {Icon ? <Icon /> : children}
    </button>
  );
}
