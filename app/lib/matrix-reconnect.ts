import { ClientEvent, type MatrixClient, SyncState } from "matrix-js-sdk";

/** 자동 재연결 — sync가 Error에 갇혔을 때 복구 트리거를 건다.
 *  matrix-js-sdk는 자체 백오프 재시도를 하지만, 모바일/PWA에서 화면이 꺼졌다
 *  돌아오거나 네트워크가 끊겼다 복구될 때 진행 중이던 /sync long-poll이 죽은 채
 *  Error에 머물러 "새로고침해야만 복구"되는 현상이 생긴다. 그래서:
 *   - online (네트워크 복구)
 *   - visibilitychange / focus (탭·앱 복귀)
 *  시점에 sync 상태가 Error면 retryImmediately()로 즉시 재시도시킨다.
 *  client당 1회만 등록(중복 리스너 방지). */
const _autoReconnectAttached = new WeakSet<MatrixClient>();

export function attachAutoReconnect(client: MatrixClient): void {
  if (typeof window === "undefined") return;
  if (_autoReconnectAttached.has(client)) return;
  _autoReconnectAttached.add(client);

  const kick = () => {
    // 클라이언트가 멈춰있으면(로그아웃 등) 아무것도 안 함
    if (!client.clientRunning) return;
    const state = client.getSyncState();
    // Error(끊김) 상태이거나, 네트워크는 살아있는데 sync가 멈춘 경우 즉시 재시도.
    // Syncing/Prepared(정상)면 호출해도 무해하지만 불필요하므로 건너뜀.
    if (state === SyncState.Error || state === null) {
      try {
        client.retryImmediately();
      } catch {
        /* 재시도 자체 실패는 다음 트리거에서 다시 시도 */
      }
    }
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") kick();
  };

  window.addEventListener("online", kick);
  window.addEventListener("focus", kick);
  document.addEventListener("visibilitychange", onVisible);

  // sync가 Error로 떨어졌고 네트워크가 살아있으면, SDK 백오프를 기다리지 않고
  // 짧게 자체 재촉(한 번)을 건다. 반복 폭주 방지를 위해 Error 진입 시 1회만.
  let nudged = false;
  client.on(ClientEvent.Sync, (state: SyncState) => {
    if (state === SyncState.Error) {
      if (!nudged && navigator.onLine) {
        nudged = true;
        setTimeout(kick, 3000);
      }
    } else {
      nudged = false;
    }
  });
}
