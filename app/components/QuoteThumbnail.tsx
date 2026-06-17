import type { MatrixClient } from "matrix-js-sdk";
import type { EncryptedFile } from "matrix-js-sdk/lib/@types/media";
import { useEffect, useState } from "react";
import { getMediaBlobUrl } from "../lib/media";

/** 인용/미리보기 박스용 작은 정사각 썸네일 (기본 28px).
 *  reply.ts thumbnailSource()가 뽑은 {url|file, mimetype}을 받아
 *  getMediaBlobUrl(평문 mxc + E2EE 첨부 모두 처리)로 blob을 만들어 렌더.
 *  로딩 중/실패 시엔 아무것도 그리지 않음(텍스트 라벨은 호출부가 따로 표시). */
export function QuoteThumbnail({
  client,
  source,
  size = 28,
}: {
  client: MatrixClient;
  source: { url?: string; file?: unknown; mimetype?: string };
  size?: number;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const mxc = (source.file as EncryptedFile | undefined)?.url ?? source.url;

  useEffect(() => {
    if (!mxc) return;
    const promise = getMediaBlobUrl(client, {
      url: source.url,
      file: source.file as EncryptedFile | undefined,
      mimetype: source.mimetype,
    });
    if (!promise) return;
    let alive = true;
    promise.then((u) => alive && setBlobUrl(u)).catch(() => {});
    return () => {
      alive = false;
    };
    // mxc만 deps — source 객체는 매 렌더 새로 만들어지므로 URL 키로 안정화
  }, [client, mxc, source.url, source.file, source.mimetype]);

  if (!blobUrl) return null;
  return (
    <img
      src={blobUrl}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded border border-line object-cover"
      style={{ width: size, height: size }}
    />
  );
}
