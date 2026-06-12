import type { Room, RoomMember } from "matrix-js-sdk";

export interface Mention {
  userId: string;
  name: string;
}

/** 멘션 자동완성 후보 — 표시이름/userId 부분일치, prefix 일치 우선 */
export function searchMembers(
  room: Room,
  query: string,
  myUserId: string,
  limit = 6,
): RoomMember[] {
  const q = query.toLowerCase();
  const members = room
    .getJoinedMembers()
    .filter((m) => m.userId !== myUserId)
    .filter(
      (m) =>
        q === "" ||
        m.name.toLowerCase().includes(q) ||
        m.userId.toLowerCase().includes(q),
    );
  members.sort((a, b) => {
    const aP = a.name.toLowerCase().startsWith(q) ? 0 : 1;
    const bP = b.name.toLowerCase().startsWith(q) ? 0 : 1;
    return aP - bP || a.name.localeCompare(b.name);
  });
  return members.slice(0, limit);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 멘션 포함 메시지 content 생성 (Matrix 스펙):
 *  - body: 평문 그대로 (표시이름)
 *  - formatted_body: 표시이름 → matrix.to 링크 (Element가 알약으로 렌더)
 *  - m.mentions.user_ids: 멘션 대상 (서버/클라 알림 라우팅용, MSC3952) */
export function buildMentionContent(
  text: string,
  mentions: Mention[],
): Record<string, unknown> {
  // 전송 시점에 본문에 아직 남아있는 멘션만 유효
  const used = mentions.filter((m) => text.includes(m.name));
  if (used.length === 0) return { msgtype: "m.text", body: text };

  let html = escapeHtml(text).replace(/\n/g, "<br/>");
  for (const m of used) {
    const escaped = escapeHtml(m.name);
    html = html
      .split(escaped)
      .join(`<a href="https://matrix.to/#/${m.userId}">${escaped}</a>`);
  }
  return {
    msgtype: "m.text",
    body: text,
    format: "org.matrix.custom.html",
    formatted_body: html,
    "m.mentions": { user_ids: [...new Set(used.map((m) => m.userId))] },
  };
}

/** 이 이벤트가 나를 멘션하는지 (m.mentions 우선, 레거시 body 매칭 보조) */
export function mentionsUser(
  content: Record<string, unknown>,
  myUserId: string,
  myName: string,
): boolean {
  const mentions = content["m.mentions"] as { user_ids?: string[] } | undefined;
  if (mentions?.user_ids?.includes(myUserId)) return true;
  // 구식 클라이언트 fallback: body에 userId 또는 @표시이름 평문 포함
  const body = (content.body as string) ?? "";
  return (
    body.includes(myUserId) || (myName !== "" && body.includes(`@${myName}`))
  );
}
