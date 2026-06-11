import { Download, X, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface LightboxState {
  url: string;
  name: string;
}

let openLightboxFn: ((s: LightboxState) => void) | null = null;

/** 어디서든 이미지 라이트박스 열기 (MediaView 등) */
export function openLightbox(url: string, name: string) {
  openLightboxFn?.({ url, name });
}

/** 이미지 라이트박스 오버레이 — 앱 루트에 1개 마운트.
 *  ESC/배경 클릭 닫기, 클릭 줌 토글, 원본 저장 */
export function Lightbox() {
  const [state, setState] = useState<LightboxState | null>(null);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    openLightboxFn = (s) => {
      setState(s);
      setZoomed(false);
    };
    return () => {
      openLightboxFn = null;
    };
  }, []);

  const close = useCallback(() => setState(null), []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, close]);

  if (!state) return null;

  return createPortal(
    // 배경 클릭 닫기 (ESC는 window 핸들러)
    <div
      className="msg-in fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm"
      onClick={close}
    >
      {/* 헤더: 파일명 + 액션 (48px — 앱 헤더와 동일) */}
      <div className="flex h-12 shrink-0 items-center gap-2.5 px-5">
        <span className="min-w-0 flex-1 truncate text-[13px] text-fg-1">
          {state.name}
        </span>
        <a
          href={state.url}
          download={state.name}
          className="rounded-md p-2 text-fg-1 hover:bg-bg-2 hover:text-fg-0"
          title="저장"
          onClick={(e) => e.stopPropagation()}
        >
          <Download className="h-[15px] w-[15px]" />
        </a>
        <button
          type="button"
          className="rounded-md p-2 text-fg-1 hover:bg-bg-2 hover:text-fg-0"
          title={zoomed ? "축소" : "확대"}
          onClick={(e) => {
            e.stopPropagation();
            setZoomed((v) => !v);
          }}
        >
          {zoomed ? (
            <ZoomOut className="h-[15px] w-[15px]" />
          ) : (
            <ZoomIn className="h-[15px] w-[15px]" />
          )}
        </button>
        <button
          type="button"
          className="rounded-md p-2 text-fg-1 hover:bg-bg-2 hover:text-fg-0"
          title="닫기 (Esc)"
          onClick={close}
        >
          <X className="h-[15px] w-[15px]" />
        </button>
      </div>

      {/* 이미지 영역 */}
      <div
        className={`flex min-h-0 flex-1 items-center justify-center p-4 ${
          zoomed ? "overflow-auto" : "overflow-hidden"
        }`}
      >
        {/* 클릭 줌 토글 (헤더에 버튼도 제공됨) */}
        <img
          src={state.url}
          alt={state.name}
          className={
            zoomed
              ? "max-h-none max-w-none cursor-zoom-out"
              : "max-h-full max-w-full cursor-zoom-in object-contain"
          }
          onClick={(e) => {
            e.stopPropagation();
            setZoomed((v) => !v);
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
