import type { MatrixClient } from "matrix-js-sdk";
import { useEffect, useState } from "react";
import { searchUserDirectory, type UserDirectoryResult } from "../lib/matrix";

/** 사용자 디렉토리 검색 훅 (디바운스 250ms).
 *  - term이 비면 결과를 비우고 검색하지 않음
 *  - exclude에 든 userId는 결과에서 제거 (이미 방 멤버/초대된 사람 등)
 *  - 호출부에서 직접 입력(@user:server) 처리는 별도로 (looksLikeUserId 참고) */
export function useUserSearch(
  client: MatrixClient,
  term: string,
  exclude: Set<string> = new Set(),
) {
  const [results, setResults] = useState<UserDirectoryResult[]>([]);
  const [searching, setSearching] = useState(false);

  // exclude는 Set 참조라 deps에 넣으면 매 렌더 재검색됨 → term/client만 추적.
  // 호출부에서 exclude가 바뀌면 어차피 다음 입력(term 변경) 때 반영됨.
  // biome-ignore lint/correctness/useExhaustiveDependencies: exclude는 의도적으로 제외
  useEffect(() => {
    const q = term.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = setTimeout(async () => {
      const res = await searchUserDirectory(client, q);
      setResults(res.filter((r) => !exclude.has(r.userId)));
      setSearching(false);
    }, 250);
    return () => clearTimeout(id);
  }, [term, client]);

  return { results, searching };
}

/** @user:server 형태의 완전한 MXID인지 (직접 입력 허용용) */
export function looksLikeUserId(s: string): boolean {
  return /^@[^:\s]+:[^:\s]+$/.test(s.trim());
}
