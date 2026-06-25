import type { MatrixClient } from "matrix-js-sdk";

/** 내 프로필 정보 (표시이름 + 아바타 mxc). 실패 시 부분/빈 값. */
export interface MyProfile {
  displayName: string;
  avatarUrl?: string;
}

/** 내 프로필 조회 (homeserver). */
export async function getMyProfile(client: MatrixClient): Promise<MyProfile> {
  const userId = client.getUserId() ?? "";
  try {
    const res = await client.getProfileInfo(userId);
    return { displayName: res.displayname ?? "", avatarUrl: res.avatar_url };
  } catch (e) {
    console.warn("프로필 조회 실패:", e);
    return { displayName: "" };
  }
}

/** 표시이름 변경. */
export async function setMyDisplayName(
  client: MatrixClient,
  name: string,
): Promise<void> {
  await client.setDisplayName(name);
}

/** 아바타 이미지 업로드 후 프로필 아바타로 설정. 반환: 새 mxc URL. */
export async function setMyAvatar(
  client: MatrixClient,
  file: File,
): Promise<string> {
  const { content_uri } = await client.uploadContent(file, {
    type: file.type || "application/octet-stream",
  });
  await client.setAvatarUrl(content_uri);
  return content_uri;
}
