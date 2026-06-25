import type { MatrixClient, Room } from "matrix-js-sdk";
import { useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { AccessTab } from "./room-settings/AccessTab";
import { DangerTab } from "./room-settings/DangerTab";
import { GeneralTab } from "./room-settings/GeneralTab";
import { PermissionsTab } from "./room-settings/PermissionsTab";
import { type Tab } from "./room-settings/_shared";

/** 방 설정 모달 — 일반/접근/권한/위험 탭 (B-final 톤). */
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[10vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex h-[80vh] w-[720px] max-w-[95vw] overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        {/* 좌측 탭 — Sidebar 톤(좌측 accent + bg-bg-2/30 헤더 띠) */}
        <aside className="flex w-44 shrink-0 flex-col border-r border-line bg-bg-1">
          <header className="flex h-12 items-center border-b border-line pl-5">
            <h2 className="truncate font-semibold text-fg-0">
              {isSpace
                ? t("roomSettings.title.space")
                : t("roomSettings.title.room")}
            </h2>
          </header>
          {(
            [
              { id: "general", label: t("roomSettings.tab.general") },
              { id: "access", label: t("roomSettings.tab.access") },
              { id: "permissions", label: t("roomSettings.tab.permissions") },
              { id: "danger", label: t("roomSettings.tab.danger") },
            ] as { id: Tab; label: string }[]
          ).map((t) => {
            const active = tab === t.id;
            const danger = t.id === "danger";
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`relative border-b border-line py-2.5 pl-5 pr-4 text-left text-[13px] transition-colors ${
                  active
                    ? danger
                      ? "bg-red-950/30 font-medium text-red-300"
                      : "bg-bg-2 font-medium text-fg-0"
                    : danger
                      ? "text-red-400/80 hover:bg-bg-2 hover:text-red-300"
                      : "text-fg-2 hover:bg-bg-2 hover:text-fg-0"
                }`}
              >
                {/* 활성 인디케이터 — 좌측 2px accent bar */}
                {active && (
                  <span
                    className={`absolute inset-y-0 left-0 w-[2px] ${
                      danger ? "bg-red-400" : "bg-fg-0"
                    }`}
                  />
                )}
                {t.label}
              </button>
            );
          })}
        </aside>
        {/* 우측 컨텐츠 */}
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
      </div>
    </div>
  );
}
