import { ChevronDown, History, Loader2, SearchX, X } from "lucide-react";
import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk";
import type { ISearchResults } from "matrix-js-sdk/lib/@types/search";
import { useMemo, useRef, useState } from "react";
import { PaneHeader, PaneHeaderButton } from "./PaneHeader";

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** 매치 주변만 잘라서 하이라이트된 스니펫 렌더 */
function Snippet({ body, query }: { body: string; query: string }) {
  const lower = body.toLowerCase();
  const q = query.toLowerCase();
  const at = lower.indexOf(q);
  // 매치 앞 30자부터 시작 (앞이 길면 … 붙임)
  const start = Math.max(0, at - 30);
  const text = (start > 0 ? "…" : "") + body.slice(start, start + 200);

  const parts: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest) {
    const i = rest.toLowerCase().indexOf(q);
    if (i < 0 || !q) {
      parts.push(rest);
      break;
    }
    parts.push(rest.slice(0, i));
    parts.push(
      <mark key={key++} className="rounded-sm bg-amber-400/25 text-fg-0">
        {rest.slice(i, i + q.length)}
      </mark>,
    );
    rest = rest.slice(i + q.length);
  }
  return <p className="line-clamp-3 text-[13px] text-fg-1">{parts}</p>;
}

function ResultRow({
  ev,
  query,
  onJump,
}: {
  ev: MatrixEvent;
  query: string;
  onJump: (eventId: string) => void;
}) {
  const body: string = ev.getContent().body ?? "";
  return (
    <button
      type="button"
      className="w-full rounded-lg px-3 py-2 text-left hover:bg-bg-2"
      onClick={() => onJump(ev.getId()!)}
    >
      <span className="flex items-baseline gap-2">
        <span className="min-w-0 truncate text-[13px] font-semibold text-fg-0">
          {ev.sender?.name ?? ev.getSender()}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-fg-3">
          {formatDateTime(ev.getTs())}
        </span>
      </span>
      <Snippet body={body} query={query} />
    </button>
  );
}

/** 이벤트가 검색 대상인지 (텍스트류 메시지 + body 보유 + 미삭제) */
function searchableBody(ev: MatrixEvent): string | null {
  if (ev.getType() !== "m.room.message" || ev.isRedacted()) return null;
  const body = ev.getContent().body;
  return typeof body === "string" && body ? body : null;
}

/** 메시지 검색 페인 (우측 분할) —
 *  평문 방: 서버 검색 API (전체 히스토리, 페이지네이션)
 *  E2EE 방: 서버가 내용을 못 읽으므로 로컬 검색 + 과거 백필 버튼
 *  스레드(scope="thread"): 서버 검색이 스레드 필터를 지원 안 함 → 항상 로컬 */
