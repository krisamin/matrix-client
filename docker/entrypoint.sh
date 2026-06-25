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
else
  echo "[40-default-homeserver] DEFAULT_HOMESERVER not set — keeping source default (matrix.org)"
fi
