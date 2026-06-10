import type { MatrixClient } from "matrix-js-sdk";
import type { EncryptedFile } from "matrix-js-sdk/lib/@types/media";
import { decryptAttachment } from "matrix-encrypt-attachment";

/** mxc URL → blob object URL 캐시 (세션 동안 유지) */
const blobUrlCache = new Map<string, Promise<string>>();

export interface MediaSource {
  /** 평문 방: mxc:// URL */
  url?: string;
  /** E2EE 방: 암호화 파일 디스크립터 (url + 키/iv/해시) */
  file?: EncryptedFile;
  mimetype?: string;
}

/**
 * 미디어 이벤트 content에서 표시 가능한 blob URL을 만든다.
 * - Synapse 인증 미디어(MSC3916): Authorization 헤더가 필요해서 <img src> 직결 불가
 *   → fetch로 받아서 blob URL 생성
 * - E2EE 첨부: ciphertext 받아서 decryptAttachment로 복호화
 */
export function getMediaBlobUrl(
  client: MatrixClient,
  source: MediaSource,
): Promise<string> | null {
  const mxcUrl = source.file?.url ?? source.url;
  if (!mxcUrl?.startsWith("mxc://")) return null;

  const cached = blobUrlCache.get(mxcUrl);
  if (cached) return cached;

  const promise = (async () => {
    const httpUrl = client.mxcUrlToHttp(
      mxcUrl,
      undefined,
      undefined,
      undefined,
      false,
      true,
      true, // useAuthentication
    );
    if (!httpUrl) throw new Error("mxc URL 변환 실패");

    const res = await fetch(httpUrl, {
      headers: { Authorization: `Bearer ${client.getAccessToken()}` },
    });
    if (!res.ok) throw new Error(`미디어 다운로드 실패 (${res.status})`);
    let buffer = await res.arrayBuffer();

    if (source.file) {
      buffer = await decryptAttachment(buffer, source.file);
    }
    const blob = new Blob([buffer], {
      type: source.mimetype ?? "application/octet-stream",
    });
    return URL.createObjectURL(blob);
  })();

  // 실패한 promise는 캐시에서 제거해 재시도 가능하게
  blobUrlCache.set(mxcUrl, promise);
  promise.catch(() => blobUrlCache.delete(mxcUrl));
  return promise;
}
