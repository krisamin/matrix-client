import type { LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Modal } from "./Modal";

export type ActionMenuItem = {
  /** React key */
  key: string;
  /** 표시 라벨 */
  label: string;
  /** 좌측 아이콘 (lucide). 생략 가능 */
  icon?: LucideIcon;
  /** 아이콘에 추가할 className — 별표 채우기 등 미세 커스텀 */
  iconClassName?: string;
  /** danger 톤 (red-400) */
  danger?: boolean;
  /** 클릭 핸들러. rect는 시트/메뉴의 트리거 버튼 위치 — 이모지 피커처럼
   *  anchor가 필요한 액션에 쓰임. 시트에선 시트 박스의 rect를 넘김. */
  onClick: (rect?: DOMRect) => void;
};

/** 시트 + PC 컨텍스트 메뉴 통합 컴포넌트.
 *
 *  같은 액션 배열을 두 결로 렌더:
 *  - 모바일 long-press → 화면 아래에서 슬라이드업 시트 (Modal mobileMode="sheet")
 *  - 데스크탑 우클릭 → 커서 위치 fixed 메뉴
 *
 *  호출부는 트리거 종류에 맞춰 sheetOpen / menuAt만 set 하면 됨.
 *  둘 다 null/false면 아무것도 렌더 안 됨.
 *
 *  결 통일:
 *  - 컨테이너: `divide-y divide-line` + `bg-bg-1` + `border-line` + `shadow-2xl`
 *  - 행: 아이콘 5×5 (fg-3) + 라벨 15px (fg-1) + 패딩 px-5 py-3 + active:bg-bg-2
 *  - danger 행: text-red-400, 아이콘도 red-400
 *
 *  가상 스크롤 행 안에서도 viewport 기준으로 뜨도록 `createPortal(document.body)` 사용.
 */
export function ActionMenu({
  items,
  sheetOpen = false,
  onCloseSheet,
  menuAt = null,
  onCloseMenu,
  minWidth = 200,
}: {
  items: ActionMenuItem[];
  /** 모바일 시트 표시 여부 */
  sheetOpen?: boolean;
  onCloseSheet?: () => void;
  /** PC 컨텍스트 메뉴 좌표 (null이면 닫힘) */
  menuAt?: { x: number; y: number } | null;
  onCloseMenu?: () => void;
  /** PC 메뉴 최소 폭 (기본 200) */
  minWidth?: number;
}) {
  // PC 메뉴: 바깥 클릭으로 닫기 (Esc는 Modal 안 쓰는 경로라 직접 처리)
  // - 다음 틱부터 등록해서 "현재 우클릭"이 바로 닫지 않게 함
  useEffect(() => {
    if (!menuAt || !onCloseMenu) return;
    const close = () => onCloseMenu();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseMenu();
    };
    const id = setTimeout(() => window.addEventListener("click", close), 0);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(id);
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuAt, onCloseMenu]);

  // 트리거 버튼 측정용 ref — onClick에 rect 넘김
  const containerRef = useRef<HTMLDivElement | null>(null);

  const renderItem = (item: ActionMenuItem, variant: "sheet" | "menu") => {
    const Icon = item.icon;
    // 시트(모바일): 큰 톤 — px-5 py-3 / text-15 / 아이콘 5×5
    // 메뉴(PC 우클릭): compact 톤 — px-3 py-2 / text-13 / 아이콘 3.5×3.5
    const sizing =
      variant === "sheet"
        ? "gap-3 px-5 py-3 text-[15px]"
        : "gap-2.5 px-3 py-2 text-[13px]";
    const iconSize = variant === "sheet" ? "h-5 w-5" : "h-3.5 w-3.5";
    const baseColor = item.danger
      ? "text-red-400 active:bg-red-500/10 hover:bg-bg-2"
      : "text-fg-1 active:bg-bg-2 hover:bg-bg-2 hover:text-fg-0";
    const iconColor = item.danger ? "text-red-400" : "text-fg-3";
    return (
      <button
        key={item.key}
        type="button"
        className={`flex w-full items-center text-left ${sizing} ${baseColor}`}
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          item.onClick(rect);
        }}
      >
        {Icon ? (
          <Icon
            className={`${iconSize} shrink-0 ${iconColor} ${item.iconClassName ?? ""}`}
          />
        ) : null}
        <span className="flex-1 truncate">{item.label}</span>
      </button>
    );
  };

  // 모바일 시트
  const sheet =
    sheetOpen && onCloseSheet
      ? createPortal(
          <Modal onClose={onCloseSheet} size="full" mobileMode="sheet">
            <div
              ref={containerRef}
              className="flex flex-col divide-y divide-line"
            >
              {items.map((it) => renderItem(it, "sheet"))}
            </div>
          </Modal>,
          document.body,
        )
      : null;

  // PC 컨텍스트 메뉴
  const menu = menuAt
    ? createPortal(
        <div
          ref={containerRef}
          className="fixed z-50 flex flex-col divide-y divide-line overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl"
          style={{ left: menuAt.x, top: menuAt.y, minWidth }}
          onClick={(e) => e.stopPropagation()}
          role="presentation"
        >
          {items.map((it) => renderItem(it, "menu"))}
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      {sheet}
      {menu}
    </>
  );
}
