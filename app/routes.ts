import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("oidc/callback", "routes/oidc.callback.tsx"),
  route("room/:roomId", "routes/room.tsx"),
] satisfies RouteConfig;
