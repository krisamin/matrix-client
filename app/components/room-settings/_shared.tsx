import { useT } from "../../lib/i18n";

export type Tab = "general" | "access" | "permissions" | "danger";

// 역할 ↔ PL 매핑 (Element 관례)
export const ROLE_LEVELS = { member: 0, mod: 50, admin: 100 } as const;
export function levelToRole(lvl: number): string {
  if (lvl >= 100) return "admin";
  if (lvl >= 50) return "mod";
  return "member";
}

/* ──────────── 공용 row 컴포넌트 ──────────── */

export function Row({
  label,
  children,
  description,
}: {
  label: string;
  children: React.ReactNode;
  description?: string;
}) {
  // 라벨/입력이 자체 padding으로 row를 꽉 채우는 패턴 (B-final).
  // children에 들어가는 input/select는 Form.tsx의 TextInput/Select처럼
  // 자체 'py-2.5 pl-3 pr-4'를 가져야 함.
  return (
    <label className="flex flex-col">
      <div className="flex items-stretch">
        <span className="flex w-24 shrink-0 items-center pl-4 text-[12px] text-fg-3">
          {label}
        </span>
        <div className="flex flex-1 items-stretch">{children}</div>
      </div>
      {description && (
        <span className="px-4 pb-2 pl-[6.5rem] text-[11px] text-fg-3">
          {description}
        </span>
      )}
    </label>
  );
}

export function Footer({
  busy,
  dirty,
  onCancel,
  onSave,
  saveLabel,
}: {
  busy: boolean;
  dirty: boolean;
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
}) {
  const t = useT();
  return (
    <div className="flex border-t border-line">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 border-r border-line py-2.5 text-[13px] text-fg-2 hover:bg-bg-2 hover:text-fg-0"
      >
        {t("common.cancel")}
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={busy || !dirty}
        className="flex-1 bg-bg-2 py-2.5 text-[13px] font-medium text-fg-0 hover:bg-bg-3 disabled:opacity-50"
      >
        {busy ? t("common.saving") : (saveLabel ?? t("common.save"))}
      </button>
    </div>
  );
}
