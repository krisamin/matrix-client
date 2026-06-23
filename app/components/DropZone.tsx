import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useT } from "../lib/i18n";

/** 파일 드래그&드롭 영역 — 페인 전체를 감싸고, 파일을 끌고 들어오면
 *  점선 오버레이 표시, 놓으면 onFiles 콜백.
 *  dragenter/leave는 자식 요소를 지날 때마다 발화하므로 depth 카운팅으로 안정화 */
export function DropZone({
  className = "",
  label,
  onFiles,
  children,
}: {
  className?: string;
  /** 오버레이에 표시할 대상 이름 (예: 방 이름) */
  label: string;
  onFiles: (files: File[]) => void;
  children: React.ReactNode;
}) {
  const t = useT();
  const [active, setActive] = useState(false);
  const depth = useRef(0);

  /** 파일 드래그만 반응 (텍스트 선택 드래그 등은 무시) */
  function hasFiles(e: React.DragEvent) {
    return Array.from(e.dataTransfer.types).includes("Files");
  }

  return (
    <div
      className={`relative ${className}`}
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setActive(true);
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        depth.current -= 1;
        if (depth.current <= 0) {
          depth.current = 0;
          setActive(false);
        }
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setActive(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) onFiles(files);
      }}
    >
      {children}
      {/* 드롭 오버레이 — pointer-events 차단해 자식으로의 leave 깜빡임 방지 */}
      {active && (
        <div className="msg-in pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-bg-0/70 p-4 backdrop-blur-[2px]">
          <div className="flex h-full w-full flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-line-strong">
            <Upload className="h-7 w-7 text-fg-1" />
            <p className="text-[14px] font-medium text-fg-0">
              {t("drop.hint")}
            </p>
            <p className="font-mono text-[11px] text-fg-2">{label}</p>
          </div>
        </div>
      )}
    </div>
  );
}
