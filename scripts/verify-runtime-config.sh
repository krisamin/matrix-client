#!/usr/bin/env bash
# 런타임 설정 주입(/config.js) 실물 검증 — 실제로 이미지를 굽고 컨테이너를
# 띄워서 확인한다. 단위 테스트로는 절대 못 잡는 층이다.
#
# ## 왜 이게 있나 (실제 사고 2건)
#
# 1) 기본 홈서버를 바꾼 커밋에서 DEFAULT_HOMESERVER 주입이 조용히 죽었다.
#    옛 entrypoint 는 번들 안의 `https://matrix.org` 리터럴을 sed 로 치환했는데,
#    소스 기본값이 바뀌자 치환 대상이 사라졌다. 앱은 멀쩡히 뜨고 CI 도 전부
#    초록이라 배포 후에야 발견된다.
#
# 2) helm chart 의 readOnlyRootFilesystem=true 조건에서 그 sed 가 실패해
#    nginx 가 아예 뜨지 않았다 (실측 exit 1). helm lint 는 렌더링만 보므로
#    못 잡는다.
#
# 두 사고 모두 "컨테이너를 실제로 띄워봐야만" 보인다.
#
# 실행:
#   scripts/verify-runtime-config.sh            # 이미지를 새로 빌드
#   IMAGE=ghcr.io/krisamin/matrix-client:latest scripts/verify-runtime-config.sh
set -u

IMAGE="${IMAGE:-}"
BASE_PORT="${BASE_PORT:-18830}"
fail=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1"; fail=1; }

names="mcv-plain mcv-generic mcv-ro"
# 검증용 홈서버 값. 번들에 하드코딩됐는지 grep 으로 확인하므로, 소스에 이미
# 등장하는 문자열(로그인 폼 placeholder 의 example.com 등)과 겹치면 안 된다.
PROBE="verify-probe-homeserver.invalid"

cleanup() { for n in $names; do docker rm -f "$n" >/dev/null 2>&1; done; }
trap cleanup EXIT
cleanup

if [ -z "$IMAGE" ]; then
  IMAGE=matrix-client-verify:local
  echo "=== 이미지 빌드 ($IMAGE)"
  docker build -q -t "$IMAGE" . >/dev/null || { echo "  ✗ 빌드 실패"; exit 1; }
  echo "  ✓ 빌드 완료"
  echo
fi

wait_up() {
  for _ in $(seq 1 60); do
    curl -sf -o /dev/null "http://localhost:$1/" && return 0
    sleep 0.5
  done
  return 1
}

p1=$BASE_PORT
p2=$((BASE_PORT + 1))
p3=$((BASE_PORT + 2))

echo "=== A: DEFAULT_HOMESERVER 설정"
docker run -d --name mcv-plain -e "DEFAULT_HOMESERVER=$PROBE" \
  -p "$p1:80" "$IMAGE" >/dev/null
wait_up "$p1" || bad "컨테이너가 뜨지 않음"

body=$(curl -s "http://localhost:$p1/config.js")
echo "$body" | grep -q "defaultHomeserver: '$PROBE'" \
  && ok "config.js 에 주입됨" || bad "주입 실패: $body"

ct=$(curl -s -o /dev/null -w '%{content_type}' "http://localhost:$p1/config.js")
echo "$ct" | grep -qi javascript && ok "content-type=$ct" || bad "content-type=$ct"

curl -sI "http://localhost:$p1/config.js" | grep -qi 'cache-control:.*no-store' \
  && ok "Cache-Control: no-store" || bad "캐시 헤더 없음 — 값 변경이 반영 안 된다"

curl -s "http://localhost:$p1/" | grep -q '/config.js' \
  && ok "index.html 이 /config.js 를 로드" || bad "script 태그 없음"

# 사고 1 재발 방지: 배포처 값이 번들에 박히면 안 된다
bundle=$(docker exec mcv-plain sh -c 'ls /usr/share/nginx/html/assets/login-*.js | head -1')
docker exec mcv-plain grep -q "$PROBE" "$bundle" \
  && bad "번들에 배포처 값 하드코딩됨" || ok "번들은 배포처 중립"

echo
echo "=== B: env 미설정 (generic 이미지)"
docker run -d --name mcv-generic -p "$p2:80" "$IMAGE" >/dev/null
wait_up "$p2" || bad "컨테이너가 뜨지 않음"
code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$p2/config.js")
# 404 여야 한다. SPA fallback 으로 index.html(HTML)이 나가면 <script> 가
# HTML 을 실행해 문법 에러가 난다.
[ "$code" = "404" ] && ok "config.js 404 (SPA HTML fallback 아님)" \
  || bad "config.js 가 $code — HTML 이 script 로 실행될 수 있다"

echo
echo "=== C: readOnlyRootFilesystem (helm chart 기본 조건) — 사고 2"
docker run -d --name mcv-ro --read-only \
  --tmpfs /var/cache/nginx --tmpfs /var/run \
  -e "DEFAULT_HOMESERVER=$PROBE" -p "$p3:80" "$IMAGE" >/dev/null 2>&1
sleep 4
st=$(docker inspect -f '{{.State.Status}}' mcv-ro 2>/dev/null)
if [ "$st" = "running" ]; then
  ok "컨테이너 기동 (옛 sed 방식은 여기서 exit 1)"
  curl -s "http://localhost:$p3/config.js" | grep -q "defaultHomeserver: '$PROBE'" \
    && ok "읽기 전용 루트에서도 주입 동작" || bad "주입 실패"
else
  bad "컨테이너 죽음 (status=$st)"
  docker logs mcv-ro 2>&1 | tail -5 | sed 's/^/      /'
fi

echo
echo "=== D: 회귀 — SPA 라우팅 / gzip_static"
for p in /login /room/x /oidc/callback /sw.js; do
  c=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$p1$p")
  [ "$c" = "200" ] && ok "$p 200" || bad "$p $c"
done

# ※ curl --write-out 에 content_encoding 변수는 없다 (unknown variable).
#    헤더를 직접 읽어야 한다.
asset=$(curl -s "http://localhost:$p1/" | grep -oE '/assets/[A-Za-z0-9._-]+\.js' | head -1)
enc=$(curl -sI -H 'Accept-Encoding: gzip' "http://localhost:$p1$asset" \
      | grep -i '^content-encoding' | tr -d '\r' | awk '{print $2}')
[ "$enc" = "gzip" ] && ok "gzip_static 동작 ($asset)" \
  || bad "gzip 안 됨 — WASM 5.4MB 가 무압축으로 나간다"

echo
[ "$fail" = "0" ] && echo "RESULT: ALL PASS" || echo "RESULT: FAIL"
exit "$fail"
