import type { ReactNode } from "react";

/** 폼 하단 에러 텍스트 — 모달/카드의 form row와 같은 px-4 py-2.5 inset.
 *  children이 falsy면 아무 것도 렌더하지 않아 호출부의 `{error && ...}`
 *  분기를 생략 가능. 다만 일부 호출부는 상위 컨테이너(예: border-t row)에
 *  같이 끼우는 경우가 있어 그쪽은 기존 분기를 유지. */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="px-4 py-2.5 text-[12px] text-red-400">{children}</p>;
}
