import type { MatrixClient } from "matrix-js-sdk";
import { useEffect, useState } from "react";
import { fetchUrlPreview, type UrlPreviewData } from "../lib/url-preview";

/** URL 미리보기 카드 묶음 — 본문에서 뽑은 URL들의 OG 카드.
 *  각 URL을 비동기로 조회, 표시할 내용 있는 것만 렌더. */
export function UrlPreviews({
  client,
  urls,
}: {
  client: MatrixClient;
  urls: string[];
}) {
  const [previews, setPreviews] = useState<UrlPreviewData[]>([]);

  // urls는 매 렌더 새 배열 — 내용(조인)을 안정 키로 사용
  const urlsKey = urls.join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: urlsKey가 urls 내용을 추적
  useEffect(() => {
    let alive = true;
    setPreviews([]);
    (async () => {
      const results = await Promise.all(
        urls.map((u) => fetchUrlPreview(client, u)),
      );
      if (!alive) return;
      setPreviews(results.filter((r): r is UrlPreviewData => r !== null));
    })();
    return () => {
      alive = false;
    };
  }, [client, urlsKey]);

  if (previews.length === 0) return null;

  return (
    <div className="mt-1 flex flex-col gap-1.5">
      {previews.map((p) => (
        <a
          key={p.url}
          href={p.url}
          target="_blank"
          rel="noreferrer noopener"
          className="flex gap-2.5 overflow-hidden rounded-lg border border-line bg-bg-1 p-2 hover:bg-bg-2"
        >
          {p.imageUrl && (
            <img
              src={p.imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-14 w-14 shrink-0 rounded-md object-cover"
            />
          )}
          <span className="flex min-w-0 flex-col justify-center gap-0.5">
            {p.siteName && (
              <span className="truncate text-[11px] text-fg-3">
                {p.siteName}
              </span>
            )}
            {p.title && (
              <span className="truncate text-[13px] font-medium text-fg-0">
                {p.title}
              </span>
            )}
            {p.description && (
              <span className="line-clamp-2 text-[12px] text-fg-2">
                {p.description}
              </span>
            )}
          </span>
        </a>
      ))}
    </div>
  );
}
