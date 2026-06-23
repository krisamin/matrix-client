import { LogOut, UserCog } from "lucide-react";
import type { MatrixClient } from "matrix-js-sdk";
import { useState } from "react";
import { useI18n } from "../lib/i18n";
import {
  detectBrowserLocale,
  LOCALE_LABEL,
  type LocalePref,
  SUPPORTED_LOCALES,
} from "../lib/locale";
import { Field, FieldGroup, SectionHeader, Select } from "./Form";
import { Modal, ModalHeader } from "./Modal";
import { ProfileEditModal } from "./ProfileEditModal";

/** 앱 전역 설정 모달 — 공용 Modal/Form 컴포넌트 사용. */
export function AppSettingsModal({
  client,
  onClose,
  onLogout,
}: {
  client: MatrixClient;
  onClose: () => void;
  onLogout: () => void;
}) {
  const { t, pref, setPref } = useI18n();
  const [profileOpen, setProfileOpen] = useState(false);
  // "자동" 옵션 라벨에 현재 감지된 브라우저 언어 표시.
  const detected = detectBrowserLocale();

  return (
    <>
      <Modal onClose={onClose} size="md">
        <ModalHeader title={t("modal.appSettings.title")} />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <SectionHeader>{t("settings.section.general")}</SectionHeader>
          <FieldGroup>
            <Field label={t("settings.lang")}>
              <Select value={pref} onChange={(v) => setPref(v as LocalePref)}>
                <option value="auto">
                  {t("settings.lang.auto")} ({LOCALE_LABEL[detected]})
                </option>
                {SUPPORTED_LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {LOCALE_LABEL[l]}
                  </option>
                ))}
              </Select>
            </Field>
          </FieldGroup>

          <SectionHeader>{t("settings.section.account")}</SectionHeader>
          <FieldGroup>
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
          </FieldGroup>
        </div>

        {/* 단일 닫기 푸터 (취소/저장 패턴 아님) */}
        <div className="flex shrink-0 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 text-[13px] text-fg-2 hover:bg-bg-2 hover:text-fg-0"
          >
            {t("common.close")}
          </button>
        </div>
      </Modal>

      {profileOpen && (
        <ProfileEditModal
          client={client}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </>
  );
}
