import type { ReactNode } from "react";
import { useEffect } from "react";
import { useIsMobile } from "../hooks/useMediaQuery";

/** 모달 백드롭 + 박스 — 모든 모달의 공통 chrome.
 *  - Esc로 닫힘 (onClose 호출)
 *  - 백드롭 클릭으로 닫힘
 *  - 박스 클릭은 stopPropagation으로 전파 차단
 *  - B-final 톤: rounded-md / border-line / bg-bg-1 / shadow-2xl
 *
 *  @param size 폭 프리셋. "sm"=380, "md"=460(기본), "lg"=560, "xl"=720, "full"=커스텀
 *  @param topInset 상단 여백 (vh 단위, 데스크탑만). 기본 15.
 *  @param fixedHeight true면 모달 높이를 60vh로 고정 — 콘텐츠 변화에도 안
 *    들썩임 (Advanced 토글 같은 동적 펼침에 유용). 기본 false.
 *  @param mobileMode 모바일(max-md) 표시 방식.
 *    - "sheet"(기본): 화면 아래에서 올라오는 바텀시트 — 작은 폼/설정에 자연스러움.
 *    - "fullscreen": 위아래 꽉 찬 전체화면 — 내용 많은 설정(룸/스페이스)용. */
export function Modal({
  onClose,
  children,
  size = "md",
  topInset = 15,
  fixedHeight = false,
  mobileMode = "sheet",
  className = "",
}: {
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  topInset?: number;
  fixedHeight?: boolean;
  mobileMode?: "sheet" | "fullscreen";
  className?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 모바일은 풀스크린/시트라 상단 inset 제거(0). 데스크탑만 topInset 적용.
  const isMobile = useIsMobile();

  const sizeClass =
    size === "sm"
      ? "w-[380px]"
      : size === "md"
        ? "w-[460px]"
        : size === "lg"
          ? "w-[560px]"
          : size === "xl"
            ? "w-[720px]"
            : "";

  // 모바일 정렬: 시트는 하단 정렬(아래서 올라옴), 풀스크린은 stretch.
  // 데스크탑은 항상 상단 정렬(items-start).
  const backdropAlign =
    mobileMode === "fullscreen" ? "max-md:items-stretch" : "max-md:items-end";

  // 모바일 박스 형태:
  //  - sheet: 가로 꽉 + 상단만 둥근 모서리 + 높이 자연(최대 90vh) + 아래서 슬라이드인
  //  - fullscreen: 가로/세로 꽉 + 라운드/보더 제거
  const mobileBox =
    mobileMode === "fullscreen"
      ? "max-md:h-full max-md:w-full max-md:rounded-none max-md:border-0"
      : "max-md:w-full max-md:max-h-[90vh] max-md:rounded-b-none max-md:border-x-0 max-md:border-b-0 max-md:animate-sheet-in";

  return (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center bg-black/50 max-md:p-0 ${backdropAlign}`}
      style={{ paddingTop: isMobile ? 0 : `${topInset}vh` }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`flex ${fixedHeight ? "h-[60vh]" : "max-h-[80vh]"} flex-col overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl ${mobileBox} ${sizeClass} ${className}`}
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        {children}
      </div>
    </div>
  );
}

/** 모달 헤더 — h-12 / pl-5 / 우측 padding 0 (다른 모달과 통일).
 *  우측에 액션 버튼이 필요하면 actions prop으로. */
export function ModalHeader({
  title,
  actions,
}: {
  title: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex h-12 shrink-0 items-stretch border-b border-line">
      <h2 className="flex flex-1 items-center pl-4 font-semibold text-fg-0">
        {title}
      </h2>
      {actions && <div className="flex items-stretch">{actions}</div>}
    </header>
  );
}

/** 모달 푸터 — 풀폭 좌(취소)/우(주 액션) 버튼. */
export function ModalFooter({
  onCancel,
  onConfirm,
  cancelLabel,
  confirmLabel,
  busy = false,
  disabled = false,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  cancelLabel: string;
  confirmLabel: string;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 border-t border-line">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 border-r border-line py-2.5 text-[13px] text-fg-2 hover:bg-bg-2 hover:text-fg-0"
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy || disabled}
        className="flex-1 bg-bg-2 py-2.5 text-[13px] font-medium text-fg-0 hover:bg-bg-3 disabled:opacity-50"
      >
        {confirmLabel}
      </button>
    </div>
  );
}
