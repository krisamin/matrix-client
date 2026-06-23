import { Loader2 } from "lucide-react";
import {
  createClient,
  generateOidcAuthorizationUrl,
  registerOidcClient,
  type OidcClientConfig,
} from "matrix-js-sdk";
import { useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { saveSession } from "../lib/session";

export function meta() {
  return [{ title: "Login — matrix-client" }];
}

type AuthFlow =
  | { kind: "loading" }
  | { kind: "oidc"; metadata: OidcClientConfig }
  | { kind: "password" }
  | { kind: "unsupported"; flows: string[] }
  | { kind: "error"; message: string };

export default function Login() {
  const t = useT();
  const [homeserver, setHomeserver] = useState(
    typeof window !== "undefined"
      ? (localStorage.getItem("matrix-client:last-homeserver") ??
        "https://matrix.org")
      : "https://matrix.org",
  );
  const [flow, setFlow] = useState<AuthFlow>({ kind: "loading" });
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // homeserver가 바뀌면 capability 재조회 (디바운스)
  useEffect(() => {
    const url = homeserver.trim().replace(/\/+$/, "");
    if (!url) {
      setFlow({ kind: "loading" });
      return;
    }
    setFlow({ kind: "loading" });
    setError(null);
    const handle = setTimeout(async () => {
      try {
        const tmp = createClient({ baseUrl: url });
        // 1) OIDC 우선 — m.authentication 있으면 그쪽으로
        try {
          const authMetadata = await tmp.getAuthMetadata();
          setFlow({ kind: "oidc", metadata: authMetadata });
          return;
        } catch {
          // OIDC 없음 → password 시도
        }
        // 2) 레거시 login flows
        const flows = await tmp.loginFlows();
        const supportsPassword = flows.flows.some(
          (f) => f.type === "m.login.password",
        );
        if (supportsPassword) {
          setFlow({ kind: "password" });
        } else {
          setFlow({
            kind: "unsupported",
            flows: flows.flows.map((f) => f.type),
          });
        }
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
    if (flow.kind !== "oidc") return;
    setBusy(true);
    setError(null);
    try {
      const baseUrl = homeserver.trim().replace(/\/+$/, "");
      const clientUri = window.location.origin;
      const redirectUri = `${clientUri}/oidc/callback`;
      const clientId = await registerOidcClient(flow.metadata, {
        clientName: "matrix-client",
        clientUri,
        redirectUris: [redirectUri],
        applicationType: "web",
        contacts: [],
        tosUri: clientUri,
        policyUri: clientUri,
      });
      const url = await generateOidcAuthorizationUrl({
        metadata: flow.metadata,
        clientId,
        homeserverUrl: baseUrl,
        redirectUri,
        nonce: crypto.randomUUID(),
      });
      localStorage.setItem("matrix-client:last-homeserver", baseUrl);
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function loginPassword() {
    if (flow.kind !== "password") return;
    if (busy || !user.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const baseUrl = homeserver.trim().replace(/\/+$/, "");
      const tmp = createClient({ baseUrl });
      const result = await tmp.loginWithPassword(user.trim(), password);
      if (!result.access_token || !result.user_id || !result.device_id) {
        throw new Error("Login response missing fields");
      }
      saveSession({
        homeserverUrl: baseUrl,
        accessToken: result.access_token,
        userId: result.user_id,
        deviceId: result.device_id,
      });
      localStorage.setItem("matrix-client:last-homeserver", baseUrl);
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-0 p-6">
      <div className="flex w-[420px] max-w-full flex-col overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl">
        <header className="flex h-12 items-center border-b border-line pl-5">
          <h1 className="font-semibold text-fg-0">{t("login.title")}</h1>
        </header>

        <div className="flex flex-col">
          <label className="flex items-stretch border-b border-line">
            <span className="flex w-28 shrink-0 items-center pl-5 text-[12px] text-fg-3">
              {t("login.homeserver")}
            </span>
            <input
              className="flex-1 bg-transparent py-2.5 pl-3 pr-5 text-[13px] text-fg-0 outline-none placeholder:text-fg-3"
              value={homeserver}
              onChange={(e) => setHomeserver(e.target.value)}
              placeholder="https://matrix.example.com"
              autoFocus
            />
          </label>

          {flow.kind === "password" && (
            <>
              <label className="flex items-stretch border-b border-line">
                <span className="flex w-28 shrink-0 items-center pl-5 text-[12px] text-fg-3">
                  {t("login.username")}
                </span>
                <input
                  className="flex-1 bg-transparent py-2.5 pl-3 pr-5 text-[13px] text-fg-0 outline-none placeholder:text-fg-3"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  placeholder="@user:example.com or user"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") loginPassword();
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
                    if (e.key === "Enter") loginPassword();
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
              {t("login.unsupportedFlows", { flows: flow.flows.join(", ") })}
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

        {flow.kind === "oidc" && (
          <button
            type="button"
            className="bg-bg-2 py-2.5 text-[13px] font-medium text-fg-0 hover:bg-bg-3 disabled:opacity-50"
            disabled={busy}
            onClick={loginOidc}
          >
            {busy ? t("login.busy") : t("login.actionOidc")}
          </button>
        )}
        {flow.kind === "password" && (
          <button
            type="button"
            className="bg-bg-2 py-2.5 text-[13px] font-medium text-fg-0 hover:bg-bg-3 disabled:opacity-50"
            disabled={busy || !user.trim() || !password}
            onClick={loginPassword}
          >
            {busy ? t("login.busy") : t("login.actionPassword")}
          </button>
        )}
      </div>
    </main>
  );
}
