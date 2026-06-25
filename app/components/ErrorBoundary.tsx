import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  /** 깨졌을 때 fallback에 표시할 짧은 라벨 — "메시지 영역" / "사이드바" 등 */
  label?: string;
  /** 깨진 영역 사이즈 — full(전체 페이지) / pane(섹션) / inline(작은 단위) */
  size?: "full" | "pane" | "inline";
  children: ReactNode;
  /** 외부에서 reset할 키 (예: 방 id 바뀌면 reset) */
  resetKey?: string;
}

interface State {
  error: Error | null;
  errorId: number;
}

/** 컴포넌트 렌더 에러 격리.
 *  한 영역이 깨져도 전체 앱이 화이트 스크린 안 됨.
 *  React 18의 Suspense는 데이터 로딩만 — 동기 render 에러는 ErrorBoundary 필수.
 *  resetKey가 바뀌면 자동 리셋 (방 전환 등). */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorId: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 콘솔에 항상 기록 — Sentry/외부 reporter는 후속 작업
    console.error(
      "[ErrorBoundary]",
      this.props.label ?? "(unknown)",
      error,
      info.componentStack,
    );
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, errorId: this.state.errorId + 1 });
    }
  }

  reset = () => {
    this.setState({ error: null, errorId: this.state.errorId + 1 });
  };

  render() {
    if (!this.state.error) return this.props.children;

    const size = this.props.size ?? "pane";
    const label = this.props.label;
    const msg = this.state.error.message || String(this.state.error);

    if (size === "inline") {
      return (
        <span
          className="inline-flex items-center gap-1 text-[11px] text-red-400"
          title={msg}
        >
          <AlertTriangle className="h-3 w-3" />
          오류
        </span>
      );
    }

    return (
      <div
        className={`flex w-full ${
          size === "full" ? "h-screen" : "h-full min-h-[200px]"
        } flex-col items-center justify-center gap-3 p-6 text-center`}
      >
        <AlertTriangle className="h-8 w-8 text-red-400" />
        <div className="flex flex-col gap-1">
          <p className="text-[14px] font-semibold text-fg-0">
            {label ? `${label}에서 오류가 발생했어요` : "오류가 발생했어요"}
          </p>
          <p className="max-w-md break-words font-mono text-[11px] text-fg-3">
            {msg}
          </p>
        </div>
        <button
          type="button"
          onClick={this.reset}
          className="flex items-center gap-1.5 rounded-md border border-line bg-bg-2 px-3 py-1.5 text-[13px] text-fg-1 hover:bg-bg-3 hover:text-fg-0"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          다시 시도
        </button>
      </div>
    );
  }
}
