/** 사이드바 트리에 스레드 목록을 미리 채우는 idle 백그라운드 페치.
 *
 *  배경: RoomNode는 active 방에서만 createThreadsTimelineSets()/fetchRoomThreads()를
 *  발사한다 — 방 100개가 동시 mount되면 서버 100req + 메인 스레드 폭주로 사이드바
 *  클릭 시 "응답없음"이 나오기 때문(RoomNode.tsx 주석 참고). 그 결과 마로가 본 결:
 *  "방에 들어갔다 나와야 사이드바에 스레드 목록이 뜬다".
 *
 *  해결: 페이지 로드 후 idle 시점에 동시 N개로 직렬 페치. 메인 스레드 안 막고,
 *  Element와 비슷한 결로 결국 다 채워진다. SDK는 이미 fetch된 방을 재호출해도
 *  무해(서버 RTT만 1회 더). 사용자가 방 진입하면 RoomNode가 그 방을 다시 fetch
 *  하지만 idle 큐가 먼저 끝났을 가능성이 높아 즉시 표시.
 */
import type { MatrixClient, Room } from "matrix-js-sdk";

/** 동시에 떠 있을 페치 개수. 너무 크면 모바일에서 메모리/네트워크 부담, 너무
 *  작으면 200방 채우는 데 시간 오래 걸림. 3이 경험적 균형(Element도 비슷). */
const CONCURRENCY = 3;

/** rIC 미지원(Safari) fallback — 50ms 후 실행. main thread 양보 효과는 약하지만
 *  setTimeout 자체가 task 분리라 깜빡임은 막아준다. */
const idle = (cb: () => void): void => {
  type WithRIC = Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void;
  };
  const w = window as WithRIC;
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(cb, { timeout: 2000 });
  } else {
    setTimeout(cb, 50);
  }
};

/** 한 방의 스레드 목록을 받아 timelineSet 채움. 실패는 조용히 삼킴(없는 방/권한 X). */
async function prefetchOne(room: Room): Promise<void> {
  try {
    // 이미 timelineSet이 있으면 createThreadsTimelineSets는 no-op (SDK 보장).
    await room.createThreadsTimelineSets();
    await room.fetchRoomThreads();
  } catch {
    // 무시 — RoomNode가 active 시 재시도하므로 손해 없음.
  }
}

/** prefetch 전체를 한 번만 발사하기 위한 lock — 사이드바가 리렌더돼도 중복 발사 X.
 *  client 인스턴스 키로 잡아서 로그아웃/재로그인엔 다시 발사된다. */
const launched = new WeakSet<MatrixClient>();

/** 사이드바 mount 시 한 번 호출. idle 시점에 N개씩 동시 페치를 진행, 다 끝나면 종료. */
export function prefetchRoomThreads(client: MatrixClient, rooms: Room[]): void {
  if (launched.has(client)) return;
  launched.add(client);

  idle(() => {
    // 활동 최신순 → 사용자가 곧 볼 가능성 큰 방부터 채움.
    const queue = [...rooms].sort(
      (a, b) =>
        (b.getLastActiveTimestamp() ?? 0) - (a.getLastActiveTimestamp() ?? 0),
    );

    let active = 0;
    const tick = (): void => {
      while (active < CONCURRENCY && queue.length > 0) {
        const room = queue.shift();
        if (!room) break;
        active++;
        prefetchOne(room).finally(() => {
          active--;
          // 큐 진행: 다음 방을 idle에 양보하면서 발사 (rIC가 busy면 50ms 뒤).
          if (queue.length > 0) idle(tick);
        });
      }
    };
    tick();
  });
}
