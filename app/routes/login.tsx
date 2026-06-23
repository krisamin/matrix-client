import {
  createClient,
  generateOidcAuthorizationUrl,
  registerOidcClient,
} from "matrix-js-sdk";
import { useState } from "react";
import { useT } from "../lib/i18n";

export function meta() {
  return [{ title: "Login — matrix-client" }];
}

export default function Login() {
  const t = useT();
  const [homeserver, setHomeserver] = useState("https://matrix.krisam.in");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startLogin() {
    setBusy(true);
    setError(null);
    try {
      const baseUrl = homeserver.trim().replace(/\/+$/, "");
      // 1) 홈서버에서 OIDC(MAS) 메타데이터 디스커버리
      const tmp = createClient({ baseUrl });
      const authMetadata = await tmp.getAuthMetadata();

      // 2) MAS에 다이내믹 클라이언트 등록
      const clientUri = window.location.origin;
      const redirectUri = `${clientUri}/oidc/callback`;
      const clientId = await registerOidcClient(authMetadata, {
        clientName: "matrix-client",
        clientUri,
        redirectUris: [redirectUri],
        applicationType: "web",
        contacts: [],
        tosUri: clientUri,
        policyUri: clientUri,
      });

      // 3) 인가 URL 생성 후 리다이렉트 (state/PKCE는 SDK가 sessionStorage에 보관)
      const url = await generateOidcAuthorizationUrl({
        metadata: authMetadata,
        clientId,
        homeserverUrl: baseUrl,
        redirectUri,
        nonce: crypto.randomUUID(),
      });
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-0 p-6">
      <div className="flex w-[400px] max-w-full flex-col overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl">
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
            />
          </label>
          {error && (
            <p className="border-b border-line px-5 py-2 text-[12px] text-red-400">
              {error}
            </p>
          )}
        </div>
        <button
          type="button"
          className="bg-bg-2 py-2.5 text-[13px] font-medium text-fg-0 hover:bg-bg-3 disabled:opacity-50"
          disabled={busy}
          onClick={startLogin}
        >
          {busy ? t("login.busy") : t("login.action")}
        </button>
      </div>
    </main>
  );
}
