import type { ReactNode } from "react";
import { useEffect } from "react";

/** 모달 백드롭 + 박스 — 모든 모달의 공통 chrome.
 *  - Esc로 닫힘 (onClose 호출)
 *  - 백드롭 클릭으로 닫힘
 *  - 박스 클릭은 stopPropagation으로 전파 차단
 *  - B-final 톤: rounded-md / border-line / bg-bg-1 / shadow-2xl
 *
 *  @param size 폭 프리셋. "sm"=380, "md"=460(기본), "lg"=560, "xl"=720, "full"=커스텀
 *  @param topInset 상단 여백 (vh 단위). 기본 15. RoomSettings처럼 큰 모달은 10.
 *  @param fixedHeight true면 모달 높이를 60vh로 고정 — 콘텐츠 변화에도 안
 *    들썩임 (Advanced 토글 같은 동적 펼침에 유용). 기본 false. */
export function Modal({
  onClose,
  children,
  size = "md",
  topInset = 15,
  fixedHeight = false,
  className = "",
}: {
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  topInset?: number;
  fixedHeight?: boolean;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50"
      style={{ paddingTop: `${topInset}vh` }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`flex ${fixedHeight ? "h-[60vh]" : "max-h-[80vh]"} flex-col overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl ${sizeClass} ${className}`}
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
      <h2 className="flex flex-1 items-center pl-5 font-semibold text-fg-0">
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
