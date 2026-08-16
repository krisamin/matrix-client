/** 런타임 주입 설정. 이미지를 다시 굽지 않고 배포처마다 값을 바꾸기 위한 것.
 *
 *  nginx 컨테이너가 시작할 때 `docker/entrypoint.sh` 가 `DEFAULT_HOMESERVER`
 *  환경변수를 읽어 `/config.js` 를 생성하고, index.html 이 번들보다 먼저
 *  그것을 로드해 `window.__MATRIX_CLIENT_CONFIG__` 를 채운다.
 *
 *  ★과거에는 빌드 산출물의 `https://matrix.org` 리터럴을 sed로 치환했는데,
 *  소스 기본값을 바꾸는 순간 치환 대상이 사라져 **조용히** 무효화됐다.
 *  (게다가 gzip_static 때문에 .js.gz 까지 다시 압축해야 했다.)
 *  값이 코드에 없고 별도 파일에서 오므로 그 결합이 끊긴다. */
declare global {
  interface Window {
    __MATRIX_CLIENT_CONFIG__?: { defaultHomeserver?: string };
  }
}

/** 빌드에 박히는 최종 fallback. 런타임 설정도 없고 저장된 값도 없을 때만 쓰인다. */
const BUILTIN_DEFAULT_HOMESERVER = "matrix.org";

/** 처음 방문 시 로그인 폼에 채워둘 홈서버 이름.
 *  우선순위: 런타임 주입(DEFAULT_HOMESERVER) → 빌트인 fallback.
 *  API base URL 이 아니라 **서버 이름**이다 (well-known delegation 이
 *  `krisam.in` → `https://matrix.krisam.in` 해석을 담당). */
export function defaultHomeserver(): string {
  if (typeof window === "undefined") return BUILTIN_DEFAULT_HOMESERVER;
  const injected = window.__MATRIX_CLIENT_CONFIG__?.defaultHomeserver?.trim();
  return injected || BUILTIN_DEFAULT_HOMESERVER;
}
