import {
  ClientEvent,
  type MatrixClient,
  NotificationCountType,
  RoomEvent,
  SyncState,
} from "matrix-js-sdk";
import { useEffect, useRef } from "react";

/** 전체 방 누적 안 읽음 / highlight 카운트 합산 → favicon badge + document.title.
 *  app-layout에서 client가 ready 된 후에 호출.
 *
 *  성능: useRooms를 거치면 매 timeline/receipt/decrypted 이벤트마다 rooms
 *  배열 ref가 바뀌어 effect가 매번 발화 → 큰 방에서 메시지 폭주 시 메인
 *  스레드 응답없음 유발. 여기선 client 이벤트를 직접 구독하고 rAF로
 *  배칭(연속 이벤트는 1프레임에 1회만 sum + 갱신). */
export function useUnreadBadge(client: MatrixClient): void {
  const baseTitleRef = useRef<string>("");
  // 첫 마운트에 원래 title 캡처
  // biome-ignore lint/correctness/useExhaustiveDependencies: 빈 deps 의도 (mount 1회)
  useEffect(() => {
    if (!baseTitleRef.current) {
      baseTitleRef.current = document.title.replace(/^\(\d+\)\s*/, "");
    }
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: client만 deps. recompute/schedule는 effect 내부 클로저.
  useEffect(() => {
    let scheduled = false;
    let lastRun = 0;
    const recompute = () => {
      scheduled = false;
      lastRun = Date.now();
      let total = 0;
      let highlight = 0;
      for (const r of client.getRooms()) {
        total += r.getUnreadNotificationCount(NotificationCountType.Total) ?? 0;
        highlight +=
          r.getUnreadNotificationCount(NotificationCountType.Highlight) ?? 0;
      }
      const base = baseTitleRef.current || "matrix-client";
      const next = total > 0 ? `(${total}) ${base}` : base;
      if (document.title !== next) document.title = next;
      updateFavicon(total, highlight);
    };
    // throttle: 1초당 최대 1회. 큰 방에서 decrypted 폭주 시 rAF로 묶여도
    // 매 프레임 N개 방 × 2 unread API call이면 메인 스레드 점유 → 스크롤
    // 버벅임. 1초 간격이면 사용자 체감엔 충분히 즉각적.
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      const since = Date.now() - lastRun;
      const wait = Math.max(0, 1000 - since);
      setTimeout(recompute, wait);
    };

    // 첫 계산 (즉시)
    recompute();

    // sync prepared 시점에만 즉시, 그 외엔 throttle.
    // Timeline/Receipt/Decrypted는 폭주 가능 → throttle 필수.
    const onSync = (state: SyncState) => {
      if (state === SyncState.Prepared || state === SyncState.Syncing) {
        schedule();
      }
    };
    client.on(ClientEvent.Sync, onSync);
    client.on(RoomEvent.Timeline, schedule);
    client.on(RoomEvent.Receipt, schedule);
    // Decrypted는 paginate/scroll 시 메시지당 발화 → 가장 폭주.
    // 우리는 unread count만 필요해서 receipt 변화에 더 민감, decrypted는 스킵.
    return () => {
      client.off(ClientEvent.Sync, onSync);
      client.off(RoomEvent.Timeline, schedule);
      client.off(RoomEvent.Receipt, schedule);
    };
  }, [client]);
}

let lastBadge = -1;
function updateFavicon(total: number, highlight: number): void {
  if (typeof document === "undefined") return;
  if (lastBadge === total) return;
  lastBadge = total;

  const link =
    (document.querySelector("link[rel='icon']") as HTMLLinkElement | null) ??
    createIconLink();

  if (total === 0) {
    link.href = "/favicon.ico";
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#111113";
  ctx.beginPath();
  ctx.arc(32, 32, 32, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = highlight > 0 ? "#ef4444" : "#94a3b8";
  ctx.beginPath();
  ctx.arc(32, 32, 26, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 38px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const txt = total > 99 ? "99+" : String(total);
  if (txt.length >= 3)
    ctx.font = "bold 26px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(txt, 32, 35);

  link.href = canvas.toDataURL("image/png");
}

function createIconLink(): HTMLLinkElement {
  const link = document.createElement("link");
  link.rel = "icon";
  document.head.appendChild(link);
  return link;
}