export function SearchPane({
  client,
  room,
  events,
  hasMore,
  loadOlder,
  onJump,
  onClose,
  scope = "room",
}: {
  client: MatrixClient;
  room: Room;
  /** 로드된 타임라인 (로컬 검색 대상) */
  events: MatrixEvent[];
  hasMore: boolean;
  loadOlder: () => Promise<boolean>;
  onJump: (eventId: string) => void;
  onClose: () => void;
  /** "thread"면 전달된 events에서만 로컬 검색 */
  scope?: "room" | "thread";
}) {
  const encrypted = room.hasEncryptionStateEvent();
  // 로컬 검색 모드: E2EE(서버가 암호문만 봄) 또는 스레드(서버 검색에 스레드 필터 없음)
  const localMode = encrypted || scope === "thread";
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  // 서버 검색 상태 (평문 방)
  const [serverHits, setServerHits] = useState<MatrixEvent[] | null>(null);
  const [serverCount, setServerCount] = useState(0);
  const serverResultsRef = useRef<ISearchResults | null>(null);
  const [searched, setSearched] = useState(""); // 마지막 실행된 검색어

  // 로컬 검색 — 타이핑 즉시, 로드된 이벤트에서
  const localHits = useMemo(() => {
    if (!localMode || !query.trim()) return [];
    const q = query.trim().toLowerCase();
    const out: MatrixEvent[] = [];
    for (let i = events.length - 1; i >= 0; i--) {
      const body = searchableBody(events[i]);
      if (body?.toLowerCase().includes(q)) out.push(events[i]);
      if (out.length >= 200) break;
    }
    return out;
  }, [localMode, query, events]);

  /** 평문 방: 서버 검색 실행 (Enter) */
  async function runServerSearch() {
    const term = query.trim();
    if (!term || busy) return;
    setBusy(true);
    try {
      const results = await client.searchRoomEvents({
        term,
        filter: { rooms: [room.roomId] },
      });
      serverResultsRef.current = results;
      setSearched(term);
      setServerCount(results.count ?? results.results.length);
      setServerHits(results.results.map((r) => r.context.getEvent()));
    } catch (e) {
      console.warn("서버 검색 실패:", e);
      setServerHits([]);
      setSearched(term);
      setServerCount(0);
    } finally {
      setBusy(false);
    }
  }

  /** 평문 방: 다음 페이지 */
  async function moreServer() {
    const results = serverResultsRef.current;
    if (!results?.next_batch || busy) return;
    setBusy(true);
    try {
      await client.backPaginateRoomEventsSearch(results);
      setServerHits(results.results.map((r) => r.context.getEvent()));
    } catch (e) {
      console.warn("검색 페이지네이션 실패:", e);
    } finally {
      setBusy(false);
    }
  }

  /** 로컬 모드: 과거를 더 불러와서 검색 범위 확장 (한 번에 최대 10페이지) */
  async function deepenLocal() {
    if (busy) return;
    setBusy(true);
    try {
      for (let i = 0; i < 10; i++) {
        if (!(await loadOlder())) break;
      }
    } finally {
      setBusy(false);
    }
  }

  const hits = localMode ? localHits : (serverHits ?? []);
  const showEmpty =
    !busy &&
    query.trim() !== "" &&
    hits.length === 0 &&
    (localMode || searched !== "");

  return (
    <section className="flex w-[360px] shrink-0 flex-col border-l border-line">
      <PaneHeader
        actions={
          <PaneHeaderButton title="닫기 (Esc)" onClick={onClose}>
            <X className="h-[15px] w-[15px]" />
          </PaneHeaderButton>
        }
      >
        <input
          className="min-w-0 flex-1 bg-transparent text-[13px] text-fg-0 outline-none placeholder:text-fg-3"
          placeholder={
            localMode ? "검색 (로드된 메시지에서)…" : "검색 (Enter)…"
          }
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !localMode) runServerSearch();
            if (e.key === "Escape") onClose();
          }}
        />
      </PaneHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {/* 결과 카운트 */}
        {!localMode && serverHits && (
          <p className="px-3 pb-1 pt-1 font-mono text-[11px] text-fg-3">
            “{searched}” — {serverCount}건
          </p>
        )}
        {localMode && query.trim() && (
          <p className="px-3 pb-1 pt-1 font-mono text-[11px] text-fg-3">
            로드된 {events.length}개 중 {localHits.length}건
            {localHits.length >= 200 && " (최대 200)"}
          </p>
        )}

        {hits.map((ev) => (
          <ResultRow
            key={ev.getId()}
            ev={ev}
            query={localMode ? query.trim() : searched}
            onJump={onJump}
          />
        ))}

        {showEmpty && (
          <div className="flex flex-col items-center gap-2 py-10 text-fg-3">
            <SearchX className="h-6 w-6" />
            <p className="text-[12px]">결과 없음</p>
          </div>
        )}

        {busy && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-fg-2" />
          </div>
        )}

        {/* 더 보기 — 서버: next_batch / E2EE: 과거 백필 */}
        {!busy && !localMode && serverResultsRef.current?.next_batch && (
          <button
            type="button"
            className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-[12px] text-fg-2 hover:bg-bg-2 hover:text-fg-0"
            onClick={moreServer}
          >
            <ChevronDown className="h-3.5 w-3.5" />
            결과 더 보기
          </button>
        )}
        {!busy && localMode && query.trim() && hasMore && (
          <button
            type="button"
            className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-[12px] text-fg-2 hover:bg-bg-2 hover:text-fg-0"
            onClick={deepenLocal}
          >
            <History className="h-3.5 w-3.5" />
            과거 더 불러와서 검색
          </button>
        )}

        {/* 로컬 모드 안내 (첫 진입) */}
        {localMode && !query.trim() && (
          <p className="px-3 py-4 text-[12px] leading-relaxed text-fg-3">
            {scope === "thread"
              ? "스레드 검색은 이 기기에 로드된 답글에서 찾아. 범위가 부족하면 아래 버튼으로 과거 답글을 더 불러올 수 있어."
              : "암호화 방은 서버가 내용을 읽을 수 없어 이 기기에 로드된 메시지에서 검색해. 범위가 부족하면 아래 버튼으로 과거를 더 불러올 수 있어."}
          </p>
        )}
      </div>
    </section>
  );
}
