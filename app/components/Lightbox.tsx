import {
  ChevronLeft,
  ChevronRight,
  Download,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../lib/i18n";

interface LightboxState {
  url: string;
  name: string;
}

let openLightboxFn: ((s: LightboxState) => void) | null = null;

/* ── 이미지 레지스트리 ──
   타임라인에 마운트된 이미지 MediaView가 자신을 등록.
   라이트박스 ←/→는 이 목록(이벤트 타임스탬프 순)을 넘김. */
interface RegisteredImage {
  key: string; // eventId
  ts: number; // 정렬 기준 (이벤트 타임스탬프)
  url: string;
  name: string;
}
const imageRegistry = new Map<string, RegisteredImage>();

/** 타임라인 이미지 등록 (MediaView 마운트 시) — 반환: 해제 함수 */
export function registerLightboxImage(img: RegisteredImage): () => void {
  imageRegistry.set(img.key, img);
  return () => {
    imageRegistry.delete(img.key);
  };
}

function sortedImages(): RegisteredImage[] {
  return [...imageRegistry.values()].sort((a, b) => a.ts - b.ts);
}

/** 어디서든 이미지 라이트박스 열기 (MediaView 등) */
export function openLightbox(url: string, name: string) {
  openLightboxFn?.({ url, name });
}

/** 이미지 라이트박스 오버레이 — 앱 루트에 1개 마운트.
 *  ESC/배경 클릭 닫기, 클릭 줌 토글, ←/→ 같은 방 이미지 넘기기, 원본 저장 */
export function Lightbox() {
  const t = useT();
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

  // 현재 이미지의 레지스트리상 위치 (url 기준 — blob URL은 mxc당 유일)
  const images = state ? sortedImages() : [];
  const index = images.findIndex((i) => i.url === state?.url);
  const prev = index > 0 ? images[index - 1] : null;
  const next =
    index >= 0 && index < images.length - 1 ? images[index + 1] : null;

  const goTo = useCallback((img: RegisteredImage | null) => {
    if (!img) return;
    setState({ url: img.url, name: img.name });
    setZoomed(false);
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") goTo(prev);
      if (e.key === "ArrowRight") goTo(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, close, goTo, prev, next]);

  if (!state) return null;

  const navBtn =
    "rounded-full border border-line bg-bg-2/80 p-2.5 text-fg-1 backdrop-blur hover:bg-bg-3 hover:text-fg-0 disabled:opacity-30 disabled:pointer-events-none";

  return createPortal(
    // 배경 클릭 닫기 (ESC는 window 핸들러)
    <div
      className="msg-in fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm"
      onClick={close}
    >
      {/* 헤더: 파일명 + 위치 + 액션 (48px — 앱 헤더와 동일) */}
      <div className="flex h-12 shrink-0 items-center gap-2.5 px-5">
        <span className="min-w-0 flex-1 truncate text-[13px] text-fg-1">
          {state.name}
        </span>
        {images.length > 1 && index >= 0 && (
          <span className="shrink-0 font-mono text-[11px] text-fg-2">
            {index + 1} / {images.length}
          </span>
        )}
        <a
          href={state.url}
          download={state.name}
          className="rounded-md p-2 text-fg-1 hover:bg-bg-2 hover:text-fg-0"
          title={t("lightbox.save")}
          onClick={(e) => e.stopPropagation()}
        >
          <Download className="h-[15px] w-[15px]" />
        </a>
        <button
          type="button"
          className="rounded-md p-2 text-fg-1 hover:bg-bg-2 hover:text-fg-0"
          title={t(zoomed ? "lightbox.zoomOut" : "lightbox.zoomIn")}
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
          title={t("lightbox.close")}
          onClick={close}
        >
          <X className="h-[15px] w-[15px]" />
        </button>
      </div>

      {/* 이미지 영역 */}
      <div
        className={`relative flex min-h-0 flex-1 items-center justify-center p-4 ${
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

      {/* 좌우 내비게이션 (이미지 2장 이상일 때) */}
      {prev && (
        <button
          type="button"
          className={`${navBtn} absolute left-4 top-1/2 -translate-y-1/2`}
          title={t("lightbox.prev")}
          onClick={(e) => {
            e.stopPropagation();
            goTo(prev);
          }}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {next && (
        <button
          type="button"
          className={`${navBtn} absolute right-4 top-1/2 -translate-y-1/2`}
          title={t("lightbox.next")}
          onClick={(e) => {
            e.stopPropagation();
            goTo(next);
          }}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>,
    document.body,
  );
}
