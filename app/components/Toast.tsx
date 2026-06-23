import { X } from "lucide-react";
import type { ReactNode } from "react";

/** 좌하단 토스트 스택 — 알림 권한 요청, 키 인증 안내, 연결 끊김 등.
 *  상단 가로 배너 자리를 차지하지 않아 메인 디자인을 해치지 않음.
 *  - container: position: fixed bottom-3 left-3 column gap
 *  - card:      rounded-md border bg-bg-1, B-final 톤
 *  - 우측 상단 X 닫기 (선택), 액션 버튼 풀폭 푸터 톤. */
export function ToastStack({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none fixed bottom-3 left-3 z-40 flex w-[320px] max-w-[calc(100vw-1.5rem)] flex-col-reverse gap-2">
      {children}
    </div>
  );
}

export function Toast({
  icon,
  title,
  body,
  variant = "info",
  action,
  onDismiss,
}: {
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  /** 'info'(중립) / 'warn'(노랑) / 'error'(빨강) — 좌측 라벨 색만 영향. */
  variant?: "info" | "warn" | "error";
  /** 우측 풀폭 액션 — { label, onClick } */
  action?: { label: ReactNode; onClick: () => void };
  /** 닫기 가능하면 콜백 — 우측 상단 X 표시. */
  onDismiss?: () => void;
}) {
  const accentCls =
    variant === "error"
      ? "text-red-300"
      : variant === "warn"
        ? "text-amber-300"
        : "text-fg-1";
  return (
    <div className="msg-in pointer-events-auto flex flex-col overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl">
      <div className="flex items-start gap-2.5 px-4 py-3">
        {icon && (
          <span className={`mt-0.5 shrink-0 ${accentCls}`}>{icon}</span>
        )}
        <div className="min-w-0 flex-1">
          <p className={`text-[13px] font-medium ${accentCls}`}>{title}</p>
          {body && (
            <p className="mt-0.5 text-[12px] leading-relaxed text-fg-2">
              {body}
            </p>
          )}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="-mt-1 -mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-fg-3 hover:bg-bg-2 hover:text-fg-0"
            aria-label="dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="border-t border-line bg-bg-2 py-2 text-[12px] font-medium text-fg-0 hover:bg-bg-3"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
