import { Ban, ShieldOff, UserMinus } from "lucide-react";
import type { MatrixClient, Room } from "matrix-js-sdk";
import { useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { banMember, canSendStateEvent, kickMember, unbanMember } from "../lib/matrix";
import { SectionHeader } from "./Form";
import { InlineSpinner } from "./InlineSpinner";
import { AccessTab } from "./room-settings/AccessTab";
import { GeneralTab } from "./room-settings/GeneralTab";
import { PermissionsTab } from "./room-settings/PermissionsTab";
import { type Tab } from "./room-settings/_shared";

/** 방 설정 모달 — 일반/접근/권한/위험 탭 (B-final 톤). */
export function RoomSettingsModal({
  client,
  room,
  onClose,
}: {
  client: MatrixClient;
  room: Room;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("general");
  const t = useT();
  const isSpace = room.isSpaceRoom();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[10vh]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex h-[80vh] w-[720px] max-w-[95vw] overflow-hidden rounded-md border border-line bg-bg-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        {/* 좌측 탭 — Sidebar 톤(좌측 accent + bg-bg-2/30 헤더 띠) */}
        <aside className="flex w-44 shrink-0 flex-col border-r border-line bg-bg-1">
          <header className="flex h-12 items-center border-b border-line pl-5">
            <h2 className="truncate font-semibold text-fg-0">
              {isSpace
                ? t("roomSettings.title.space")
                : t("roomSettings.title.room")}
            </h2>
          </header>
          {(
            [
              { id: "general", label: t("roomSettings.tab.general") },
              { id: "access", label: t("roomSettings.tab.access") },
              { id: "permissions", label: t("roomSettings.tab.permissions") },
              { id: "danger", label: t("roomSettings.tab.danger") },
            ] as { id: Tab; label: string }[]
          ).map((t) => {
            const active = tab === t.id;
            const danger = t.id === "danger";
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`relative border-b border-line py-2.5 pl-5 pr-4 text-left text-[13px] transition-colors ${
                  active
                    ? danger
                      ? "bg-red-950/30 font-medium text-red-300"
                      : "bg-bg-2 font-medium text-fg-0"
                    : danger
                      ? "text-red-400/80 hover:bg-bg-2 hover:text-red-300"
                      : "text-fg-2 hover:bg-bg-2 hover:text-fg-0"
                }`}
              >
                {/* 활성 인디케이터 — 좌측 2px accent bar */}
                {active && (
                  <span
                    className={`absolute inset-y-0 left-0 w-[2px] ${
                      danger ? "bg-red-400" : "bg-fg-0"
                    }`}
                  />
                )}
                {t.label}
              </button>
            );
          })}
        </aside>
        {/* 우측 컨텐츠 */}
        <section className="flex min-w-0 flex-1 flex-col">
          {tab === "general" && (
            <GeneralTab client={client} room={room} onClose={onClose} />
          )}
          {tab === "access" && (
            <AccessTab client={client} room={room} onClose={onClose} />
          )}
          {tab === "permissions" && (
            <PermissionsTab client={client} room={room} onClose={onClose} />
          )}
          {tab === "danger" && (
            <DangerTab client={client} room={room} onClose={onClose} />
          )}
        </section>
      </div>
    </div>
  );
}

/* ──────────── 위험 탭: 강퇴/추방/추방 해제 ──────────── */

function DangerTab({
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
              <span className="flex min-w-0 flex-1 items-center truncate py-2.5 pl-5 text-[13px] text-fg-1">
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
                  <span className="flex min-w-0 flex-1 items-center truncate py-2.5 pl-5 text-[13px] text-fg-2">
                    <span className="truncate">{m.name}</span>
                  </span>
                  <div className="flex shrink-0 items-center gap-2 py-2 pr-5">
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
          <p className="border-t border-line px-5 py-2.5 text-[12px] text-red-400">
            {error}
          </p>
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
