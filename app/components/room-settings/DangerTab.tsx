import { Ban, ShieldOff, UserMinus } from "lucide-react";
import type { MatrixClient, Room } from "matrix-js-sdk";
import { useState } from "react";
import { useT } from "../../lib/i18n";
import {
  banMember,
  canSendStateEvent,
  kickMember,
  unbanMember,
} from "../../lib/matrix";
import { SectionHeader } from "../Form";
import { FormError } from "../FormError";
import { InlineSpinner } from "../InlineSpinner";

/* ──────────── 위험 탭: 강퇴/추방/추방 해제 ──────────── */

export function DangerTab({
  client,
  room,
  onClose,
}: {
  client: MatrixClient;
  room: Room;
  onClose: () => void;
}) {
  const t = useT();
  const myUserId = client.getUserId() ?? "";
  const [, force] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canKick = canSendStateEvent(room, client, "m.room.member"); // 대체로 m.room.member 권한
  const banned = room.getMembersWithMembership("ban");

  async function doKick(userId: string) {
    if (busy) return;
    setBusy(userId);
    setError(null);
    try {
      await kickMember(client, room.roomId, userId);
      force((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
  async function doBan(userId: string) {
    if (busy) return;
    setBusy(userId);
    setError(null);
    try {
      await banMember(client, room.roomId, userId);
      force((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
  async function doUnban(userId: string) {
    if (busy) return;
    setBusy(userId);
    setError(null);
    try {
      await unbanMember(client, room.roomId, userId);
      force((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const members = [...room.getJoinedMembers()].filter(
    (m) => m.userId !== myUserId,
  );

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col">
          <SectionHeader>
            {t("perm.section.members", { count: members.length })}
            {t("danger.excludeSelf")}
          </SectionHeader>
          {members.map((m) => (
            <div
              key={m.userId}
              className="flex items-stretch border-b border-line last:border-b-0"
            >
              <span className="flex min-w-0 flex-1 items-center truncate py-2.5 pl-4 text-[13px] text-fg-1">
                <span className="truncate">{m.name}</span>
              </span>
              <div className="flex shrink-0 items-stretch">
                <button
                  type="button"
                  onClick={() => doKick(m.userId)}
                  disabled={!canKick || busy === m.userId}
                  title={t("danger.kick.title")}
                  className="flex items-center gap-1.5 px-3 text-[12px] text-fg-2 hover:bg-bg-2 hover:text-fg-0 disabled:opacity-50"
                >
                  <UserMinus className="h-3.5 w-3.5" />
                  {t("danger.kick")}
                </button>
                <button
                  type="button"
                  onClick={() => doBan(m.userId)}
                  disabled={!canKick || busy === m.userId}
                  title={t("danger.ban.title")}
                  className="flex items-center gap-1.5 px-3 text-[12px] text-red-400 hover:bg-red-950/40 disabled:opacity-50"
                >
                  <Ban className="h-3.5 w-3.5" />
                  {t("danger.ban")}
                </button>
                {busy === m.userId && (
                  <span className="flex items-center pr-3">
                    <InlineSpinner size="xs" className="text-fg-3" />
                  </span>
                )}
              </div>
            </div>
          ))}

          {banned.length > 0 && (
            <>
              <SectionHeader>
                {t("danger.section.banned", { count: banned.length })}
              </SectionHeader>
              {banned.map((m) => (
                <div
                  key={m.userId}
                  className="flex items-stretch border-b border-line last:border-b-0"
                >
                  <span className="flex min-w-0 flex-1 items-center truncate py-2.5 pl-4 text-[13px] text-fg-2">
                    <span className="truncate">{m.name}</span>
                  </span>
                  <div className="flex shrink-0 items-center gap-2 py-2 pr-4">
                    <button
                      type="button"
                      onClick={() => doUnban(m.userId)}
                      disabled={busy === m.userId}
                      className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-fg-2 hover:bg-bg-2 hover:text-fg-0 disabled:opacity-50"
                    >
                      <ShieldOff className="h-3 w-3" />
                      {t("danger.unbanAction")}
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        {error && (
          <div className="border-t border-line">
            <FormError>{error}</FormError>
          </div>
        )}
      </div>
      <div className="flex border-t border-line">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 text-[13px] text-fg-2 hover:bg-bg-2 hover:text-fg-0"
        >
          {t("common.close")}
        </button>
      </div>
    </>
  );
}
