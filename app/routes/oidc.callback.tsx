import { completeAuthorizationCodeGrant, createClient } from "matrix-js-sdk";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { saveSession } from "../lib/session";

export function meta() {
  return [{ title: "Authenticating — matrix-client" }];
}

/** MAS scope에서 device id 추출: urn:matrix:org.matrix.msc2967.client:device:XXXX */
function deviceIdFromScope(scope?: string): string | undefined {
  return scope?.match(
    /urn:matrix:org\.matrix\.msc2967\.client:device:(\S+)/,
  )?.[1];
}

export default function OidcCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) {
      setError(params.get("error_description") ?? "code/state 파라미터 없음");
      return;
    }
    (async () => {
      // 토큰 교환 (PKCE 검증 포함, state는 SDK가 sessionStorage에서 복원)
      const {
        tokenResponse,
        homeserverUrl,
        oidcClientSettings,
        idTokenClaims,
      } = await completeAuthorizationCodeGrant(code, state);

      // whoami로 userId/deviceId 확정
      const tmp = createClient({
        baseUrl: homeserverUrl,
        accessToken: tokenResponse.access_token,
      });
      const whoami = await tmp.whoami();
      const deviceId =
        deviceIdFromScope(tokenResponse.scope) ?? whoami.device_id;
      if (!deviceId) throw new Error("device id를 알 수 없음");

      saveSession({
        homeserverUrl,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        userId: whoami.user_id,
        deviceId,
        issuer: oidcClientSettings.issuer,
        clientId: oidcClientSettings.clientId,
        redirectUri: `${window.location.origin}/oidc/callback`,
        idTokenClaims,
      });
      navigate("/", { replace: true });
    })().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      {error ? (
        <div className="flex flex-col gap-2 text-center">
          <p className="text-red-500">로그인 실패: {error}</p>
          <a className="text-blue-500 underline" href="/login">
            다시 시도
          </a>
        </div>
      ) : (
        <p>토큰 교환 중...</p>
      )}
    </main>
  );
}
