import { Bell, KeyRound } from "lucide-react";
import type { MatrixClient } from "matrix-js-sdk";
import { useEffect, useRef, useState } from "react";
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useOutletContext,
} from "react-router";
import { ConnectionToast } from "../components/ConnectionBanner";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { InlineSpinner } from "../components/InlineSpinner";
import { Lightbox } from "../components/Lightbox";
import { QuickSwitcher } from "../components/QuickSwitcher";
import { ShortcutsModal } from "../components/ShortcutsModal";
import { Sidebar } from "../components/Sidebar";
import { Toast, ToastStack } from "../components/Toast";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { useUnreadBadge } from "../hooks/useUnreadBadge";
import { useT } from "../lib/i18n";
import { loadLastRoute, saveLastRoute } from "../lib/last-route";
import { attachLifecycleLogger } from "../lib/lifecycle-log";
import { ensureStarted, getReadyClient } from "../lib/matrix";
import {
  attachNotifications,
  notificationPermission,
  requestNotificationPermission,
} from "../lib/notifications";
import { ls } from "../lib/storage";

const _VERIFY_DISMISS_KEY = "matrix-client:verify-toast-dismissed";
const _NOTIF_DISMISS_KEY = "matrix-client:notif-toast-dismissed";

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
  // 모바일 가상 키보드 높이를 --keyboard-inset CSS 변수로 발행 → 아래 root
  // 컨테이너의 paddingBottom으로 들어가 키보드만큼 영역을 줄인다.
  // (iOS 16.4+ interactive-widget=resizes-content가 먹으면 inset이 거의 0)
  useKeyboardInset();
  // 모바일 단일 페인 스택 판정: 방/스레드 라우트면 메인을, 아니면 사이드바를
  // 풀폭으로. 데스크탑(md+)에선 둘 다 보여 기존 분할 레이아웃 유지.
  const location = useLocation();
  const inRoom = location.pathname.startsWith("/room/");

  // 라이프사이클 계측 — "저절로 새로고침" 원인 판별용 (설정 → 진단에서 열람).
  // 모듈 내부 가드로 1회만 부착되므로 매 렌더 호출해도 무해.
  useEffect(() => {
    attachLifecycleLogger();
  }, []);

  // 마지막 라우트 저장 + cold start 복원.
  // OS가 백그라운드 PWA를 discard하면 아이콘 재실행 시 start_url("/")로
  // 떨어져 보던 방이 날아감 → 저장해 둔 마지막 방으로 1회 복귀.
  // restoredRef로 세션당 1회만 — 사용자가 직접 홈("/")으로 가는 건 존중.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!restoredRef.current) {
      restoredRef.current = true;
      if (location.pathname === "/") {
        const last = loadLastRoute();
        if (last) {
          navigate(last, { replace: true });
          return;
        }
      }
    }
    saveLastRoute(location.pathname);
  }, [location.pathname, navigate]);

  const [client, setClient] = useState<MatrixClient | null>(null);
  // 부팅 실패 메시지 — crypto WASM 로드 실패/스토리지 오류 등. 기존엔 catch가
  // 없어 조용히 로딩 스피너에 영영 갇혔다(불안정 체감의 한 축).
  const [bootError, setBootError] = useState<string | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [notifPerm, setNotifPerm] = useState(notificationPermission());
  const [verifyDismissed, setVerifyDismissed] = useState(
    () =>
      typeof window !== "undefined" && ls.get("verify-toast-dismissed") === "1",
  );
  const [notifDismissed, setNotifDismissed] = useState(
    () =>
      typeof window !== "undefined" && ls.get("notif-toast-dismissed") === "1",
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
    promise
      .then((cl) => {
        setBootError(null);
        setClient(cl);
        ensureStarted(cl);
        attachNotifications(cl);
        cl.getCrypto()
          ?.getDeviceVerificationStatus(cl.getUserId()!, cl.getDeviceId()!)
          .then((s) => setVerified(s?.crossSigningVerified ?? false));
      })
      .catch((e) => {
        // getReadyClient가 실패 시 싱글턴을 비워두므로(재부팅 가능) 여기서
        // 재시도 UI만 보여주면 된다 — 새로고침 없이 복구 경로 제공.
        setBootError(e instanceof Error ? e.message : String(e));
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
    // 부팅 실패: 재시도 버튼 제공 (getReadyClient 싱글턴이 비워져 있어
    // 새로고침이 곧 재부팅 — SW 캐시로 오프라인에서도 셸은 뜬다).
    if (bootError) {
      return (
        <div className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-[14px] font-semibold text-fg-0">
            {t("error.boundary.plain")}
          </p>
          <p className="max-w-md break-words font-mono text-[11px] text-fg-3">
            {bootError}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-line bg-bg-2 px-3 py-1.5 text-[13px] text-fg-1 hover:bg-bg-3 hover:text-fg-0"
          >
            {t("error.boundary.retry")}
          </button>
        </div>
      );
    }
    return (
      <div className="flex h-dvh items-center justify-center">
        <span className="flex items-center gap-1.5 font-mono text-[12px] text-fg-3">
          <InlineSpinner size="sm" />
          {t("common.loading")}
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex h-dvh overflow-hidden"
      // 키보드가 차지한 만큼 아래쪽 영역을 비워 입력창이 키보드 위로 따라
      // 올라오게 한다. iOS 16.4+에선 자동 처리돼 변수가 0이라 영향 0.
      style={{ paddingBottom: "var(--keyboard-inset, 0px)" }}
    >
      <UnreadBadgeBinder client={client} />
      {/* 사이드바 — 데스크탑은 항상 w-64, 모바일은 home(`/`)에서만 풀폭으로 표시.
          방/스레드 라우트일 땐 모바일에선 숨겨 메인을 풀폭으로 (네이티브 앱 스택). */}
      <div
        className={`${inRoom ? "hidden md:flex" : "flex w-full"} md:w-64 shrink-0 flex-col border-r border-line bg-bg-1`}
      >
        <ErrorBoundary label={t("sidebar.label")} size="pane">
          <Sidebar client={client} />
        </ErrorBoundary>
      </div>
      {/* 메인 — 모바일에선 home에서 숨기고 방/스레드에서만 표시(사이드바와 교대). */}
      <main
        className={`${inRoom ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}
      >
        <ErrorBoundary label={t("main.label")} size="pane">
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
              ls.set("verify-toast-dismissed", "1");
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
              ls.set("notif-toast-dismissed", "1");
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

/** useUnreadBadge는 hook이라 client null 분기 시 hook 순서 깨짐 — client
 *  ready 후에만 mount되는 별도 컴포넌트로 격리. 시각 출력 없음. */
function UnreadBadgeBinder({ client }: { client: MatrixClient }) {
  useUnreadBadge(client);
  return null;
}
