import { ArrowLeft } from "lucide-react";
import type { MatrixClient, Room } from "matrix-js-sdk";
import { useEffect, useState } from "react";
import { useIsMobile } from "../hooks/useMediaQuery";
import { useT } from "../lib/i18n";
import { PaneHeader, PaneHeaderButton } from "./PaneHeader";
import type { Tab } from "./room-settings/_shared";
import { AccessTab } from "./room-settings/AccessTab";
import { DangerTab } from "./room-settings/DangerTab";
import { GeneralTab } from "./room-settings/GeneralTab";
import { PermissionsTab } from "./room-settings/PermissionsTab";

/** 방 설정 모달 — 일반/접근/권한/위험 탭 (B-final 톤).
 *  데스크탑: 좌측 세로 탭 사이드바 + 우측 컨텐츠. 720px 카드.
 *  모바일: 풀스크린 + 상단 가로 스크롤 탭. */
export function RoomSettingsModal({
  client,
  room,
  onClose,
}: {
  client: MatrixClient;
  room: Room;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("general");
  const t = useT();
  const isSpace = room.isSpaceRoom();
  const isMobile = useIsMobile();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tabs = (
    [
      { id: "general", label: t("roomSettings.tab.general") },
      { id: "access", label: t("roomSettings.tab.access") },
      { id: "permissions", label: t("roomSettings.tab.permissions") },
      { id: "danger", label: t("roomSettings.tab.danger") },
    ] as { id: Tab; label: string }[]
  ).map((tabItem) => {
    const active = tab === tabItem.id;
    const danger = tabItem.id === "danger";
    return (
      <button
        key={tabItem.id}
        type="button"
        onClick={() => setTab(tabItem.id)}
        className={
          isMobile
            ? // 모바일: 가로 탭 — 하단 인디케이터
              `relative shrink-0 whitespace-nowrap px-4 py-3 text-[13px] transition-colors ${
                active
                  ? danger
                    ? "font-medium text-red-300"
                    : "font-medium text-fg-0"
                  : danger
                    ? "text-red-400/80"
                    : "text-fg-2"
              }`
            : // 데스크탑: 세로 탭 — 좌측 인디케이터
              `relative border-b border-line py-2.5 pl-5 pr-4 text-left text-[13px] transition-colors ${
                active
                  ? danger
                    ? "bg-red-950/30 font-medium text-red-300"
                    : "bg-bg-2 font-medium text-fg-0"
                  : danger
                    ? "text-red-400/80 hover:bg-bg-2 hover:text-red-300"
                    : "text-fg-2 hover:bg-bg-2 hover:text-fg-0"
              }`
        }
      >
        {active && (
          <span
            className={
              isMobile
                ? `absolute inset-x-3 bottom-0 h-[2px] ${danger ? "bg-red-400" : "bg-fg-0"}`
                : `absolute inset-y-0 left-0 w-[2px] ${danger ? "bg-red-400" : "bg-fg-0"}`
            }
          />
        )}
        {tabItem.label}
      </button>
    );
  });

  const title = isSpace
    ? t("roomSettings.title.space")
    : t("roomSettings.title.room");

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[10vh] max-md:p-0"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex h-[80vh] w-[720px] max-w-[95vw] overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl max-md:h-full max-md:w-full max-md:max-w-full max-md:flex-col max-md:rounded-none max-md:border-0"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        {isMobile ? (
          // 모바일: 상단 헤더(제목+닫기) + 가로 탭 + 컨텐츠
          <>
            <PaneHeader
              leading={
                <PaneHeaderButton
                  icon={ArrowLeft}
                  title={t("common.back")}
                  onClick={onClose}
                />
              }
            >
              <h2 className="truncate font-semibold text-fg-0">{title}</h2>
            </PaneHeader>
            <nav className="flex shrink-0 overflow-x-auto border-b border-line">
              {tabs}
            </nav>
            <section className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {tab === "general" && (
                <GeneralTab client={client} room={room} onClose={onClose} />
              )}
              {tab === "access" && (
                <AccessTab client={client} room={room} onClose={onClose} />
              )}
              {tab === "permissions" && (
                <PermissionsTab client={client} room={room} onClose={onClose} />
              )}
              {tab === "danger" && (
                <DangerTab client={client} room={room} onClose={onClose} />
              )}
            </section>
          </>
        ) : (
          // 데스크탑: 좌측 세로 탭 + 우측 컨텐츠
          <>
            <aside className="flex w-44 shrink-0 flex-col border-r border-line bg-bg-1">
              <header className="flex h-12 items-center border-b border-line pl-5">
                <h2 className="truncate font-semibold text-fg-0">{title}</h2>
              </header>
              {tabs}
            </aside>
            <section className="flex min-w-0 flex-1 flex-col">
              {tab === "general" && (
                <GeneralTab client={client} room={room} onClose={onClose} />
              )}
              {tab === "access" && (
                <AccessTab client={client} room={room} onClose={onClose} />
              )}
              {tab === "permissions" && (
                <PermissionsTab client={client} room={room} onClose={onClose} />
              )}
              {tab === "danger" && (
                <DangerTab client={client} room={room} onClose={onClose} />
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
