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

/** Field 내부 텍스트 인풋. prefix/suffix slot으로 # 같은 인라인 데코 가능.
 *
 *  Field row 패딩(py-2.5 pl-3 pr-5)은 *컨테이너*가 가지고 input 자체는
 *  unstyled — prefix/suffix와 input이 같은 inset 안에서 자연스럽게 흐름.
 *
 *  예: <TextInput prefix="#" suffix=":server.com" ... /> */
export function TextInput({
  value,
  onChange,
  placeholder,
  disabled,
  type = "text",
  ref,
  autoFocus,
  onKeyDown,
  prefix,
  suffix,
  align = "left",
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: "text" | "email" | "number";
  ref?: RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** 좌측 데코 (예: '#', 검색 아이콘). 텍스트면 fg-3 톤 */
  prefix?: ReactNode;
  /** 우측 데코 (예: ':server.com', 단위). 텍스트면 fg-3 톤 */
  suffix?: ReactNode;
  /** 텍스트 정렬 — 숫자 입력은 'right' */
  align?: "left" | "right";
  /** 명시적 input width (Tailwind 클래스, 예 'w-16'). 숫자 입력 등에 사용. */
  width?: string;
}) {
  // disabled일 때 컨테이너에도 opacity 적용 — prefix/suffix까지 흐려지도록
  const disabledCls = disabled ? "opacity-50" : "";
  // input padding: prefix/suffix와 붙은 쪽은 좁게(pl-1.5/pr-1.5), 없는 쪽은
  // 일반 인셋(pl-3/pr-5). 결과: input 자체가 row의 인풋 영역을 꽉 채워
  // input box 어디 클릭해도 포커스 (마로 요청 — 클릭영역이 input 자체).
  const inputPadX = `${prefix !== undefined ? "pl-1.5" : "pl-3"} ${suffix !== undefined ? "pr-1.5" : "pr-5"}`;
  const inputAlign = align === "right" ? "text-right font-mono" : "";
  return (
    <span className={`flex flex-1 items-stretch text-[13px] ${disabledCls}`}>
      {prefix !== undefined && (
        <span className="flex shrink-0 items-center py-2.5 pl-3 text-fg-3">
          {prefix}
        </span>
      )}
      <input
        ref={ref}
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        className={`min-w-0 ${width ?? "flex-1"} bg-transparent py-2.5 ${inputPadX} ${inputAlign} text-fg-0 outline-none placeholder:text-fg-3`}
      />
      {suffix !== undefined && (
        <span className="flex shrink-0 items-center truncate py-2.5 pr-5 text-[11px] text-fg-3">
          {suffix}
        </span>
      )}
    </span>
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

/** Field 내부 multiline textarea. */
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
 *  위/아래 모두 border를 가져서 SectionHeader 자체가 그룹 사이 경계 책임.
 *  → 호출부에서 SectionHeader가 연속으로 나오거나 FieldGroup 사이에 끼어도
 *    border 누락/이중 걱정 없음.
 *
 *  actions: 우측에 정사각(h-full) 액션 버튼을 둘 때 사용. 헤더 높이는 자동
 *  h-9로 늘어나서 버튼이 헤더 영역을 꽉 채움 (PaneHeader 컨벤션과 통일). */
export function SectionHeader({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex h-9 items-stretch border-y border-line bg-bg-2 text-[11px] font-semibold uppercase tracking-wider text-fg-1 first:border-t-0">
      <span className="flex flex-1 items-center pl-5">{children}</span>
      {actions && <div className="flex items-stretch">{actions}</div>}
    </div>
  );
}

/** divide-y 그리드 컨테이너 — Field들을 감싸 일관 라인 톤 유지. */
export function FieldGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-col divide-y divide-line">{children}</div>;
}
