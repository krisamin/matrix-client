/** 방 목록 정렬 옵션 — localStorage에 저장.
 *  같은 탭에서 변경은 setSort로 직접 호출, 다른 탭 동기화는 'storage'
 *  이벤트(브라우저 native, 다른 탭에서만 발화)로. 같은 탭 내 dispatchEvent는
 *  freeze 의심으로 제거. */
import type { MatrixClient, Room } from "matrix-js-sdk";
import { NotificationCountType } from "matrix-js-sdk";
import { isFavourite } from "./matrix";
import { ls } from "./storage";

export type RoomSort = "activity" | "unread" | "alpha";

const _KEY = "matrix-client:room-sort";

export function loadRoomSort(): RoomSort {
  if (typeof window === "undefined") return "activity";
  const v = ls.get("room-sort");
  return v === "unread" || v === "alpha" ? v : "activity";
}

export function saveRoomSort(s: RoomSort): void {
  if (typeof window === "undefined") return;
  ls.set("room-sort", s);
}

/** 정렬. 즐겨찾기는 항상 위. */
export function sortRooms(
  _client: MatrixClient,
  rooms: Room[],
  sort: RoomSort,
): Room[] {
  const arr = [...rooms];
  arr.sort((a, b) => {
    const fa = isFavourite(a) ? 1 : 0;
    const fb = isFavourite(b) ? 1 : 0;
    if (fa !== fb) return fb - fa;
    if (sort === "alpha") return (a.name ?? "").localeCompare(b.name ?? "");
    if (sort === "unread") {
      const ua = a.getUnreadNotificationCount(NotificationCountType.Total) ?? 0;
      const ub = b.getUnreadNotificationCount(NotificationCountType.Total) ?? 0;
      if (ua !== ub) return ub - ua;
      return b.getLastActiveTimestamp() - a.getLastActiveTimestamp();
    }
    return b.getLastActiveTimestamp() - a.getLastActiveTimestamp();
  });
  return arr;
}
