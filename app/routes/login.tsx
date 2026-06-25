import { Loader2 } from "lucide-react";
import {
  createClient,
  generateOidcAuthorizationUrl,
  type MatrixError,
  type OidcClientConfig,
  registerOidcClient,
} from "matrix-js-sdk";
import { useEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { loadRecaptcha, renderRecaptcha } from "../lib/recaptcha";
import { saveSession } from "../lib/session";
import { ls } from "../lib/storage";
import { buildIdentifier, discoverHomeserver } from "../lib/uia";

export function meta() {
  return [{ title: "Login — matrix-client" }];
}

type AuthFlow =
  | { kind: "loading" }
  | {
      kind: "ready";
      baseUrl: string;
      oidc: OidcClientConfig | null;
      password: boolean;
      registration: boolean | null;
    }
  | { kind: "unsupported" }
  | { kind: "error"; message: string };

type Mode = "signin" | "signup" | "reset";

export default function Login() {
  const t = useT();
  const [homeserver, setHomeserver] = useState(
    typeof window !== "undefined"
      ? (ls.get("last-homeserver") ?? "https://matrix.org")
      : "https://matrix.org",
  );
  const [mode, setMode] = useState<Mode>("signin");
  /** signin 모드에서 OIDC + password 둘 다 지원할 때, 사용자가 'password로
   *  로그인' 토글을 눌렀는지. 기본은 OIDC (모던 흐름이 우선). */
  const [usePasswordFallback, setUsePasswordFallback] = useState(false);
  const [flow, setFlow] = useState<AuthFlow>({ kind: "loading" });
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  /** 진행 중인 회원가입 UIA 상태. CAPTCHA / terms 등 stage가 필요할 때
   *  여기에 sessionId + 다음 단계를 저장하고 화면에 적절한 위젯을 띄움. */
  type UiaState =
    | { kind: "idle" }
    | {
        kind: "captcha";
        sessionId: string;
        sitekey: string;
        completed: string[]; // 이미 완료한 stage들
      }
    | {
        kind: "terms";
        sessionId: string;
        policies: Record<
          string,
          { version: string; en?: { name: string; url: string } }
        >;
        completed: string[];
      };
  const [uia, setUia] = useState<UiaState>({ kind: "idle" });
  const [resetSent, setResetSent] = useState(false);
  const recaptchaRef = useRef<HTMLDivElement | null>(null);

  // CAPTCHA stage 진입 시 위젯 마운트
  // biome-ignore lint/correctness/useExhaustiveDependencies: cleanup은 매번 새 closure
  useEffect(() => {
    if (uia.kind !== "captcha") return;
    let cleanup = () => {};
    (async () => {
      try {
        await loadRecaptcha();
        if (!recaptchaRef.current) return;
        recaptchaRef.current.innerHTML = "";
        const handle = renderRecaptcha(
          recaptchaRef.current,
          uia.sitekey,
          (token) => {
            void completeCaptcha(uia.sessionId, uia.completed, token);
          },
        );
        cleanup = () => handle.reset();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => cleanup();
  }, [uia, completeCaptcha]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // homeserver 변경 → capability 재조회 (디바운스)
  useEffect(() => {
    if (!homeserver.trim()) {
      setFlow({ kind: "loading" });
      return;
    }
    setFlow({ kind: "loading" });
    setError(null);
    setUsePasswordFallback(false);
    const handle = setTimeout(async () => {
      try {
        const baseUrl = await discoverHomeserver(homeserver);
        const tmp = createClient({ baseUrl });
        let oidc: OidcClientConfig | null = null;
        try {
          oidc = await tmp.getAuthMetadata();
        } catch {}
        let supportsPassword = false;
        try {
          const flows = await tmp.loginFlows();
          supportsPassword = flows.flows.some(
            (f) => f.type === "m.login.password",
          );
        } catch {}
        let supportsRegistration: boolean | null = null;
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
          setFlow({ kind: "unsupported" });
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
      ls.set("last-homeserver", flow.baseUrl);
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  /** UIA 응답을 받아 다음 stage를 결정. 401+flows면 다음 미완료 stage로
   *  진입, 그 외(200=성공, 401+errcode 같은 실패)는 throw. */
  function handleUiaError(
    err: MatrixError,
    completed: string[],
  ): UiaState | null {
    if (err.httpStatus !== 401 || !err.data?.flows) return null;
    const sessionId = (err.data.session as string) ?? "";
    const flows = err.data.flows as Array<{ stages: string[] }>;
    // 우리 클라가 처리 가능한 stage들로만 이루어진 flow 우선 선택
    const SUPPORTED = new Set([
      "m.login.dummy",
      "m.login.recaptcha",
      "m.login.terms",
    ]);
    const usable = flows.find((f) => f.stages.every((s) => SUPPORTED.has(s)));
    if (!usable) {
      const required = flows.map((f) => f.stages.join("+")).join(", ");
      throw new Error(t("login.signup.complexFlows", { flows: required }));
    }
    // 다음 미완료 stage
    const next = usable.stages.find((s) => !completed.includes(s));
    if (!next) {
      // 모든 stage 끝났는데도 401 — 서버 잘못 응답이거나 dummy로 다시 호출 필요
      return null;
    }
    if (next === "m.login.recaptcha") {
      const params = (err.data.params as Record<string, unknown>) ?? {};
      const captcha = params["m.login.recaptcha"] as
        | { public_key?: string }
        | undefined;
      const sitekey = captcha?.public_key;
      if (!sitekey) {
        throw new Error("Server did not provide reCAPTCHA sitekey");
      }
      return { kind: "captcha", sessionId, sitekey, completed };
    }
    if (next === "m.login.terms") {
      const params = (err.data.params as Record<string, unknown>) ?? {};
      const terms = params["m.login.terms"] as
        | {
            policies: Record<
              string,
              { version: string; en?: { name: string; url: string } }
            >;
          }
        | undefined;
      const policies = terms?.policies ?? {};
      return { kind: "terms", sessionId, policies, completed };
    }
    if (next === "m.login.dummy") {
      // dummy는 사용자 입력 없이 즉시 완료 — 호출부가 바로 추가 stage 보냄
      return null;
    }
    return null;
  }

  async function submitRegister(auth?: {
    type: string;
    session?: string;
    response?: string;
  }): Promise<void> {
    if (flow.kind !== "ready") return;
    const tmp = createClient({ baseUrl: flow.baseUrl });
    const user = identifier.trim().startsWith("@")
      ? identifier.trim().slice(1).split(":")[0]
      : identifier.trim();
    const result = (await tmp.registerRequest({
      username: user,
      password,
      initial_device_display_name: "matrix-client (web)",
      auth,
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
    ls.set("last-homeserver", flow.baseUrl);
    window.location.href = "/";
  }

  async function completeCaptcha(
    sessionId: string,
    completed: string[],
    token: string,
  ) {
    setBusy(true);
    setError(null);
    try {
      await submitRegister({
        type: "m.login.recaptcha",
        session: sessionId,
        response: token,
      });
    } catch (e) {
      const err = e as MatrixError;
      const next = handleUiaError(err, [...completed, "m.login.recaptcha"]);
      if (next) {
        setUia(next);
      } else {
        // dummy로 마무리 시도
        try {
          await submitRegister({
            type: "m.login.dummy",
            session: sessionId,
          });
        } catch (e2) {
          setError(e2 instanceof Error ? e2.message : String(e2));
          setUia({ kind: "idle" });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function acceptTerms(sessionId: string, completed: string[]) {
    setBusy(true);
    setError(null);
    try {
      await submitRegister({ type: "m.login.terms", session: sessionId });
    } catch (e) {
      const err = e as MatrixError;
      const next = handleUiaError(err, [...completed, "m.login.terms"]);
      if (next) {
        setUia(next);
      } else {
        try {
          await submitRegister({
            type: "m.login.dummy",
            session: sessionId,
          });
        } catch (e2) {
          setError(e2 instanceof Error ? e2.message : String(e2));
          setUia({ kind: "idle" });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function loginPassword() {
    if (flow.kind !== "ready" || !flow.password) return;
    if (busy || !identifier.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const tmp = createClient({ baseUrl: flow.baseUrl });
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
      ls.set("last-homeserver", flow.baseUrl);
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function signUp() {
    if (flow.kind !== "ready") return;
    if (busy || !identifier.trim() || !password) return;
    setBusy(true);
    setError(null);
    setUia({ kind: "idle" });
    try {
      // 1차: auth 없이 — 서버는 401 + flows 응답
      await submitRegister();
    } catch (e) {
      const err = e as MatrixError;
      try {
        const next = handleUiaError(err, []);
        if (next) {
          setUia(next);
        } else {
          // 모든 stage가 dummy거나 미완 — dummy로 마무리
          const sessionId = (err.data?.session as string) ?? "";
          await submitRegister({
            type: "m.login.dummy",
            session: sessionId,
          });
        }
      } catch (e2) {
        setError(e2 instanceof Error ? e2.message : String(e2));
      }
    } finally {
      setBusy(false);
    }
  }

  /** 비밀번호 재설정: 이메일로 토큰 받아 서버 자체 페이지에서 재설정.
   *  대부분 homeserver는 sygnal/sliding-sync MAS와 별개로 자체 reset
   *  페이지를 호스팅 — 여기선 이메일 토큰만 요청해서 사용자가 메일을
   *  확인하도록 안내. UIA 완성은 서버 페이지에서 처리. */
  async function resetPassword() {
    if (flow.kind !== "ready") return;
    if (busy || !identifier.trim()) return;
    const v = identifier.trim();
    if (!v.includes("@") || !v.includes(".") || v.startsWith("@")) {
      setError(t("login.reset.needEmail"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const tmp = createClient({ baseUrl: flow.baseUrl });
      const clientSecret = crypto.randomUUID().replaceAll("-", "");
      // SDK: requestPasswordEmailToken — 1번째 시도(sendAttempt=1)
      await (
        tmp as unknown as {
          requestPasswordEmailToken: (
            email: string,
            secret: string,
            attempt: number,
          ) => Promise<unknown>;
        }
      ).requestPasswordEmailToken(v, clientSecret, 1);
      setResetSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const ready = flow.kind === "ready";
  // signin 모드 시 어떤 입력 폼을 보일지:
  //   - OIDC만 → 폼 없음 (homeserver만)
  //   - password만 → 폼 표시
  //   - OIDC + password → 기본은 폼 숨김(OIDC 우선), 토글 누르면 표시
  const passwordFieldsVisible =
    ready &&
    flow.password &&
    (mode === "signup" ||
      mode === "reset" ||
      (mode === "signin" && (!flow.oidc || usePasswordFallback)));
  const canSignup =
    ready && (flow.password || flow.oidc) && flow.registration !== false;
  const passwordVisible = mode === "signin" && passwordFieldsVisible;
  const headerTitle =
    mode === "signup"
      ? t("login.signup.title")
      : mode === "reset"
        ? t("login.reset.title")
        : t("login.title");

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-0 p-6">
      <div className="flex w-[400px] max-w-full flex-col overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl">
        <header className="flex h-12 items-center border-b border-line pl-5">
          <h1 className="font-semibold text-fg-0">{headerTitle}</h1>
        </header>

        {canSignup && mode !== "reset" && (
          <div className="flex border-b border-line">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
              }}
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
              onClick={() => {
                setMode("signup");
                setError(null);
              }}
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
            <span className="flex w-24 shrink-0 items-center pl-5 text-[12px] text-fg-3">
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

          {(passwordFieldsVisible || mode === "signup") && (
            <label className="flex items-stretch border-b border-line">
              <span className="flex w-24 shrink-0 items-center pl-5 text-[12px] text-fg-3">
                {mode === "signup" ? t("login.username") : t("login.user")}
              </span>
              <input
                className="flex-1 bg-transparent py-2.5 pl-3 pr-5 text-[13px] text-fg-0 outline-none placeholder:text-fg-3"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={mode === "signup" ? "alice" : "@alice:example.com"}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  if (mode === "signup") signUp();
                  else if (mode === "reset") resetPassword();
                  else loginPassword();
                }}
              />
            </label>
          )}

          {(passwordVisible || mode === "signup") && (
            <label className="flex items-stretch border-b border-line">
              <span className="flex w-24 shrink-0 items-center pl-5 text-[12px] text-fg-3">
                {t("login.password")}
              </span>
              <input
                type="password"
                className="flex-1 bg-transparent py-2.5 pl-3 pr-5 text-[13px] text-fg-0 outline-none placeholder:text-fg-3"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  if (mode === "signup") signUp();
                  else loginPassword();
                }}
              />
            </label>
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
          {mode === "reset" && resetSent && (
            <p className="border-b border-line px-5 py-3 text-[12px] text-emerald-300">
              {t("login.reset.sent")}
            </p>
          )}
        </div>

        {/* primary action — 한 모드에 한 번만 노출 */}
        {mode === "signin" && ready && flow.oidc && !usePasswordFallback && (
          <button
            type="button"
            className="bg-bg-2 py-2.5 text-[13px] font-medium text-fg-0 hover:bg-bg-3 disabled:opacity-50"
            disabled={busy}
            onClick={loginOidc}
          >
            {busy ? t("login.busy") : t("login.actionOidc")}
          </button>
        )}
        {mode === "signin" && passwordFieldsVisible && (
          <button
            type="button"
            className="bg-bg-2 py-2.5 text-[13px] font-medium text-fg-0 hover:bg-bg-3 disabled:opacity-50"
            disabled={busy || !identifier.trim() || !password}
            onClick={loginPassword}
          >
            {busy ? t("login.busy") : t("login.actionPassword")}
          </button>
        )}
        {mode === "signup" && uia.kind === "idle" && (
          <button
            type="button"
            className="bg-bg-2 py-2.5 text-[13px] font-medium text-fg-0 hover:bg-bg-3 disabled:opacity-50"
            disabled={busy || !identifier.trim() || !password}
            onClick={signUp}
          >
            {busy ? t("login.busy") : t("login.actionSignup")}
          </button>
        )}
        {mode === "signup" && uia.kind === "captcha" && (
          <div className="flex flex-col items-center gap-3 border-t border-line bg-bg-2/30 px-5 py-4">
            <p className="text-[12px] text-fg-2">{t("login.captcha.hint")}</p>
            <div ref={recaptchaRef} />
          </div>
        )}
        {mode === "signup" && uia.kind === "terms" && (
          <div className="flex flex-col gap-2 border-t border-line bg-bg-2/30 px-5 py-4">
            <p className="text-[12px] text-fg-2">{t("login.terms.hint")}</p>
            <ul className="flex flex-col gap-1 pl-3 text-[13px]">
              {Object.entries(uia.policies).map(([id, policy]) => (
                <li key={id}>
                  <a
                    href={policy.en?.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-fg-1 underline hover:text-fg-0"
                  >
                    {policy.en?.name ?? id}
                  </a>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => acceptTerms(uia.sessionId, uia.completed)}
              disabled={busy}
              className="mt-2 rounded-md bg-bg-3 py-2 text-[13px] font-medium text-fg-0 hover:bg-line-strong disabled:opacity-50"
            >
              {busy ? t("login.busy") : t("login.terms.accept")}
            </button>
          </div>
        )}
        {mode === "reset" && (
          <button
            type="button"
            className="bg-bg-2 py-2.5 text-[13px] font-medium text-fg-0 hover:bg-bg-3 disabled:opacity-50"
            disabled={busy || !identifier.trim() || resetSent}
            onClick={resetPassword}
          >
            {busy ? t("login.busy") : t("login.reset.send")}
          </button>
        )}

        {/* secondary actions — ghost 톤 */}
        {mode === "signin" && ready && flow.oidc && flow.password && (
          <button
            type="button"
            className="border-t border-line py-2 text-[12px] text-fg-3 hover:bg-bg-2 hover:text-fg-0"
            onClick={() => {
              setUsePasswordFallback((v) => !v);
              setError(null);
            }}
          >
            {usePasswordFallback
              ? t("login.useOidcInstead")
              : t("login.usePasswordInstead")}
          </button>
        )}
        {mode === "signin" && passwordFieldsVisible && (
          <button
            type="button"
            className="border-t border-line py-2 text-[12px] text-fg-3 hover:bg-bg-2 hover:text-fg-0"
            onClick={() => {
              setMode("reset");
              setError(null);
              setResetSent(false);
            }}
          >
            {t("login.forgotPassword")}
          </button>
        )}
        {mode === "reset" && (
          <button
            type="button"
            className="border-t border-line py-2 text-[12px] text-fg-3 hover:bg-bg-2 hover:text-fg-0"
            onClick={() => {
              setMode("signin");
              setResetSent(false);
              setError(null);
            }}
          >
            {t("login.backToSignin")}
          </button>
        )}
      </div>
    </main>
  );
}
