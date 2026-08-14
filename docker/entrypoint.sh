#!/bin/sh
# Runtime config injection — replace the bundled fallback homeserver URL
# (https://matrix.org) with whatever the operator set via DEFAULT_HOMESERVER.
#
# Idempotent: sed only matches the literal matrix.org URL.  Re-running with
# the same DEFAULT_HOMESERVER no-ops; switching to a new one only requires
# a pod restart because previous injections leave no matrix.org to match.
#
# Empty / unset DEFAULT_HOMESERVER leaves the source default in place — the
# image is generic and works for anyone without forcing a homeserver.
#
# Installed at /docker-entrypoint.d/40-default-homeserver.sh — nginx's
# official entrypoint executes every *.sh there in alphabetical order
# before launching nginx itself.  Do NOT exec nginx here.
set -e

if [ -n "${DEFAULT_HOMESERVER:-}" ]; then
  echo "[40-default-homeserver] injecting DEFAULT_HOMESERVER=${DEFAULT_HOMESERVER} into JS bundle"
  find /usr/share/nginx/html/assets -name '*.js' -exec \
    sed -i "s|https://matrix.org|${DEFAULT_HOMESERVER}|g" {} +

  # ★필수: 이미지에는 빌드 때 만든 .js.gz 가 함께 들어있고 nginx는
  #   gzip_static on 이라 .gz 를 **우선** 내보낸다. 위 sed는 .js만 고치므로
  #   .gz를 그대로 두면 gzip 지원 브라우저(=사실상 전부)는 옛 matrix.org가
  #   박힌 번들을 받는다 → 홈서버 주입이 조용히 무효화된다.
  #   그래서 수정한 .js를 다시 압축해 .gz를 갱신한다.
  echo "[40-default-homeserver] re-compressing modified .js for gzip_static"
  find /usr/share/nginx/html/assets -name '*.js' -exec \
    gzip -9 -k -f {} +
else
  echo "[40-default-homeserver] DEFAULT_HOMESERVER not set — keeping source default (matrix.org)"
fi
