#!/bin/sh
# 런타임 설정 주입 — 이미지를 다시 굽지 않고 배포처마다 기본 홈서버를 바꾼다.
#
# /usr/share/nginx/html/config.js 를 생성하고, index.html 이 앱 번들보다 먼저
# 이 파일을 로드해 window.__MATRIX_CLIENT_CONFIG__ 를 채운다.
# (앱 쪽 소비 지점: app/lib/runtime-config.ts)
#
# ★과거 방식(왜 버렸나): 빌드 산출물의 `https://matrix.org` 리터럴을 sed로
#   치환했다. 두 가지가 깨졌다.
#     1) 소스 기본값을 바꾸는 순간 치환 대상이 사라져 **조용히** 무효화된다.
#        (실제로 밟았다 — 기본값 변경 커밋에서 주입이 죽은 걸 빌드 산출물
#         grep 으로 발견)
#     2) nginx 가 gzip_static on 이라 .js.gz 를 우선 내보내므로, .js 만
#        고치면 gzip 지원 브라우저는 옛 값을 받는다. 매 부팅마다 5MB 번들을
#        재압축해야 했다.
#   설정값을 코드 밖 별도 파일로 빼면 두 결합이 모두 끊긴다.
#
# 값은 **서버 이름**(krisam.in) 또는 URL(https://krisam.in) 둘 다 받는다.
# 앱이 well-known delegation 으로 실제 API base URL 을 해석하므로 서버 이름
# 표기를 권장한다.
#
# DEFAULT_HOMESERVER 가 비어 있으면 config.js 를 만들지 않는다 — 앱은
# 빌트인 fallback(matrix.org)으로 동작한다. 이미지는 generic 하게 유지.
#
# nginx 공식 entrypoint 가 /docker-entrypoint.d/*.sh 를 알파벳 순으로 실행한
# 뒤 nginx 를 띄운다. 여기서 exec nginx 하지 말 것.
set -eu

if [ -z "${DEFAULT_HOMESERVER:-}" ]; then
  echo "[40-runtime-config] DEFAULT_HOMESERVER not set — serving generic build (matrix.org)"
  # 이전 컨테이너 레이어/재시작 잔재가 남지 않도록 정리 (읽기 전용이면 무시)
  rm -f /run/matrix-client/config.js /usr/share/nginx/html/config.js 2>/dev/null || true
  exit 0
fi

# 쓰기 가능한 위치를 찾는다. 순서:
#   1) RUNTIME_CONFIG_DIR (명시 지정)
#   2) /run/matrix-client — nginx.conf 가 /config.js 를 여기서 먼저 찾는다.
#      readOnlyRootFilesystem=true 여도 /run 은 보통 쓰기 가능한 tmpfs/emptyDir.
#   3) /usr/share/nginx/html — 평범한 docker run
for dir in ${RUNTIME_CONFIG_DIR:-} /run/matrix-client /usr/share/nginx/html; do
  [ -n "$dir" ] || continue
  mkdir -p "$dir" 2>/dev/null || continue
  if { : > "$dir/config.js"; } 2>/dev/null; then
    TARGET="$dir/config.js"
    break
  fi
done

# readOnlyRootFilesystem 등으로 쓸 곳이 없을 때. 여기서 죽으면 nginx 가 아예
# 안 뜬다 (실측: exit 1). 설정 주입만 포기하고 앱은 띄우는 편이 낫다.
if [ -z "${TARGET:-}" ]; then
  echo "[40-runtime-config] WARNING: no writable location for config.js"
  echo "[40-runtime-config]   (tried RUNTIME_CONFIG_DIR, /run/matrix-client, html dir)"
  echo "[40-runtime-config]   mount a writable volume at /run/matrix-client to enable"
  echo "[40-runtime-config]   DEFAULT_HOMESERVER. Continuing with built-in default."
  exit 0
fi

# JS 문자열 리터럴에 안전하게 넣기 위해 역슬래시·따옴표를 이스케이프.
ESCAPED=$(printf '%s' "$DEFAULT_HOMESERVER" | sed -e 's/\\/\\\\/g' -e "s/'/\\\\'/g")

cat > "$TARGET" <<EOF
window.__MATRIX_CLIENT_CONFIG__ = { defaultHomeserver: '${ESCAPED}' };
EOF

echo "[40-runtime-config] wrote ${TARGET} (defaultHomeserver=${DEFAULT_HOMESERVER})"
