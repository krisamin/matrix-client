import type { Room, RoomMember } from "matrix-js-sdk";
import { hasMarkdown, markdownToMatrixHtml } from "./markdown";

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

/** 멘션 포함 + 마크다운 처리 메시지 content 생성 (Matrix 스펙):
 *  - body: 평문 원본 (마크다운 원문 그대로 → 봇/구식 클라이언트가 파싱 가능)
 *  - formatted_body: 마크다운 → HTML 변환 후 표시이름을 matrix.to 링크로 치환
 *  - m.mentions.user_ids: 멘션 대상 (MSC3952)
 *
 *  마크다운 없고 멘션도 없는 평문이면 formatted_body를 안 붙여 사이즈 절약. */
export function buildMentionContent(
  text: string,
  mentions: Mention[] = [],
): Record<string, unknown> {
  const used = mentions.filter((m) => text.includes(m.name));
  const md = hasMarkdown(text);

  // 마크다운도 멘션도 없으면 평문만
  if (!md && used.length === 0) {
    return { msgtype: "m.text", body: text };
  }

  // HTML 빌드:
  //  - 마크다운 있으면 marked로 변환 (자체 escape 처리됨)
  //  - 없으면 escape 후 줄바꿈 → <br/>
  let html = md
    ? markdownToMatrixHtml(text)
    : escapeHtml(text).replace(/\n/g, "<br/>");

  // 멘션 표시이름을 matrix.to 링크로 치환. marked가 텍스트 노드를 자동 escape
  // 하므로 escaped 형태로 찾아 바꿈. 코드블록 안에 멘션 표시이름이 들어가면
  // 거기도 치환되는데(드문 케이스) 보내는 사람 의도가 멘션이라면 알림은
  // m.mentions로 어차피 가니 큰 문제 없음.
  for (const m of used) {
    const escaped = escapeHtml(m.name);
    html = html
      .split(escaped)
      .join(`<a href="https://matrix.to/#/${m.userId}">${escaped}</a>`);
  }

  const content: Record<string, unknown> = {
    msgtype: "m.text",
    body: text,
    format: "org.matrix.custom.html",
    formatted_body: html,
  };
  if (used.length > 0) {
    content["m.mentions"] = {
      user_ids: [...new Set(used.map((m) => m.userId))],
    };
  }
  return content;
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
