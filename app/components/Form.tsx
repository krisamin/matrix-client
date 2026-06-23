import type { ReactNode, RefObject } from "react";

/** 모달의 폼 row — 라벨/입력이 자체 padding으로 row 영역을 꽉 채워
 *  row 어디 클릭해도 입력 포커스 (B-final 톤).
 *
 *  사용:
 *    <Field label="Name">
 *      <TextInput value={name} onChange={setName} />
 *    </Field>
 *
 *  Field가 <label>로 감싸므로 자식 input/select가 자동으로 라벨과 연결됨.
 *  label이 ReactNode라 i18n t() 결과 그대로 전달 가능.
 */
export function Field({
  label,
  children,
  description,
  labelWidth = "w-24",
}: {
  label: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  /** 라벨 컬럼 폭 (Tailwind 클래스). 기본 w-24(96px). */
  labelWidth?: string;
}) {
  return (
    <label className="flex flex-col">
      <div className="flex items-stretch">
        <span
          className={`flex ${labelWidth} shrink-0 items-center pl-5 text-[12px] text-fg-3`}
        >
          {label}
        </span>
        <div className="flex flex-1 items-stretch">{children}</div>
      </div>
      {description && (
        <span className="px-5 pb-2 pl-[6.75rem] text-[11px] text-fg-3">
          {description}
        </span>
      )}
    </label>
  );
}

/** Field 내부에 들어가는 텍스트 인풋 — 자체 padding으로 row 꽉 채움. */
export function TextInput({
  value,
  onChange,
  placeholder,
  disabled,
  type = "text",
  ref,
  autoFocus,
  onKeyDown,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: "text" | "email";
  ref?: RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <input
      ref={ref}
      type={type}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      onKeyDown={onKeyDown}
      autoFocus={autoFocus}
      className="flex-1 bg-transparent py-2.5 pl-3 pr-5 text-[13px] text-fg-0 outline-none placeholder:text-fg-3 disabled:opacity-50"
    />
  );
}

/** Field 내부에 들어가는 select — 자체 padding으로 row 꽉 채움. */
export function Select({
  value,
  onChange,
  disabled,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 bg-transparent py-2.5 pl-3 pr-5 text-[13px] text-fg-0 outline-none disabled:opacity-50"
    >
      {children}
    </select>
  );
}

/** Field 내부 다른 변종 textarea (멀티라인). */
export function TextArea({
  value,
  onChange,
  placeholder,
  disabled,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="flex-1 resize-none bg-transparent py-2.5 pl-3 pr-5 text-[13px] text-fg-0 outline-none placeholder:text-fg-3 disabled:opacity-50"
    />
  );
}

/** 섹션 헤더 (Form 안에서 그룹 구분).
 *  AppSettingsModal의 'General'/'Account' 같은 톤. */
export function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="border-b border-line bg-bg-2/30 px-5 py-2 text-[11px] font-medium text-fg-3">
      {children}
    </div>
  );
}

/** divide-y 그리드 컨테이너 — Field들을 감싸 일관 라인 톤 유지. */
export function FieldGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-col divide-y divide-line">{children}</div>;
}
