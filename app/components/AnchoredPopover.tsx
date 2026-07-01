import type { ReactNode } from "react";
import { createPortal } from "react-dom";

const GAP = 6;
const MARGIN = 8;

/** 앵커(트리거 요소 rect) 기준 포털 팝오버 셸 — EmojiPicker/UserProfileCard/
 *  SchedulePopover 공용. 스크롤 컨테이너 안의 팝오버는 row-상대 absolute가
 *  아니라 createPortal(document.body) + 앵커 rect가 정답 (스킬 원칙).
 *
 *  - 배경 클릭 / Esc 닫기 내장
 *  - 수평: align("left"=앵커 왼쪽 정렬 | "right"=앵커 오른쪽 끝 정렬) + 뷰포트 클램프
 *  - 수직: prefer("above"|"below") 우선, 공간 부족 시 반대쪽으로 플립 + 클램프
 *  - height는 실높이(고정 크기 콘텐츠) 또는 추정치(가변 콘텐츠의 플립 판단용)
 *
 *  주의: anchor rect는 핸들러 본문에서 즉시 getBoundingClientRect()로 떠서
 *  넘길 것 — setState 업데이터 콜백 시점엔 e.currentTarget이 null (스킬 함정). */
export function AnchoredPopover({
  anchor,
  width,
  height,
  estimatedHeight,
  align = "left",
  prefer = "below",
  className = "",
  onClose,
  children,
}: {
  /** 트리거 요소의 getBoundingClientRect() */
  anchor: DOMRect;
  width: number;
  /** 실높이(style로 고정) 또는 추정 높이(estimatedHeight와 함께 플립 판단만) */
  height?: number;
  /** 플립 판단용 추정 높이 — height 미지정(내용에 따라 가변)일 때 사용 */
  estimatedHeight?: number;
  align?: "left" | "right";
  prefer?: "above" | "below";
  /** 팝오버 본체에 추가할 클래스 (레이아웃: flex flex-col 등) */
  className?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const estH = height ?? estimatedHeight ?? 230;
  const x = Math.min(
    Math.max(MARGIN, align === "right" ? anchor.right - width : anchor.left),
    window.innerWidth - width - MARGIN,
  );
  let y: number;
  if (prefer === "above") {
    const fitsAbove = anchor.top - estH - GAP >= MARGIN;
    y = fitsAbove
      ? anchor.top - estH - GAP
      : Math.min(anchor.bottom + GAP, window.innerHeight - estH - MARGIN);
  } else {
    const fitsBelow = anchor.bottom + estH + GAP <= window.innerHeight - MARGIN;
    y = fitsBelow
      ? anchor.bottom + GAP
      : Math.max(MARGIN, anchor.top - estH - GAP);
  }

  return createPortal(
    <>
      {/* 배경: 클릭하면 닫힘 (토글 버튼 재클릭 포함) */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      />
      <div
        className={`msg-in fixed z-50 overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl ${className}`}
        style={{ left: x, top: y, width, height }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
