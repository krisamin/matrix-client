import { ChevronDown, ChevronRight } from "lucide-react";
import type {
  HistoryVisibility,
  JoinRule,
  MatrixClient,
  Visibility,
} from "matrix-js-sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { createSpace, getJoinedSpaces } from "../lib/matrix";

/** 새 Space 만들기 모달 (B-final 톤 + 고급 옵션). */
export function NewSpaceModal({
  client,
  onClose,
  onCreated,
  defaultSpaceId,
}: {
  client: MatrixClient;
  onClose: () => void;
  onCreated: (spaceId: string) => void;
  defaultSpaceId?: string;
}) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [parentSpaceId, setParentSpaceId] = useState(defaultSpaceId ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>(
    "private" as Visibility,
  );
  const [aliasLocalpart, setAliasLocalpart] = useState("");
  const [joinRule, setJoinRule] = useState<JoinRule | "">("");
  const [historyVisibility, setHistoryVisibility] = useState<
    HistoryVisibility | ""
  >("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const spaces = useMemo(() => getJoinedSpaces(client), [client]);
  const myDomain = (client.getUserId() ?? "").split(":")[1] ?? "";
  const aliasPreview = aliasLocalpart.trim()
    ? `#${aliasLocalpart.trim()}:${myDomain}`
    : "";

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const aliasInvalid =
    aliasLocalpart.trim().length > 0 &&
    !/^[a-zA-Z0-9._-]+$/.test(aliasLocalpart.trim());

  async function create() {
    if (busy || !name.trim() || aliasInvalid) return;
    setBusy(true);
    setError(null);
    try {
      const spaceId = await createSpace(client, {
        name,
        topic,
        parentSpaceId: parentSpaceId || undefined,
        visibility: visibility || undefined,
        aliasLocalpart: aliasLocalpart.trim() || undefined,
        joinRule: (joinRule as JoinRule) || undefined,
        historyVisibility:
          (historyVisibility as HistoryVisibility) || undefined,
      });
      onCreated(spaceId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[15vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[80vh] w-[460px] max-w-[90vw] overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <header className="flex h-12 items-center border-b border-line px-5">
          <h2 className="font-semibold text-fg-0">새 Space 만들기</h2>
        </header>
        <p className="border-b border-line bg-bg-2/40 px-5 py-2 text-[12px] text-fg-3">
          Space는 방을 묶는 폴더예요. 메시지는 주고받지 않아요.
        </p>
        <div className="max-h-[calc(80vh-9rem)] overflow-y-auto">
          <div className="flex flex-col divide-y divide-line">
            <label className="flex items-center gap-3 px-5 py-2.5">
              <span className="w-24 shrink-0 text-[12px] text-fg-3">이름</span>
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") create();
                }}
                placeholder="예: 업무"
                className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none placeholder:text-fg-3"
              />
            </label>
            <label className="flex items-center gap-3 px-5 py-2.5">
              <span className="w-24 shrink-0 text-[12px] text-fg-3">설명</span>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") create();
                }}
                placeholder="Space 설명 (선택)"
                className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none placeholder:text-fg-3"
              />
            </label>
            {spaces.length > 0 && (
              <label className="flex items-center gap-3 px-5 py-2.5">
                <span className="w-24 shrink-0 text-[12px] text-fg-3">
                  상위 Space
                </span>
                <select
                  value={parentSpaceId}
                  onChange={(e) => setParentSpaceId(e.target.value)}
                  className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none"
                >
                  <option value="">없음 (최상위 Space)</option>
                  {spaces.map((s) => (
                    <option key={s.roomId} value={s.roomId}>
                      {s.name || s.roomId}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex items-center gap-1.5 bg-bg-2/40 px-5 py-2 text-left text-[12px] font-medium text-fg-2 hover:bg-bg-2 hover:text-fg-0"
            >
              {advancedOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              고급 설정
            </button>

            {advancedOpen && (
              <>
                <label className="flex items-center gap-3 px-5 py-2.5">
                  <span className="w-24 shrink-0 text-[12px] text-fg-3">
                    디렉토리
                  </span>
                  <select
                    value={visibility}
                    onChange={(e) =>
                      setVisibility(e.target.value as Visibility)
                    }
                    className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none"
                  >
                    <option value="private">비공개</option>
                    <option value="public">공개 (목록에 노출)</option>
                  </select>
                </label>
                <label className="flex items-center gap-3 px-5 py-2.5">
                  <span className="w-24 shrink-0 text-[12px] text-fg-3">
                    별칭
                  </span>
                  <div className="flex flex-1 items-center gap-1">
                    <span className="text-[13px] text-fg-3">#</span>
                    <input
                      type="text"
                      value={aliasLocalpart}
                      onChange={(e) => setAliasLocalpart(e.target.value)}
                      placeholder="work-space (선택)"
                      className="min-w-0 flex-1 bg-transparent text-[13px] text-fg-0 outline-none placeholder:text-fg-3"
                    />
                    {aliasPreview && (
                      <span className="truncate text-[11px] text-fg-3">
                        :{myDomain}
                      </span>
                    )}
                  </div>
                </label>
                {aliasInvalid && (
                  <p className="px-5 py-1.5 text-[11px] text-red-400">
                    영문/숫자/_-. 만 사용 가능
                  </p>
                )}
                <label className="flex items-center gap-3 px-5 py-2.5">
                  <span className="w-24 shrink-0 text-[12px] text-fg-3">
                    가입 방식
                  </span>
                  <select
                    value={joinRule}
                    onChange={(e) => setJoinRule(e.target.value as JoinRule)}
                    className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none"
                  >
                    <option value="">기본 (초대받은 사람만)</option>
                    <option value="invite">초대받은 사람만</option>
                    <option value="public">누구나</option>
                    <option value="knock">노크 후 승인</option>
                  </select>
                </label>
                <label className="flex items-center gap-3 px-5 py-2.5">
                  <span className="w-24 shrink-0 text-[12px] text-fg-3">
                    이전 정보
                  </span>
                  <select
                    value={historyVisibility}
                    onChange={(e) =>
                      setHistoryVisibility(e.target.value as HistoryVisibility)
                    }
                    className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none"
                  >
                    <option value="">기본</option>
                    <option value="invited">초대받은 시점부터</option>
                    <option value="joined">참여한 시점부터</option>
                    <option value="shared">공유 시점부터</option>
                    <option value="world_readable">누구나</option>
                  </select>
                </label>
              </>
            )}

            {error && (
              <p className="px-5 py-2.5 text-[12px] text-red-400">{error}</p>
            )}
          </div>
        </div>
        <div className="flex border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border-r border-line py-2.5 text-[13px] text-fg-2 hover:bg-bg-2 hover:text-fg-0"
          >
            취소
          </button>
          <button
            type="button"
            onClick={create}
            disabled={busy || !name.trim() || aliasInvalid}
            className="flex-1 bg-bg-2 py-2.5 text-[13px] font-medium text-fg-0 hover:bg-bg-3 disabled:opacity-50"
          >
            {busy ? "만드는 중…" : "만들기"}
          </button>
        </div>
      </div>
    </div>
  );
}
