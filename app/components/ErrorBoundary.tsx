import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useT } from "../lib/i18n";

interface Props {
  /** fallback에 표시할 영역 라벨 (i18n 키) — "사이드바" / "메시지 영역" 등 */
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

interface InnerProps extends Props {
  /** i18n 번역된 텍스트 — class 컴포넌트가 hook 못 쓰니 wrapper에서 주입 */
  i18n: {
    errorIn: (label: string) => string;
    errorPlain: string;
    retry: string;
    errorShort: string;
  };
}

/** 컴포넌트 렌더 에러 격리. React Error Boundary는 class 전용. */
class ErrorBoundaryInner extends Component<InnerProps, State> {
  state: State = { error: null, errorId: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "[ErrorBoundary]",
      this.props.label ?? "(unknown)",
      error,
      info.componentStack,
    );
  }

  componentDidUpdate(prev: InnerProps) {
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
    const { i18n } = this.props;

    if (size === "inline") {
      return (
        <span
          className="inline-flex items-center gap-1 text-[11px] text-red-400"
          title={msg}
        >
          <AlertTriangle className="h-3 w-3" />
          {i18n.errorShort}
        </span>
      );
    }

    return (
      <div
        className={`flex w-full ${
          size === "full" ? "h-dvh" : "h-full min-h-[200px]"
        } flex-col items-center justify-center gap-3 p-6 text-center`}
      >
        <AlertTriangle className="h-8 w-8 text-red-400" />
        <div className="flex flex-col gap-1">
          <p className="text-[14px] font-semibold text-fg-0">
            {label ? i18n.errorIn(label) : i18n.errorPlain}
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
          {i18n.retry}
        </button>
      </div>
    );
  }
}

/** function wrapper — i18n hook으로 번역 가져와 class에 주입. */
export function ErrorBoundary(props: Props) {
  const t = useT();
  const i18n = {
    errorIn: (label: string) => t("error.boundary.in", { label }),
    errorPlain: t("error.boundary.plain"),
    retry: t("error.boundary.retry"),
    errorShort: t("error.boundary.short"),
  };
  return <ErrorBoundaryInner {...props} i18n={i18n} />;
}
