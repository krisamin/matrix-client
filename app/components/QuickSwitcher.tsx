import { Hash, MessageSquareText, Search } from "lucide-react";
import { KnownMembership, type MatrixClient, type Room } from "matrix-js-sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useT } from "../lib/i18n";
import { getDmUserId } from "../lib/matrix";
import { Avatar } from "./Avatar";

/** Quick switcher — Cmd/Ctrl+K로 열리는 전역 방 검색.
 *  방 이름/DM 상대/space 통합. 화살표로 탐색, Enter로 이동.
 *  Element / Slack / Discord 패턴. */
export function QuickSwitcher({
  client,
  onClose,
}: {
  client: MatrixClient;
  onClose: () => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 후보 방 목록: 참여중 방 전부, 최근 활동순. 쿼리 있으면 이름 contains 필터.
  const items = useMemo(() => {
    const rooms = client
      .getRooms()
      .filter((r) => r.getMyMembership() === KnownMembership.Join)
      .sort((a, b) => b.getLastActiveTimestamp() - a.getLastActiveTimestamp());
    const q = query.toLowerCase().trim();
    if (!q) return rooms.slice(0, 20);
    return rooms
      .filter((r) => {
        if (r.name?.toLowerCase().includes(q)) return true;
        // DM 상대 표시이름도 매칭
        const dmId = getDmUserId(client, r);
        if (dmId) {
          const m = r.getMember(dmId);
          if (m?.name?.toLowerCase().includes(q)) return true;
        }
        // canonical alias 매칭
        const alias = r.getCanonicalAlias();
        if (alias?.toLowerCase().includes(q)) return true;
        return false;
      })
      .slice(0, 30);
  }, [client, query]);

  // 쿼리 변경 시 첫 항목으로 reset
  useEffect(() => {
    setSelectedIdx(0);
  }, []);

  // 선택 항목이 보이도록 자동 스크롤
  useEffect(() => {
    const el = listRef.current?.querySelector(
      `[data-idx="${selectedIdx}"]`,
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  function open(room: Room) {
    navigate(`/room/${encodeURIComponent(room.roomId)}`);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = items[selectedIdx];
      if (r) open(r);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[15vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="msg-in flex w-[520px] max-w-full flex-col overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        {/* 검색 입력 */}
        <label className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-fg-3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t("switcher.placeholder")}
            className="flex-1 bg-transparent text-[14px] text-fg-0 outline-none placeholder:text-fg-3"
            autoFocus
          />
          <kbd className="hidden shrink-0 rounded border border-line bg-bg-2 px-1.5 py-0.5 text-[10px] text-fg-3 sm:inline">
            Esc
          </kbd>
        </label>

        {/* 결과 리스트 */}
        <div
          ref={listRef}
          className="flex max-h-[50vh] flex-col overflow-y-auto"
        >
          {items.length === 0 && (
            <p className="px-5 py-6 text-center text-[12px] text-fg-3">
              {t("switcher.noResults")}
            </p>
          )}
          {items.map((r, idx) => {
            const dmId = getDmUserId(client, r);
            const m = dmId ? r.getMember(dmId) : null;
            const name = m?.name ?? r.name ?? r.roomId;
            const avatarUrl = m?.getMxcAvatarUrl() ?? r.getMxcAvatarUrl();
            const isSelected = idx === selectedIdx;
            return (
              <button
                key={r.roomId}
                type="button"
                data-idx={idx}
                onClick={() => open(r)}
                onMouseEnter={() => setSelectedIdx(idx)}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] ${
                  isSelected ? "bg-bg-2 text-fg-0" : "text-fg-1"
                }`}
              >
                <Avatar
                  client={client}
                  mxcUrl={avatarUrl}
                  name={name}
                  shape={dmId ? "round" : "square"}
                  size={24}
                />
                <span className="min-w-0 flex-1 truncate">{name}</span>
                {dmId ? (
                  <MessageSquareText className="h-3.5 w-3.5 shrink-0 text-fg-3" />
                ) : (
                  <Hash className="h-3.5 w-3.5 shrink-0 text-fg-3" />
                )}
              </button>
            );
          })}
        </div>

        {/* 푸터 힌트 */}
        <div className="flex items-center gap-3 border-t border-line px-4 py-1.5 text-[10px] text-fg-3">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-line bg-bg-2 px-1 py-0.5">
              ↑↓
            </kbd>
            {t("switcher.hint.navigate")}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-line bg-bg-2 px-1 py-0.5">
              ↵
            </kbd>
            {t("switcher.hint.open")}
          </span>
        </div>
      </div>
    </div>
  );
}
