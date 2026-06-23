import { Loader2 } from "lucide-react";
import {
  createClient,
  generateOidcAuthorizationUrl,
  type MatrixError,
  type OidcClientConfig,
  registerOidcClient,
} from "matrix-js-sdk";
import { useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { saveSession } from "../lib/session";

export function meta() {
  return [{ title: "Login — matrix-client" }];
}

/** 홈서버 디스커버리 결과. */
type AuthFlow =
  | { kind: "loading" }
  | {
      kind: "ready";
      /** 디스커버리에서 정규화된 실제 base URL (.well-known 따라간 결과). */
      baseUrl: string;
      /** OIDC 사용 가능하면 metadata, 아니면 null. */
      oidc: OidcClientConfig | null;
      /** 레거시 password flow 지원 여부. */
      password: boolean;
      /** 회원가입 가능 여부 (POST /register flows에서 추론). 모르면 null = "시도해보고 결정". */
      registration: boolean | null;
    }
  | { kind: "unsupported"; flows: string[] }
  | { kind: "error"; message: string };

type Mode = "signin" | "signup";

/** input "https://matrix.example.com" 또는 "matrix.example.com" 또는
 *  "@user:example.com" 모두 받아서 https URL로 정규화 + 가능하면
 *  .well-known/matrix/client 따라가서 진짜 base URL 반환. */
async function discoverHomeserver(input: string): Promise<string> {
  let raw = input.trim();
  if (raw.startsWith("@") && raw.includes(":")) {
    // "@user:server.com" → server.com
    raw = raw.split(":").slice(1).join(":");
  }
  const url = raw.match(/^https?:\/\//) ? raw : `https://${raw}`;
  const cleaned = url.replace(/\/+$/, "");
  // .well-known/matrix/client 시도. 200 OK + valid JSON이면 그쪽 base 사용.
  // 실패/없음/CORS면 입력값 그대로.
  try {
    const r = await fetch(`${cleaned}/.well-known/matrix/client`, {
      method: "GET",
    });
    if (!r.ok) return cleaned;
    const data = (await r.json()) as {
      "m.homeserver"?: { base_url?: string };
    };
    const base = data["m.homeserver"]?.base_url;
    if (typeof base === "string" && base.match(/^https?:\/\//)) {
      return base.replace(/\/+$/, "");
    }
  } catch {
    // ignore
  }
  return cleaned;
}

export default function Login() {
  const t = useT();
  const [homeserver, setHomeserver] = useState(
    typeof window !== "undefined"
      ? (localStorage.getItem("matrix-client:last-homeserver") ??
          "https://matrix.org")
      : "https://matrix.org",
  );
  const [mode, setMode] = useState<Mode>("signin");
  const [flow, setFlow] = useState<AuthFlow>({ kind: "loading" });
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // homeserver가 바뀌면 capability 재조회 (디바운스)
  useEffect(() => {
    if (!homeserver.trim()) {
      setFlow({ kind: "loading" });
      return;
    }
    setFlow({ kind: "loading" });
    setError(null);
    const handle = setTimeout(async () => {
      try {
        const baseUrl = await discoverHomeserver(homeserver);
        const tmp = createClient({ baseUrl });

        let oidc: OidcClientConfig | null = null;
        try {
          oidc = await tmp.getAuthMetadata();
        } catch {
          // OIDC 없음 — 무시
        }

        let supportsPassword = false;
        let supportsRegistration: boolean | null = null;
        try {
          const flows = await tmp.loginFlows();
          supportsPassword = flows.flows.some(
            (f) => f.type === "m.login.password",
          );
        } catch {
          // 일부 서버는 OIDC만 노출하고 /login 안 줌
        }

        // 회원가입 지원 여부: dummy stage 요청 보내서 401(=UIA flows 반환)이면
        // 가능, 403/404면 비활성화. SDK가 401일 때 raise하므로 try.
        try {
          await tmp.registerRequest({});
        } catch (e) {
          const err = e as MatrixError;
          if (err?.httpStatus === 401 && err.data?.flows) {
            supportsRegistration = true;
          } else if (
            err?.httpStatus === 403 ||
            err?.errcode === "M_FORBIDDEN"
          ) {
            supportsRegistration = false;
          }
        }

        if (!oidc && !supportsPassword) {
          setFlow({ kind: "unsupported", flows: [] });
          return;
        }
        setFlow({
          kind: "ready",
          baseUrl,
          oidc,
          password: supportsPassword,
          registration: supportsRegistration,
        });
      } catch (e) {
        setFlow({
          kind: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [homeserver]);

  async function loginOidc() {
    if (flow.kind !== "ready" || !flow.oidc) return;
    setBusy(true);
    setError(null);
    try {
      const clientUri = window.location.origin;
      const redirectUri = `${clientUri}/oidc/callback`;
      const clientId = await registerOidcClient(flow.oidc, {
        clientName: "matrix-client",
        clientUri,
        redirectUris: [redirectUri],
        applicationType: "web",
        contacts: [],
        tosUri: clientUri,
        policyUri: clientUri,
      });
      const url = await generateOidcAuthorizationUrl({
        metadata: flow.oidc,
        clientId,
        homeserverUrl: flow.baseUrl,
        redirectUri,
        nonce: crypto.randomUUID(),
      });
      localStorage.setItem("matrix-client:last-homeserver", flow.baseUrl);
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  /** identifier가 이메일이면 m.login.email.identity, 그 외엔 m.id.user. */
  function buildIdentifier(value: string) {
    const v = value.trim();
    if (v.includes("@") && !v.startsWith("@") && v.includes(".")) {
      return { type: "m.id.thirdparty", medium: "email", address: v };
    }
    // "@user:server" → user, 또는 그대로 user
    const user = v.startsWith("@") ? v.slice(1).split(":")[0] : v;
    return { type: "m.id.user", user };
  }

  async function loginPassword() {
    if (flow.kind !== "ready" || !flow.password) return;
    if (busy || !identifier.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const tmp = createClient({ baseUrl: flow.baseUrl });
      // SDK loginWithPassword는 user-id only — 이메일 지원 위해 raw login 호출
      const result = (await tmp.login("m.login.password", {
        identifier: buildIdentifier(identifier),
        password,
        initial_device_display_name: "matrix-client (web)",
      })) as {
        access_token: string;
        user_id: string;
        device_id: string;
        refresh_token?: string;
      };
      saveSession({
        homeserverUrl: flow.baseUrl,
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        userId: result.user_id,
        deviceId: result.device_id,
      });
      localStorage.setItem("matrix-client:last-homeserver", flow.baseUrl);
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  /** 회원가입 — UIA 흐름 단순화: dummy stage(서버 정책 허용 시)만 시도.
   *  ReCAPTCHA / 이메일 인증 / ToS 동의 등 서버별 추가 stage가 필요한
   *  경우엔 명시적으로 안내하고 OIDC 또는 직접 가입 페이지로 유도. */
  async function signUp() {
    if (flow.kind !== "ready") return;
    if (busy || !identifier.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const tmp = createClient({ baseUrl: flow.baseUrl });
      const user = identifier.trim().startsWith("@")
        ? identifier.trim().slice(1).split(":")[0]
        : identifier.trim();
      // 1차 시도: auth 없이 — 서버는 401 + flows로 응답
      let sessionId: string | null = null;
      try {
        await tmp.registerRequest({
          username: user,
          password,
          initial_device_display_name: "matrix-client (web)",
        });
      } catch (e) {
        const err = e as MatrixError;
        if (err.httpStatus !== 401 || !err.data?.flows) {
          throw e;
        }
        sessionId = (err.data.session as string) ?? null;
        const flows = err.data.flows as Array<{ stages: string[] }>;
        const dummyOnly = flows.find(
          (f) => f.stages.length === 1 && f.stages[0] === "m.login.dummy",
        );
        if (!dummyOnly) {
          // 서버가 추가 stage(reCAPTCHA, 이메일 등) 요구 — 우리 단순 클라
          // 에서는 처리 못함. 어떤 stage가 필요한지 안내.
          const required = flows.map((f) => f.stages.join("+")).join(", ");
          throw new Error(t("login.signup.complexFlows", { flows: required }));
        }
      }
      // 2차: dummy stage로 완료
      const result = (await tmp.registerRequest({
        username: user,
        password,
        initial_device_display_name: "matrix-client (web)",
        auth: { type: "m.login.dummy", session: sessionId ?? undefined },
      })) as {
        access_token?: string;
        user_id?: string;
        device_id?: string;
      };
      if (!result.access_token || !result.user_id || !result.device_id) {
        throw new Error("Registration response missing fields");
      }
      saveSession({
        homeserverUrl: flow.baseUrl,
        accessToken: result.access_token,
        userId: result.user_id,
        deviceId: result.device_id,
      });
      localStorage.setItem("matrix-client:last-homeserver", flow.baseUrl);
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const ready = flow.kind === "ready";
  const showOidc = ready && flow.oidc;
  const showPassword = ready && flow.password;
  const showRegistration = mode === "signup";
  const canSignup =
    ready && (flow.password || flow.oidc) && flow.registration !== false;

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-0 p-6">
      <div className="flex w-[420px] max-w-full flex-col overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl">
        <header className="flex h-12 items-center border-b border-line pl-5">
          <h1 className="font-semibold text-fg-0">
            {mode === "signin" ? t("login.title") : t("login.signup.title")}
          </h1>
        </header>

        {/* signin/signup 탭 — 회원가입 가능할 때만 노출 */}
        {canSignup && (
          <div className="flex border-b border-line">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 py-2 text-[12px] font-medium ${
                mode === "signin"
                  ? "bg-bg-2 text-fg-0"
                  : "text-fg-3 hover:bg-bg-2 hover:text-fg-0"
              }`}
            >
              {t("login.tab.signin")}
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 border-l border-line py-2 text-[12px] font-medium ${
                mode === "signup"
                  ? "bg-bg-2 text-fg-0"
                  : "text-fg-3 hover:bg-bg-2 hover:text-fg-0"
              }`}
            >
              {t("login.tab.signup")}
            </button>
          </div>
        )}

        <div className="flex flex-col">
          <label className="flex items-stretch border-b border-line">
            <span className="flex w-28 shrink-0 items-center pl-5 text-[12px] text-fg-3">
              {t("login.homeserver")}
            </span>
            <input
              className="flex-1 bg-transparent py-2.5 pl-3 pr-5 text-[13px] text-fg-0 outline-none placeholder:text-fg-3"
              value={homeserver}
              onChange={(e) => setHomeserver(e.target.value)}
              placeholder="matrix.example.com"
              autoFocus
            />
          </label>

          {(showPassword || showRegistration) && (
            <>
              <label className="flex items-stretch border-b border-line">
                <span className="flex w-28 shrink-0 items-center pl-5 text-[12px] text-fg-3">
                  {showRegistration
                    ? t("login.username")
                    : t("login.identifier")}
                </span>
                <input
                  className="flex-1 bg-transparent py-2.5 pl-3 pr-5 text-[13px] text-fg-0 outline-none placeholder:text-fg-3"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={
                    showRegistration ? "alice" : "@alice:example.com"
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      mode === "signup" ? signUp() : loginPassword();
                    }
                  }}
                />
              </label>
              <label className="flex items-stretch border-b border-line">
                <span className="flex w-28 shrink-0 items-center pl-5 text-[12px] text-fg-3">
                  {t("login.password")}
                </span>
                <input
                  type="password"
                  className="flex-1 bg-transparent py-2.5 pl-3 pr-5 text-[13px] text-fg-0 outline-none placeholder:text-fg-3"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      mode === "signup" ? signUp() : loginPassword();
                    }
                  }}
                />
              </label>
            </>
          )}

          {flow.kind === "loading" && (
            <p className="flex items-center gap-2 border-b border-line px-5 py-3 text-[12px] text-fg-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("login.checking")}
            </p>
          )}

          {flow.kind === "unsupported" && (
            <p className="border-b border-line px-5 py-3 text-[12px] text-amber-300">
              {t("login.noSupportedFlow")}
            </p>
          )}

          {flow.kind === "error" && (
            <p className="border-b border-line px-5 py-3 text-[12px] text-red-400">
              {t("login.discoveryFailed", { message: flow.message })}
            </p>
          )}

          {error && (
            <p className="border-b border-line px-5 py-3 text-[12px] text-red-400">
              {error}
            </p>
          )}
        </div>

        {/* Action buttons */}
        {mode === "signin" && showOidc && (
          <button
            type="button"
            className="bg-bg-2 py-2.5 text-[13px] font-medium text-fg-0 hover:bg-bg-3 disabled:opacity-50"
            disabled={busy}
            onClick={loginOidc}
          >
            {busy ? t("login.busy") : t("login.actionOidc")}
          </button>
        )}
        {mode === "signin" && showPassword && !showOidc && (
          <button
            type="button"
            className="bg-bg-2 py-2.5 text-[13px] font-medium text-fg-0 hover:bg-bg-3 disabled:opacity-50"
            disabled={busy || !identifier.trim() || !password}
            onClick={loginPassword}
          >
            {busy ? t("login.busy") : t("login.actionPassword")}
          </button>
        )}
        {mode === "signin" && showOidc && showPassword && (
          // OIDC + password 모두 지원 — 비밀번호도 두 번째 옵션으로
          <button
            type="button"
            className="border-t border-line py-2.5 text-[12px] text-fg-2 hover:bg-bg-2 hover:text-fg-0 disabled:opacity-50"
            disabled={busy || !identifier.trim() || !password}
            onClick={loginPassword}
          >
            {t("login.actionPassword")}
          </button>
        )}
        {mode === "signup" && (
          <button
            type="button"
            className="bg-bg-2 py-2.5 text-[13px] font-medium text-fg-0 hover:bg-bg-3 disabled:opacity-50"
            disabled={busy || !identifier.trim() || !password}
            onClick={signUp}
          >
            {busy ? t("login.busy") : t("login.actionSignup")}
          </button>
        )}
      </div>
    </main>
  );
}
