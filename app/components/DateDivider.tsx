/** 날짜/구간 구분선 — 좌우 20px 거터에 맞춤 */
export function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4 px-5 py-2">
      <div className="h-px flex-1 bg-line" />
      <span className="font-mono text-[11px] text-fg-3">{label}</span>
      <div className="h-px flex-1 bg-line" />
    </div>
  );
}

/** 안읽음 경계선 — "여기부터 새 메시지" */
export function UnreadDivider() {
  return (
    <div className="flex items-center gap-4 px-5 py-2">
      <div className="h-px flex-1 bg-[#bf616a]/50" />
      <span className="font-mono text-[11px] font-semibold text-[#bf616a]">
        NEW
      </span>
      <div className="h-px flex-1 bg-[#bf616a]/50" />
    </div>
  );
}
