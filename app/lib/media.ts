import {
  decryptAttachment,
  encryptAttachment,
} from "matrix-encrypt-attachment";
import type { MatrixClient } from "matrix-js-sdk";
import { MsgType } from "matrix-js-sdk";
import type { RoomMessageEventContent } from "matrix-js-sdk/lib/@types/events";
import type { EncryptedFile } from "matrix-js-sdk/lib/@types/media";

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
    if (!httpUrl) throw new Error("mxc URL conversion failed");

    const res = await fetch(httpUrl, {
      headers: { Authorization: `Bearer ${client.getAccessToken()}` },
    });
    if (!res.ok) throw new Error(`Media download failed (${res.status})`);
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

/** 아바타 등 작은 썸네일용 blob URL (인증 미디어 — fetch + Authorization).
 *  원본 다운로드를 피하고 서버 썸네일 API 사용. 평문 미디어 전용 (아바타는 비암호화) */
const thumbCache = new Map<string, Promise<string>>();

export function getThumbnailBlobUrl(
  client: MatrixClient,
  mxcUrl: string,
  size = 32,
): Promise<string> | null {
  if (!mxcUrl.startsWith("mxc://")) return null;
  const key = `${mxcUrl}@${size}`;
  const cached = thumbCache.get(key);
  if (cached) return cached;

  const promise = (async () => {
    const httpUrl = client.mxcUrlToHttp(
      mxcUrl,
      size,
      size,
      "crop",
      false,
      true,
      true, // useAuthentication
    );
    if (!httpUrl) throw new Error("mxc URL conversion failed");
    const res = await fetch(httpUrl, {
      headers: { Authorization: `Bearer ${client.getAccessToken()}` },
    });
    if (!res.ok) throw new Error(`Thumbnail download failed (${res.status})`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  })();

  thumbCache.set(key, promise);
  promise.catch(() => thumbCache.delete(key));
  return promise;
}

function msgTypeForFile(file: File): MsgType {
  if (file.type.startsWith("image/")) return MsgType.Image;
  if (file.type.startsWith("video/")) return MsgType.Video;
  if (file.type.startsWith("audio/")) return MsgType.Audio;
  return MsgType.File;
}

/** 이미지/비디오의 원본 크기 추출 (실패하면 생략) */
async function probeDimensions(
  file: File,
): Promise<{ w: number; h: number } | null> {
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("image/")) {
      return await new Promise((resolve) => {
        const img = new Image();
        img.onload = () =>
          resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve(null);
        img.src = url;
      });
    }
    if (file.type.startsWith("video/")) {
      return await new Promise((resolve) => {
        const video = document.createElement("video");
        video.onloadedmetadata = () =>
          resolve({ w: video.videoWidth, h: video.videoHeight });
        video.onerror = () => resolve(null);
        video.src = url;
      });
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 파일을 업로드하고 해당 방에 미디어 메시지로 전송한다.
 * E2EE 방이면 encryptAttachment로 암호화한 ciphertext를 올리고
 * content.file(키/iv/해시 포함)로 보낸다. 평문 방은 content.url.
 */
export async function uploadAndSendFile(
  client: MatrixClient,
  roomId: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void,
  /** 지정 시 해당 스레드로 전송 (m.thread 관계) */
  threadId?: string,
): Promise<void> {
  const room = client.getRoom(roomId);
  const encrypted = room?.hasEncryptionStateEvent() ?? false;
  const msgtype = msgTypeForFile(file);
  const dims = await probeDimensions(file);

  const info: Record<string, unknown> = {
    mimetype: file.type || "application/octet-stream",
    size: file.size,
    ...(dims ? { w: dims.w, h: dims.h } : {}),
  };

  const baseContent = { msgtype, body: file.name, info };

  if (encrypted) {
    const plaintext = await file.arrayBuffer();
    const { data, info: fileInfo } = await encryptAttachment(plaintext);
    const { content_uri } = await client.uploadContent(new Blob([data]), {
      // ciphertext는 항상 octet-stream으로 (mimetype 누출 방지)
      type: "application/octet-stream",
      progressHandler: (p) => onProgress?.(p.loaded, p.total),
    });
    await client.sendMessage(roomId, threadId ?? null, {
      ...baseContent,
      file: { ...fileInfo, url: content_uri } as EncryptedFile,
    } as unknown as RoomMessageEventContent);
  } else {
    const { content_uri } = await client.uploadContent(file, {
      type: file.type || "application/octet-stream",
      progressHandler: (p) => onProgress?.(p.loaded, p.total),
    });
    await client.sendMessage(roomId, threadId ?? null, {
      ...baseContent,
      url: content_uri,
    } as unknown as RoomMessageEventContent);
  }
}
