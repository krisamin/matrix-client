import { Bell, KeyRound } from "lucide-react";
import type { MatrixClient } from "matrix-js-sdk";
import { useEffect, useState } from "react";
import { Link, Outlet, useNavigate, useOutletContext } from "react-router";
import { ConnectionToast } from "../components/ConnectionBanner";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { Lightbox } from "../components/Lightbox";
import { QuickSwitcher } from "../components/QuickSwitcher";
import { ShortcutsModal } from "../components/ShortcutsModal";
import { Sidebar } from "../components/Sidebar";
import { Toast, ToastStack } from "../components/Toast";
import { useT } from "../lib/i18n";
import { ensureStarted, getReadyClient } from "../lib/matrix";
import {
  attachNotifications,
  notificationPermission,
  requestNotificationPermission,
} from "../lib/notifications";

const VERIFY_DISMISS_KEY = "matrix-client:verify-toast-dismissed";
const NOTIF_DISMISS_KEY = "matrix-client:notif-toast-dismissed";

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
  const t = useT();
  const navigate = useNavigate();
  const [client, setClient] = useState<MatrixClient | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [notifPerm, setNotifPerm] = useState(notificationPermission());
  const [verifyDismissed, setVerifyDismissed] = useState(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem(VERIFY_DISMISS_KEY) === "1",
  );
  const [notifDismissed, setNotifDismissed] = useState(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem(NOTIF_DISMISS_KEY) === "1",
  );
  // 전역 키보드 단축키: Ctrl/Cmd+K (방 빠른 전환), ? 또는 Ctrl+/ (단축키 안내)
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      // Cmd/Ctrl+K — 입력 중이어도 열림
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSwitcherOpen(true);
        return;
      }
      // Ctrl+/ — 단축키 안내
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      // ? — 입력 중이 아닐 때만
      if (e.key === "?" && !inEditable) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      <ErrorBoundary label="사이드바" size="pane">
        <Sidebar client={client} />
      </ErrorBoundary>
      <main className="flex min-w-0 flex-1 flex-col">
        <ErrorBoundary label="메시지 영역" size="pane">
          <Outlet context={{ client } satisfies AppContext} />
        </ErrorBoundary>
      </main>
      <Lightbox />
      <ToastStack>
        <ConnectionToast client={client} />
        {verified === false && !verifyDismissed && (
          <Toast
            icon={<KeyRound className="h-3.5 w-3.5" />}
            title={t("verify.toast.title")}
            body={t("verify.toast.body")}
            action={{
              label: (
                <Link to="/verify" className="block">
                  {t("verify.action")}
                </Link>
              ),
              onClick: () => navigate("/verify"),
            }}
            onDismiss={() => {
              localStorage.setItem(VERIFY_DISMISS_KEY, "1");
              setVerifyDismissed(true);
            }}
          />
        )}
        {notifPerm === "default" && !notifDismissed && (
          <Toast
            icon={<Bell className="h-3.5 w-3.5" />}
            title={t("notif.toast.title")}
            body={t("notif.toast.body")}
            action={{
              label: t("notif.action"),
              onClick: async () => {
                await requestNotificationPermission();
                setNotifPerm(notificationPermission());
              },
            }}
            onDismiss={() => {
              localStorage.setItem(NOTIF_DISMISS_KEY, "1");
              setNotifDismissed(true);
            }}
          />
        )}
      </ToastStack>
      {switcherOpen && (
        <QuickSwitcher client={client} onClose={() => setSwitcherOpen(false)} />
      )}
      {shortcutsOpen && (
        <ShortcutsModal onClose={() => setShortcutsOpen(false)} />
      )}
    </div>
  );
}
