import { ls } from "./storage";

/** 마지막으로 보던 라우트 저장/복원.
 *
 *  모바일 PWA는 홈으로 나가면 OS가 수시로 탭을 discard하는데, 아이콘으로
 *  다시 실행하면 start_url("/")로 떨어져 보던 방이 날아간다. 라우트 이동마다
 *  현재 경로를 저장해 두고, cold start 시 "/"로 진입했으면 마지막 방으로
 *  복귀시킨다 (Slack/Discord 결). 딥링크(/room/... 직접 진입)는 존중. */

const KEY = "last-route";

export function saveLastRoute(path: string): void {
  ls.set(KEY, path);
}

/** 복원 가치가 있는 경로(방/스레드)만 반환. 홈("/")이었으면 null. */
export function loadLastRoute(): string | null {
  const saved = ls.get(KEY);
  if (!saved?.startsWith("/room/")) return null;
  return saved;
}
