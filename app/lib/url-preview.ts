import type { MatrixClient } from "matrix-js-sdk";

/** 메시지 본문에서 http(s) URL을 추출 (최대 maxCount개).
 *  코드블록/인라인코드 안의 URL은 미리보기 대상에서 제외. */
export function extractPreviewUrls(body: string, maxCount = 3): string[] {
  if (!body) return [];
  // 코드블록(```...```)과 인라인코드(`...`)를 제거해 그 안의 URL은 무시
  const withoutCode = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ");
  const re = /https?:\/\/[^\s<>()]+/g;
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const m of withoutCode.matchAll(re)) {
    // 끝의 문장부호 정리
    const url = m[0].replace(/[.,;:!?)\]]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= maxCount) break;
  }
  return urls;
}

/** OG 미리보기 정규화 결과. 표시할 게 없으면 null. */
export interface UrlPreviewData {
  url: string;
  title?: string;
  description?: string;
  /** http(s)로 변환된 썸네일 URL */
  imageUrl?: string;
  siteName?: string;
}

/** homeserver /preview_url로 OG 메타데이터 조회 후 정규화.
 *  실패하거나 표시할 내용(제목/설명/이미지)이 없으면 null. */
export async function fetchUrlPreview(
  client: MatrixClient,
  url: string,
): Promise<UrlPreviewData | null> {
  try {
    const og = await client.getUrlPreview(url, Date.now());
    const title = str(og["og:title"]);
    const description = str(og["og:description"]);
    const siteName = str(og["og:site_name"]);
    const mxc = str(og["og:image"]);
    let imageUrl: string | undefined;
    if (mxc?.startsWith("mxc://")) {
      imageUrl =
        client.mxcUrlToHttp(mxc, 400, 400, "scale", false, true, true) ??
        undefined;
    } else if (mxc?.startsWith("http")) {
      imageUrl = mxc;
    }
    // 표시할 게 하나도 없으면 카드 안 띄움
    if (!title && !description && !imageUrl) return null;
    return { url, title, description, imageUrl, siteName };
  } catch (e) {
    console.warn("URL 미리보기 실패:", url, e);
    return null;
  }
}

function str(v: undefined | string | number): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}
