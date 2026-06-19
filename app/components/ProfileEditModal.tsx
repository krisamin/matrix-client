import { Loader2, Upload } from "lucide-react";
import type { MatrixClient } from "matrix-js-sdk";
import { useEffect, useRef, useState } from "react";
import { getMyProfile, setMyAvatar, setMyDisplayName } from "../lib/matrix";
import { Avatar } from "./Avatar";

/** 내 프로필 편집 모달.
 *  - 표시이름 변경 + 아바타 이미지 업로드
 *  - 변경된 항목만 저장 (이름/아바타 각각 독립)
 *  - 백드롭/Esc로 닫힘 */
export function ProfileEditModal({
  client,
  onClose,
}: {
  client: MatrixClient;
  onClose: () => void;
}) {
  const userId = client.getUserId() ?? "";
  const [name, setName] = useState("");
  const [initialName, setInitialName] = useState("");
  const [avatarMxc, setAvatarMxc] = useState<string | undefined>(undefined);
  // 새로 고른 파일의 로컬 미리보기 (objectURL)
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 현재 프로필 로드
  useEffect(() => {
    let alive = true;
    (async () => {
      const p = await getMyProfile(client);
      if (!alive) return;
      setName(p.displayName);
      setInitialName(p.displayName);
      setAvatarMxc(p.avatarUrl);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [client]);

  // Esc로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 미리보기 objectURL 정리
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
      setError("이미지 파일만 가능해");
      return;
    }
    setError(null);
    setPendingFile(f);
  }

  const dirty = name.trim() !== initialName || pendingFile !== null;

  async function save() {
    if (busy || !dirty) return;
    setBusy(true);
    setError(null);
    try {
      // 이름 먼저 (바뀐 경우만)
      if (name.trim() !== initialName) {
        await setMyDisplayName(client, name.trim());
        setInitialName(name.trim());
      }
      // 아바타 (새로 고른 경우만)
      if (pendingFile) {
        const mxc = await setMyAvatar(client, pendingFile);
        setAvatarMxc(mxc);
        setPendingFile(null);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const localpart = userId.replace(/^@/, "").split(":")[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[15vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-[400px] max-w-[90vw] overflow-hidden rounded-xl border border-line bg-bg-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-semibold text-fg-0">프로필 편집</h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-fg-3">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            {/* 아바타 */}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                className="group relative rounded-full"
                onClick={() => fileRef.current?.click()}
                title="아바타 변경"
              >
                {previewUrl ? (
                  // 새로 고른 이미지 로컬 미리보기
                  <img
                    src={previewUrl}
                    alt="새 아바타 미리보기"
                    className="h-20 w-20 rounded-full object-cover"
                  />
                ) : (
                  <Avatar
                    client={client}
                    mxcUrl={avatarMxc}
                    name={name || localpart}
                    shape="round"
                    size={80}
                  />
                )}
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <Upload className="h-5 w-5 text-white" />
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={pickFile}
              />
              <span className="font-mono text-[11px] text-fg-3">{userId}</span>
            </div>

            {/* 표시이름 */}
            <label className="flex flex-col gap-1">
              <span className="text-[12px] text-fg-2">표시 이름</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={localpart}
                className="w-full rounded-lg border border-line bg-bg-2 px-3 py-2 text-fg-0 outline-none placeholder:text-fg-3 focus:border-line-strong"
              />
            </label>

            {error && <p className="text-[12px] text-red-400">{error}</p>}

            <div className="mt-1 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-[13px] text-fg-2 hover:bg-bg-2 hover:text-fg-0"
                onClick={onClose}
              >
                취소
              </button>
              <button
                type="button"
                disabled={busy || !dirty}
                onClick={save}
                className="rounded-lg bg-bg-3 px-3 py-1.5 text-[13px] font-medium text-fg-0 hover:bg-line-strong disabled:opacity-50"
              >
                {busy ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
