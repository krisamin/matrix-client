import { LogOut, UserCog } from "lucide-react";
import type { MatrixClient } from "matrix-js-sdk";
import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n";
import { LOCALE_LABEL, type Locale, SUPPORTED_LOCALES } from "../lib/locale";
import { ProfileEditModal } from "./ProfileEditModal";

/** 앱 전역 설정 모달 — B-final 톤 (헤더 + divide-y row + 풀폭 푸터). */
export function AppSettingsModal({
  client,
  onClose,
  onLogout,
}: {
  client: MatrixClient;
  onClose: () => void;
  onLogout: () => void;
}) {
  const { t, locale, setLocale } = useI18n();
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[15vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-[460px] max-w-[90vw] overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <header className="flex h-12 items-center border-b border-line pl-5">
          <h2 className="font-semibold text-fg-0">
            {t("modal.appSettings.title")}
          </h2>
        </header>

        {/* 일반 섹션 */}
        <div className="border-b border-line bg-bg-2/30 px-5 py-2 text-[11px] font-medium text-fg-3">
          {t("settings.section.general")}
        </div>
        <div className="flex flex-col divide-y divide-line">
          <div className="flex flex-col gap-1 px-5 py-3">
            <div className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-[12px] text-fg-3">
                {t("settings.lang")}
              </span>
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value as Locale)}
                className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none"
              >
                {SUPPORTED_LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {LOCALE_LABEL[l]}
                  </option>
                ))}
              </select>
            </div>
            <p className="pl-[6.5rem] text-[11px] text-fg-3">
              {t("settings.lang.desc")}
            </p>
          </div>
        </div>

        {/* 계정 섹션 */}
        <div className="border-y border-line bg-bg-2/30 px-5 py-2 text-[11px] font-medium text-fg-3">
          {t("settings.section.account")}
        </div>
        <div className="flex flex-col divide-y divide-line">
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="flex w-full items-center gap-3 px-5 py-3 text-left text-[13px] text-fg-1 hover:bg-bg-2 hover:text-fg-0"
          >
            <UserCog className="h-4 w-4 shrink-0 text-fg-3" />
            <span className="flex-1">{t("settings.account.profile")}</span>
            <span className="font-mono text-[11px] text-fg-3">
              {client.getUserId()}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="flex w-full items-center gap-3 px-5 py-3 text-left text-[13px] text-fg-1 hover:bg-bg-2 hover:text-red-300"
          >
            <LogOut className="h-4 w-4 shrink-0 text-fg-3" />
            <span className="flex-1">{t("settings.account.logout")}</span>
          </button>
        </div>

        <div className="flex border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 text-[13px] text-fg-2 hover:bg-bg-2 hover:text-fg-0"
          >
            {t("common.close")}
          </button>
        </div>
      </div>

      {profileOpen && (
        <ProfileEditModal
          client={client}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </div>
  );
}
