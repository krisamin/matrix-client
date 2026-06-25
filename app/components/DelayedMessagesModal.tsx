import { CalendarClock, SendHorizontal, X } from "lucide-react";
import type { MatrixClient } from "matrix-js-sdk";
import { useEffect, useState } from "react";
import {
  cancelDelayed,
  listDelayed,
  sendDelayedNow,
} from "../lib/delayed-events";
import { formatRemaining } from "../lib/format";
import { useT } from "../lib/i18n";
import { Modal, ModalHeader } from "./Modal";

interface DelayedItem {
  delay_id: string;
  room_id: string;
  type: string;
  content: Record<string, unknown>;
  delay: number;
}

/** 사이드바 [예약된 메시지] 모달.
 *  listDelayed로 내가 예약한 메시지 전체 + 즉시 보내기 / 취소 액션. */
export function DelayedMessagesModal({
  client,
  onClose,
}: {
  client: MatrixClient;
  onClose: () => void;
}) {
  const t = useT();
  const [items, setItems] = useState<DelayedItem[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    try {
      const list = await listDelayed(client);
      setItems(list as DelayedItem[]);
    } catch {
      setItems([]);
    }
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: 첫 mount 1회만
  useEffect(() => {
    refresh();
  }, []);

  async function act(id: string, kind: "send" | "cancel") {
    setBusyId(id);
    try {
      if (kind === "send") await sendDelayedNow(client, id);
      else await cancelDelayed(client, id);
      await refresh();
    } catch {
      // ignore
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal onClose={onClose} size="md">
      <ModalHeader title={t("sidebar.scheduled")} />
      <div className="flex flex-col">
        {items === null && (
          <p className="px-4 py-4 text-[12px] text-fg-3">{t("login.busy")}</p>
        )}
        {items?.length === 0 && (
          <p className="px-4 py-6 text-center text-[13px] text-fg-3">
            {t("schedule.empty")}
          </p>
        )}
        {items?.map((it) => {
          const room = client.getRoom(it.room_id);
          const body = (it.content?.body as string) ?? "";
          const isBusy = busyId === it.delay_id;
          return (
            <div
              key={it.delay_id}
              className="flex items-stretch border-b border-line last:border-b-0"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 px-4 py-2.5">
                <span className="flex items-center gap-1.5 text-[11px] text-fg-3">
                  <CalendarClock className="h-3 w-3" />
                  {room?.name ?? it.room_id}
                  <span className="text-fg-3">·</span>
                  <span>
                    {t("schedule.in", { time: formatRemaining(it.delay) })}
                  </span>
                </span>
                <span className="truncate text-[13px] text-fg-1">{body}</span>
              </div>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => act(it.delay_id, "send")}
                title={t("schedule.sendNow")}
                className="flex w-10 shrink-0 items-center justify-center border-l border-line text-fg-2 hover:bg-bg-2 hover:text-fg-0 disabled:opacity-50"
              >
                <SendHorizontal className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => act(it.delay_id, "cancel")}
                title={t("schedule.cancel")}
                className="flex w-10 shrink-0 items-center justify-center border-l border-line text-fg-2 hover:bg-red-950/40 hover:text-red-300 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
