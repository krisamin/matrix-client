import {
  index,
  layout,
  type RouteConfig,
  route,
} from "@react-router/dev/routes";

export default [
  // 인증된 앱 셸: 사이드바(트리) + 메인 페인
  layout("routes/app-layout.tsx", [
    index("routes/home.tsx"),
    route("room/:roomId", "routes/room.tsx", [
      // 스레드는 방의 자식 라우트 — room.tsx가 분할/풀 레이아웃 결정
      route("thread/:threadId", "routes/room.thread.tsx"),
    ]),
  ]),
  route("login", "routes/login.tsx"),
  route("oidc/callback", "routes/oidc.callback.tsx"),
  route("verify", "routes/verify.tsx"),
  // 인증 없는 스크롤 동작 테스트 (개발용 — virtua reverse scroll 검증)
  route("_scrolltest", "routes/scrolltest.tsx"),
] satisfies RouteConfig;
