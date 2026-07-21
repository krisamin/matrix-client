import { Clock3, Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import emojiData from "unicode-emoji-json/data-by-group.json";
import type { DictKey } from "../i18n/ko";
import { useT } from "../lib/i18n";
import { AnchoredPopover } from "./AnchoredPopover";

/** 리액션/입력에서 공용으로 쓰는 빠른 후보 — 최근 사용 기록이 없을 때 폴백 */
const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "😮", "👀"];

interface EmojiEntry {
  emoji: string;
  name: string;
  slug: string;
}
interface EmojiGroup {
  name: string;
  slug: string;
  emojis: EmojiEntry[];
}

const GROUPS = emojiData as EmojiGroup[];

// 카테고리 탭/섹션 라벨 — i18n 키로 매핑 (emoji.cat.*)
const GROUP_META: Record<string, { labelKey: DictKey; icon: string }> = {
  smileys_emotion: { labelKey: "emoji.cat.smileys", icon: "😀" },
  people_body: { labelKey: "emoji.cat.people", icon: "👋" },
  animals_nature: { labelKey: "emoji.cat.animals", icon: "🐻" },
  food_drink: { labelKey: "emoji.cat.food", icon: "🍔" },
  travel_places: { labelKey: "emoji.cat.travel", icon: "✈️" },
  activities: { labelKey: "emoji.cat.activities", icon: "⚽" },
  objects: { labelKey: "emoji.cat.objects", icon: "💡" },
  symbols: { labelKey: "emoji.cat.symbols", icon: "🔣" },
  flags: { labelKey: "emoji.cat.flags", icon: "🚩" },
};

/* ── 최근 사용 (localStorage) ── */
const RECENT_KEY = "emoji-recent";

function loadRecents(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((e) => typeof e === "string") : [];
  } catch {
    return [];
  }
}

function saveRecent(emoji: string) {
  try {
    const next = [emoji, ...loadRecents().filter((e) => e !== emoji)].slice(
      0,
      24,
    );
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // storage 막힌 환경(시크릿 등)은 조용히 무시
  }
}

/* ── 팝오버 크기 ── */
const W = 320;
const H = 380;

/** 이모지 피커 팝오버 — 앵커(버튼 rect) 기준으로 뜨는 포털.
 *  배경 클릭/Esc 닫기, 검색, 카테고리 점프, 최근 사용.
 *  위 공간이 부족하면 자동으로 아래에 열리고 뷰포트 밖으로 안 나감 */
export function EmojiPicker({
  anchor,
  onPick,
  onClose,
}: {
  /** 트리거 버튼의 getBoundingClientRect() */
  anchor: DOMRect;
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  // 열려 있는 동안엔 고정 (픽 직후 목록이 출렁이지 않게)
  const [recents] = useState(loadRecents);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const out: EmojiEntry[] = [];
    for (const g of GROUPS) {
      for (const e of g.emojis) {
        if (e.name.includes(q) || e.slug.includes(q)) {
          out.push(e);
          if (out.length >= 160) return out;
        }
      }
    }
    return out;
  }, [query]);

  function pick(emoji: string) {
    saveRecent(emoji);
    onPick(emoji);
    onClose();
  }

  function jumpTo(slug: string) {
    setQuery("");
    requestAnimationFrame(() => {
      sectionRefs.current[slug]?.scrollIntoView({ block: "start" });
    });
  }

  const recentList = recents.length > 0 ? recents : QUICK_REACTIONS;

  const emojiBtn =
    // overflow-hidden: 미지원 ZWJ 조합이 글리프 여러 개로 깨져 셀보다 넓게
    // 렌더되는 경우 클립 (안 하면 스크롤 영역이 늘어나 가로 스크롤 생김)
    "flex h-8 items-center justify-center overflow-hidden rounded-md text-[18px] hover:bg-bg-2";

  return (
    <AnchoredPopover
      anchor={anchor}
      width={W}
      height={H}
      align="right"
      prefer="above"
      className="flex flex-col"
      onClose={onClose}
    >
      {/* 검색 */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <Search className="h-3.5 w-3.5 shrink-0 text-fg-3" />
        <input
          className="min-w-0 flex-1 bg-transparent text-[13px] text-fg-0 outline-none placeholder:text-fg-3"
          placeholder={t("emoji.search")}
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* 카테고리 탭 */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line px-2">
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-md text-fg-2 hover:bg-bg-2 hover:text-fg-0"
          title={t(recents.length > 0 ? "emoji.recent" : "emoji.favorites")}
          onClick={() => jumpTo("recent")}
        >
          <Clock3 className="h-3.5 w-3.5" />
        </button>
        {GROUPS.map((g) => (
          <button
            key={g.slug}
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[15px] grayscale hover:bg-bg-2 hover:grayscale-0"
            title={GROUP_META[g.slug] ? t(GROUP_META[g.slug].labelKey) : g.name}
            onClick={() => jumpTo(g.slug)}
          >
            {GROUP_META[g.slug]?.icon ?? g.emojis[0]?.emoji}
          </button>
        ))}
      </div>

      {/* 그리드 — 가로는 클립(overflow-y만 주면 x도 auto 승격돼 가로 스크롤 생김).
            좌우 여백은 padding 대신 scrollbar-gutter both-edges로:
            스크롤바(10px)가 오른쪽 패딩을 먹어 좌우가 비대칭해지는 문제 해결 */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2 [scrollbar-gutter:stable_both-edges]">
        {results ? (
          results.length === 0 ? (
            <p className="px-1 py-4 text-center text-[12px] text-fg-3">
              {t("emoji.empty")}
            </p>
          ) : (
            <div className="grid grid-cols-8 gap-0.5 pt-2">
              {results.map((e) => (
                <button
                  key={e.slug}
                  type="button"
                  className={emojiBtn}
                  title={e.name}
                  onClick={() => pick(e.emoji)}
                >
                  {e.emoji}
                </button>
              ))}
            </div>
          )
        ) : (
          <>
            <div
              ref={(el) => {
                sectionRefs.current.recent = el;
              }}
            >
              <p className="sticky top-0 bg-bg-1 px-1 pb-1 pt-2 text-[11px] font-medium text-fg-2">
                {t(recents.length > 0 ? "emoji.recent" : "emoji.favorites")}
              </p>
              <div className="grid grid-cols-8 gap-0.5">
                {recentList.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={emojiBtn}
                    onClick={() => pick(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            {GROUPS.map((g) => (
              <div
                key={g.slug}
                ref={(el) => {
                  sectionRefs.current[g.slug] = el;
                }}
              >
                <p className="sticky top-0 bg-bg-1 px-1 pb-1 pt-2 text-[11px] font-medium text-fg-2">
                  {GROUP_META[g.slug] ? t(GROUP_META[g.slug].labelKey) : g.name}
                </p>
                <div className="grid grid-cols-8 gap-0.5">
                  {g.emojis.map((e) => (
                    <button
                      key={e.slug}
                      type="button"
                      className={emojiBtn}
                      title={e.name}
                      onClick={() => pick(e.emoji)}
                    >
                      {e.emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </AnchoredPopover>
  );
}
