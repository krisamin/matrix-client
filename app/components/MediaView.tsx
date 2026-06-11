import { type MatrixClient, type MatrixEvent, MsgType } from "matrix-js-sdk";
import { useEffect, useState } from "react";
import { getMediaBlobUrl, type MediaSource } from "../lib/media";

/** 이미지/비디오/오디오/파일 첨부 렌더 (인증 미디어 + E2EE 복호화 처리) */
export function MediaView({
  client,
  ev,
}: {
  client: MatrixClient;
  ev: MatrixEvent;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const content = ev.getContent();
  const msgtype = content.msgtype as string;

  useEffect(() => {
    // content는 매 렌더 새 객체 — ev 기준으로만 재실행 (수정 시 ev 교체됨)
    const c = ev.getContent();
    const source: MediaSource = {
      url: c.url,
      file: c.file,
      mimetype: c.info?.mimetype,
    };
    const promise = getMediaBlobUrl(client, source);
    if (!promise) {
      setError("미디어 URL 없음");
      return;
    }
    let alive = true;
    promise
      .then((u) => alive && setBlobUrl(u))
      .catch(
        (e) => alive && setError(e instanceof Error ? e.message : String(e)),
      );
    return () => {
      alive = false;
    };
  }, [client, ev]);

  if (error) return <span className="text-sm text-red-400">⚠ {error}</span>;
  if (!blobUrl)
    return <span className="text-sm text-gray-400">미디어 로딩 중...</span>;

  switch (msgtype) {
    case MsgType.Image:
      return (
        <a href={blobUrl} target="_blank" rel="noreferrer">
          <img
            src={blobUrl}
            alt={content.body ?? "이미지"}
            className="max-h-80 max-w-full rounded-lg object-contain"
          />
        </a>
      );
    case MsgType.Video:
      return (
        <video
          src={blobUrl}
          controls
          className="max-h-80 max-w-full rounded-lg"
        />
      );
    case MsgType.Audio:
      return <audio src={blobUrl} controls />;
    default:
      return (
        <a
          href={blobUrl}
          download={content.body ?? "file"}
          className="text-blue-500 underline"
        >
          📎 {content.body ?? "파일 다운로드"}
        </a>
      );
  }
}
