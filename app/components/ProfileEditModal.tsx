import { Loader2, Upload } from "lucide-react";
import type { MatrixClient } from "matrix-js-sdk";
import { useEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { getMyProfile, setMyAvatar, setMyDisplayName } from "../lib/matrix";
import { Avatar } from "./Avatar";
import { Field, FieldGroup, TextInput } from "./Form";
import { Modal, ModalFooter, ModalHeader } from "./Modal";

/** 내 프로필 편집 모달. */
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
    <Modal onClose={onClose} size="sm">
      <ModalHeader title={t("modal.profile.title")} />
      {loading ? (
        <div className="flex items-center justify-center py-12 text-fg-3">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <>
          {/* 아바타 영역 */}
          <div className="flex shrink-0 flex-col items-center gap-2 border-b border-line bg-bg-2/30 px-4 py-5">
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

          <FieldGroup>
            <Field label={t("field.displayName")}>
              <TextInput
                value={name}
                onChange={setName}
                placeholder={localpart}
              />
            </Field>
            {error && (
              <p className="px-4 py-2.5 text-[12px] text-red-400">{error}</p>
            )}
          </FieldGroup>

          <ModalFooter
            onCancel={onClose}
            onConfirm={save}
            cancelLabel={t("common.cancel")}
            confirmLabel={busy ? t("common.saving") : t("common.save")}
            busy={busy}
            disabled={!dirty}
          />
        </>
      )}
    </Modal>
  );
}
