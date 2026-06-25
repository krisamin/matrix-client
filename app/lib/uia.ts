import {
  createClient,
  type MatrixClient,
  type MatrixError,
} from "matrix-js-sdk";

/** input "https://matrix.example.com" / "matrix.example.com" / "@user:example.com"
 *  → https URL + .well-known 따라가서 진짜 base URL. */
export async function discoverHomeserver(input: string): Promise<string> {
  let raw = input.trim();
  if (raw.startsWith("@") && raw.includes(":")) {
    raw = raw.split(":").slice(1).join(":");
  }
  const url = raw.match(/^https?:\/\//) ? raw : `https://${raw}`;
  const cleaned = url.replace(/\/+$/, "");
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

export type { MatrixClient, MatrixError };
// Re-export for callers that need to make their own client
export { createClient };
