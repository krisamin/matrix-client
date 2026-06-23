import { ClientEvent, type MatrixClient, SyncState } from "matrix-js-sdk";
import { Loader2, RefreshCw, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { Toast } from "./Toast";

/** sync 상태 추적 훅 — 오프라인/재연결 토스트용. */
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

/** 연결 상태 토스트 — 정상(Syncing/Prepared)일 땐 안 뜸.
 *  ToastStack 안에서 자동으로 좌하단에 쌓임. */
export function ConnectionToast({ client }: { client: MatrixClient | null }) {
  const t = useT();
  const state = useSyncState(client);
  const [reconnecting, setReconnecting] = useState(false);

  if (!client || state === null) return null;
  if (state === SyncState.Syncing || state === SyncState.Prepared) return null;

  const isError = state === SyncState.Error;
  const variant = isError ? "error" : "warn";
  const title = isError
    ? t("connection.disconnected")
    : state === SyncState.Reconnecting
      ? t("connection.reconnecting")
      : state === SyncState.Catchup
        ? t("connection.catchingUp")
        : t("connection.syncing");

  const icon = isError ? (
    <WifiOff className="h-3.5 w-3.5" />
  ) : (
    <Loader2 className="h-3.5 w-3.5 animate-spin" />
  );

  return (
    <Toast
      icon={icon}
      title={title}
      variant={variant}
      action={
        isError
          ? {
              label: (
                <span className="flex items-center justify-center gap-1.5">
                  <RefreshCw
                    className={`h-3 w-3 ${reconnecting ? "animate-spin" : ""}`}
                  />
                  {t("connection.retryNow")}
                </span>
              ),
              onClick: async () => {
                if (reconnecting) return;
                setReconnecting(true);
                try {
                  client.retryImmediately();
                } finally {
                  setTimeout(() => setReconnecting(false), 2000);
                }
              },
            }
          : undefined
      }
    />
  );
}
