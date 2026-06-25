import { BellOff, Star } from "lucide-react";
import { useEffect } from "react";
import { useI18n } from "../../lib/i18n";

/** 방 우클릭 컨텍스트 메뉴 — 커서 위치에 고정, 바깥 클릭/Esc로 닫힘 */
export function RoomContextMenu({
  x,
  y,
  fav,
  muted,
  onFav,
  onMute,
  onClose,
}: {
  x: number;
  y: number;
  fav: boolean;
  muted: boolean;
  onFav: () => void;
  onMute: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // 다음 틱부터 바깥 클릭 감지 (현재 우클릭이 바로 닫지 않게)
    const id = setTimeout(() => window.addEventListener("click", close), 0);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(id);
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed z-50 flex min-w-[180px] flex-col divide-y divide-line overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
      role="presentation"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-fg-1 hover:bg-bg-2 hover:text-fg-0"
        onClick={onFav}
      >
        <Star
          className={`h-3.5 w-3.5 shrink-0 ${fav ? "fill-amber-400 text-amber-400" : "text-fg-3"}`}
        />
        {t(fav ? "sidebar.context.unfavorite" : "sidebar.context.favorite")}
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-fg-1 hover:bg-bg-2 hover:text-fg-0"
        onClick={onMute}
      >
        <BellOff className="h-3.5 w-3.5 shrink-0 text-fg-3" />
        {t(muted ? "sidebar.context.unmute" : "sidebar.context.mute")}
      </button>
    </div>
  );
}
