import { ClientEvent, type MatrixClient, SyncState } from "matrix-js-sdk";
import { useEffect, useState } from "react";

/** sync 상태 추적 훅 — 오프라인/재연결 배너용 */
export function useSyncState(client: MatrixClient | null): SyncState | null {
  const [state, setState] = useState<SyncState | null>(null);

  useEffect(() => {
    if (!client) return;
    setState(client.getSyncState());
    const onSync = (s: SyncState) => setState(s);
    client.on(ClientEvent.Sync, onSync);
    return () => {
      client.off(ClientEvent.Sync, onSync);
    };
  }, [client]);

  return state;
}

/** 연결 끊김/재연결 배너. 정상(Syncing/Prepared)일 땐 안 보임 */
export function ConnectionBanner({ client }: { client: MatrixClient | null }) {
  const state = useSyncState(client);
  const [reconnecting, setReconnecting] = useState(false);

  if (!client || state === null) return null;
  if (state === SyncState.Syncing || state === SyncState.Prepared) return null;

  const isError = state === SyncState.Error;
  const label = isError
    ? "연결 끊김 — 재연결 시도 중..."
    : state === SyncState.Reconnecting
      ? "재연결 중..."
      : state === SyncState.Catchup
        ? "밀린 메시지 동기화 중..."
        : "동기화 중...";

  return (
    <div
      className={`flex h-8 shrink-0 items-center justify-center gap-2 border-b border-line text-[12px] ${
        isError ? "bg-red-950/60 text-red-300" : "bg-bg-2 text-amber-300"
      }`}
    >
      <span className="animate-pulse">●</span>
      {label}
      {isError && (
        <button
          type="button"
          className="rounded bg-bg-3 px-2 py-0.5 font-medium text-fg-0 hover:bg-line-strong disabled:opacity-50"
          disabled={reconnecting}
          onClick={async () => {
            setReconnecting(true);
            try {
              // retryImmediately: 백오프 대기를 건너뛰고 즉시 재시도
              client.retryImmediately();
            } finally {
              setTimeout(() => setReconnecting(false), 2000);
            }
          }}
        >
          지금 재시도
        </button>
      )}
    </div>
  );
}
