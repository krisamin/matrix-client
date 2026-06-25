import { Upload } from "lucide-react";
import type { MatrixClient, Room } from "matrix-js-sdk";
import { useEffect, useRef, useState } from "react";
import { useT } from "../../lib/i18n";
import {
  canSendStateEvent,
  setRoomAvatar,
  setRoomNameAndTopic,
} from "../../lib/matrix";
import { RoomAvatar } from "../Avatar";
import { Footer, Row } from "./_shared";

/* ──────────── 일반 탭: 이름·주제·아바타 ──────────── */

export function GeneralTab({
  client,
  room,
  onClose,
}: {
  client: MatrixClient;
  room: Room;
  onClose: () => void;
}) {
  const t = useT();
  const initialName = room.name;
  const initialTopic =
    room.currentState.getStateEvents("m.room.topic", "")?.getContent().topic ??
    "";
  const [name, setName] = useState(initialName);
  const [topic, setTopic] = useState(initialTopic);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canName = canSendStateEvent(room, client, "m.room.name");
  const canTopic = canSendStateEvent(room, client, "m.room.topic");
  const canAvatar = canSendStateEvent(room, client, "m.room.avatar");

  // 새로 고른 파일의 로컬 미리보기 (objectURL) — ProfileEdit 패턴 그대로
  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError(t("roomSettings.imageOnly"));
      return;
    }
    setError(null);
    setPendingFile(f);
  }

  const dirty =
    name.trim() !== initialName ||
    topic !== initialTopic ||
    pendingFile !== null;

  async function save() {
    if (busy || !dirty) return;
    setBusy(true);
    setError(null);
    try {
      const changes: { name?: string; topic?: string } = {};
      if (name.trim() !== initialName) changes.name = name.trim();
      if (topic !== initialTopic) changes.topic = topic;
      if (changes.name || changes.topic) {
        await setRoomNameAndTopic(client, room.roomId, changes);
      }
      if (pendingFile) {
        const up = await client.uploadContent(pendingFile, {
          type: pendingFile.type,
        });
        await setRoomAvatar(client, room.roomId, up.content_uri);
        setPendingFile(null);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* 아바타 영역 — ProfileEditModal과 동일한 헤더 띠 톤.
         *  현재 방 아바타가 즉시 보이고 (RoomAvatar는 mxc 자동 해석),
         *  클릭/호버 Upload 오버레이로 이미지 변경. 새 파일 고르면 로컬 미리보기. */}
        <div className="flex flex-col items-center gap-2 border-b border-line bg-bg-2/30 px-4 py-5">
          <button
            type="button"
            className="group relative rounded-md disabled:cursor-not-allowed"
            onClick={() => fileRef.current?.click()}
            disabled={!canAvatar}
            title={t(
              canAvatar
                ? "roomSettings.changeAvatar"
                : "roomSettings.noPermission",
            )}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={t("roomSettings.newAvatarPreview")}
                className="h-20 w-20 rounded-md object-cover"
              />
            ) : (
              <RoomAvatar client={client} room={room} size={80} />
            )}
            {canAvatar && (
              <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <Upload className="h-5 w-5 text-white" />
              </span>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={pickFile}
          />
          <span className="font-mono text-[11px] text-fg-3">{room.roomId}</span>
        </div>

        {/* 필드 — divide-y row */}
        <div className="flex flex-col divide-y divide-line">
          <Row label={t("roomSettings.field.name")}>
            <input
              type="text"
              value={name}
              disabled={!canName}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 bg-transparent py-2.5 pl-3 pr-4 text-[13px] text-fg-0 outline-none placeholder:text-fg-3 disabled:opacity-50"
            />
          </Row>
          <Row label={t("roomSettings.field.topic")}>
            <input
              type="text"
              value={topic}
              disabled={!canTopic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={t("roomSettings.topic.placeholder")}
              className="flex-1 bg-transparent py-2.5 pl-3 pr-4 text-[13px] text-fg-0 outline-none placeholder:text-fg-3 disabled:opacity-50"
            />
          </Row>
          {error && (
            <p className="px-4 py-2.5 text-[12px] text-red-400">{error}</p>
          )}
        </div>
      </div>
      <Footer busy={busy} dirty={dirty} onCancel={onClose} onSave={save} />
    </>
  );
}
