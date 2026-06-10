import { useState } from "react";
import {
  createClient,
  registerOidcClient,
  generateOidcAuthorizationUrl,
} from "matrix-js-sdk";

export function meta() {
  return [{ title: "로그인 — matrix-client" }];
}

export default function Login() {
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
    <main className="flex min-h-screen items-center justify-center">
      <div className="flex w-80 flex-col gap-4">
        <h1 className="text-2xl font-bold">Matrix 로그인</h1>
        <input
          className="rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          value={homeserver}
          onChange={(e) => setHomeserver(e.target.value)}
          placeholder="https://matrix.example.com"
        />
        <button
          className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50"
          disabled={busy}
          onClick={startLogin}
        >
          {busy ? "이동 중..." : "OIDC로 로그인"}
        </button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </main>
  );
}
