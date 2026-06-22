import type { MatrixClient } from "matrix-js-sdk";
import { useEffect, useState } from "react";
import { Link, Outlet, useNavigate, useOutletContext } from "react-router";
import { ConnectionBanner } from "../components/ConnectionBanner";
import { Lightbox } from "../components/Lightbox";
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

  // 네이티브 우클릭 메뉴 차단 — 단, 텍스트 선택이 가능한 영역(메시지 본문/
  // 코드블록/입력폼/.selectable로 마킹된 영역)에선 native 메뉴를 살려
  // 마로가 텍스트 복사·붙여넣기를 할 수 있게 한다. RoomNode 같은 자체 우클릭
  // 메뉴 컴포넌트는 React onContextMenu에서 e.preventDefault를 이미 호출하므로,
  // defaultPrevented가 true면 그대로 통과시킨다 (이중 prevent 무해).
  useEffect(() => {
    function isAllowedTarget(el: Element | null): boolean {
      if (!el) return false;
      // closest로 가장 가까운 허용 마커 검색
      return !!el.closest(
        ".message-body, .reply-quote, pre, code, input, textarea, [contenteditable='true'], .selectable",
      );
    }
    function onContextMenu(e: MouseEvent) {
      // 컴포넌트가 이미 처리(자체 메뉴 띄움)했으면 그대로
      if (e.defaultPrevented) return;
      if (isAllowedTarget(e.target as Element)) return;
      e.preventDefault();
    }
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, []);

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
      <Lightbox />
    </div>
  );
}
