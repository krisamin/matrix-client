import type { MatrixClient } from "matrix-js-sdk";
import { useEffect, useState } from "react";
import { Link, Outlet, useNavigate, useOutletContext } from "react-router";
import { ConnectionBanner } from "../components/ConnectionBanner";
import { Sidebar } from "../components/Sidebar";
import { ensureStarted, getReadyClient } from "../lib/matrix";
import {
  attachNotifications,
  notificationPermission,
  requestNotificationPermission,
} from "../lib/notifications";

export interface AppContext {
  client: MatrixClient;
}

/** 자식 라우트에서 MatrixClient 접근용 */
export function useAppContext(): AppContext {
  return useOutletContext<AppContext>();
}

/** 인증된 앱 셸 — 클라이언트 부트스트랩 + 사이드바(트리) + 메인 Outlet.
 *  세션 없으면 /login으로. 클라이언트는 여기서 한 번만 준비하고
 *  자식 라우트(home/room/thread)는 context로 받아 씀. */
export default function AppLayout() {
  const navigate = useNavigate();
  const [client, setClient] = useState<MatrixClient | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [notifPerm, setNotifPerm] = useState(notificationPermission());

  useEffect(() => {
    const promise = getReadyClient();
    if (!promise) {
      navigate("/login", { replace: true });
      return;
    }
    promise.then((cl) => {
      setClient(cl);
      ensureStarted(cl);
      attachNotifications(cl);
      cl.getCrypto()
        ?.getDeviceVerificationStatus(cl.getUserId()!, cl.getDeviceId()!)
        .then((s) => setVerified(s?.crossSigningVerified ?? false));
    });
  }, [navigate]);

  if (!client) {
    return (
      <div className="flex h-screen items-center justify-center">
        <span className="animate-pulse font-mono text-[12px] text-fg-3">
          loading…
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar client={client} />
      <main className="flex min-w-0 flex-1 flex-col">
        <ConnectionBanner client={client} />
        {verified === false && (
          <div className="flex h-8 shrink-0 items-center justify-center gap-2 border-b border-line bg-bg-2 text-[12px] text-fg-1">
            이 기기가 아직 인증되지 않았습니다. 암호화된 메시지를 읽으려면 기기
            인증이 필요합니다.
            <Link to="/verify" className="font-medium text-fg-0 underline">
              기기 인증
            </Link>
          </div>
        )}
        {notifPerm === "default" && (
          <div className="flex h-8 shrink-0 items-center justify-center gap-2 border-b border-line bg-bg-2 text-[12px] text-fg-1">
            데스크톱 알림이 꺼져 있습니다.
            <button
              type="button"
              className="font-medium text-fg-0 underline"
              onClick={async () => {
                await requestNotificationPermission();
                setNotifPerm(notificationPermission());
              }}
            >
              알림 켜기
            </button>
          </div>
        )}
        <Outlet context={{ client } satisfies AppContext} />
      </main>
    </div>
  );
}
