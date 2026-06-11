import { type MatrixClient, type MatrixEvent, MsgType } from "matrix-js-sdk";
import { useEffect, useState } from "react";
import { getMediaBlobUrl, type MediaSource } from "../lib/media";
import { openLightbox, registerLightboxImage } from "./Lightbox";

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

  // 이미지면 라이트박스 ←/→ 내비게이션 목록에 등록 (타임라인 마운트 동안)
  useEffect(() => {
    if (msgtype !== MsgType.Image || !blobUrl) return;
    return registerLightboxImage({
      key: ev.getId() ?? blobUrl,
      ts: ev.getTs(),
      url: blobUrl,
      name: (ev.getContent().body as string) ?? "이미지",
    });
  }, [msgtype, blobUrl, ev]);

  if (error) return <span className="text-[12px] text-red-400">⚠ {error}</span>;
  if (!blobUrl)
    return <span className="text-[12px] text-fg-3">미디어 불러오는 중...</span>;

  switch (msgtype) {
    case MsgType.Image:
      return (
        <button
          type="button"
          className="block cursor-zoom-in"
          onClick={() => openLightbox(blobUrl, content.body ?? "이미지")}
          title="크게 보기"
        >
          <img
            src={blobUrl}
            alt={content.body ?? "이미지"}
            className="max-h-80 max-w-full rounded-lg border border-line object-contain"
          />
        </button>
      );
    case MsgType.Video:
      return (
        <video
          src={blobUrl}
          controls
          className="max-h-80 max-w-full rounded-lg border border-line"
        />
      );
    case MsgType.Audio:
      return <audio src={blobUrl} controls />;
    default:
      return (
        <a
          href={blobUrl}
          download={content.body ?? "file"}
          className="text-fg-0 underline underline-offset-2"
        >
          📎 {content.body ?? "파일 다운로드"}
        </a>
      );
  }
}
