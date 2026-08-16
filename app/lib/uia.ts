/** 사용자 입력에서 "서버 이름"만 뽑는다. `@user:krisam.in` → `krisam.in`,
 *  `https://krisam.in/` → `krisam.in`.
 *
 *  discoverHomeserver 가 반환하는 **API base URL 과는 다른 값**이다. apex
 *  well-known delegation 을 쓰는 서버(krisam.in → matrix.krisam.in)에서
 *  둘을 섞으면, 사용자가 `krisam.in` 을 입력해도 다음 방문 때 폼에
 *  delegation 결과인 `https://matrix.krisam.in` 이 되살아난다.
 *  화면 표시·기억용은 이 함수, 실제 API 호출용은 discoverHomeserver. */
export function serverNameFromInput(input: string): string {
  let raw = input.trim();
  if (raw.startsWith("@") && raw.includes(":")) {
    raw = raw.split(":").slice(1).join(":");
  }
  return raw.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

/** input "https://matrix.example.com" / "matrix.example.com" / "@user:example.com"
 *  → https URL + .well-known 따라가서 진짜 base URL.
 *  스킴을 명시하면 보존한다 (`http://localhost:8008` 같은 로컬 홈서버). */
export async function discoverHomeserver(input: string): Promise<string> {
  const trimmed = input.trim();
  const scheme = trimmed.startsWith("http://") ? "http://" : "https://";
  const cleaned = scheme + serverNameFromInput(trimmed);
  try {
    const r = await fetch(`${cleaned}/.well-known/matrix/client`, {
      method: "GET",
    });
    if (!r.ok) return cleaned;
    const data = (await r.json()) as {
      "m.homeserver"?: { base_url?: string };
    };
    const base = data["m.homeserver"]?.base_url;
    if (typeof base === "string" && base.match(/^https?:\/\//)) {
      return base.replace(/\/+$/, "");
    }
  } catch {
    // ignore
  }
  return cleaned;
}

export function buildIdentifier(
  value: string,
):
  | { type: "m.id.thirdparty"; medium: "email"; address: string }
  | { type: "m.id.user"; user: string } {
  const v = value.trim();
  if (v.includes("@") && !v.startsWith("@") && v.includes(".")) {
    return { type: "m.id.thirdparty", medium: "email", address: v };
  }
  const user = v.startsWith("@") ? v.slice(1).split(":")[0] : v;
  return { type: "m.id.user", user: user ?? "" };
}
