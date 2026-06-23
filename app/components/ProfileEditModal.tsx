import { Loader2, Upload } from "lucide-react";
import type { MatrixClient } from "matrix-js-sdk";
import { useEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { getMyProfile, setMyAvatar, setMyDisplayName } from "../lib/matrix";
import { Avatar } from "./Avatar";

/** 내 {t("modal.profile.title")} 모달 (B-final 톤). */
export function ProfileEditModal({
  client,
  onClose,
}: {
  client: MatrixClient;
  onClose: () => void;
}) {
  const t = useT();
  const userId = client.getUserId() ?? "";
  const [name, setName] = useState("");
  const [initialName, setInitialName] = useState("");
  const [avatarMxc, setAvatarMxc] = useState<string | undefined>(undefined);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
      setError(t("profile.imageOnly"));
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
      if (name.trim() !== initialName) {
        await setMyDisplayName(client, name.trim());
        setInitialName(name.trim());
      }
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
        className="w-[400px] max-w-[90vw] overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <header className="flex h-12 items-center border-b border-line pl-5">
          <h2 className="font-semibold text-fg-0">
            {t("modal.profile.title")}
          </h2>
        </header>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-fg-3">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <>
            {/* 아바타 영역 — 카드 상단 */}
            <div className="flex flex-col items-center gap-2 border-b border-line bg-bg-2/30 px-5 py-5">
              <button
                type="button"
                className="group relative rounded-full"
                onClick={() => fileRef.current?.click()}
                title={t("profile.changeAvatar")}
              >
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={t("profile.changeAvatar")}
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
              <span className="text-[11px] text-fg-3">{userId}</span>
            </div>

            {/* 필드 */}
            <div className="flex flex-col divide-y divide-line">
              <label className="flex items-center gap-3 px-5 py-2.5">
                <span className="w-24 shrink-0 text-[12px] text-fg-3">
                  {t("field.displayName")}
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={localpart}
                  className="flex-1 bg-transparent text-[13px] text-fg-0 outline-none placeholder:text-fg-3"
                />
              </label>
              {error && (
                <p className="px-5 py-2.5 text-[12px] text-red-400">{error}</p>
              )}
            </div>

            {/* 푸터 */}
            <div className="flex border-t border-line">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border-r border-line py-2.5 text-[13px] text-fg-2 hover:bg-bg-2 hover:text-fg-0"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={busy || !dirty}
                onClick={save}
                className="flex-1 bg-bg-2 py-2.5 text-[13px] font-medium text-fg-0 hover:bg-bg-3 disabled:opacity-50"
              >
                {busy ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
