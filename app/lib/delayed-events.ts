/** MSC4140 Delayed Events — 예약/지연 메시지.
 *
 *  Synapse 서버가 `msc4140_delayed_events_enabled: true`로 켰을 때 사용 가능.
 *  matrix-js-sdk는 native API가 없어 raw HTTP로 호출.
 *
 *  사용:
 *    const id = await sendDelayedMessage(client, roomId, "hi", { delayMs: 60_000 });
 *    await cancelDelayed(client, id);
 *    const list = await listDelayed(client);
 */

import type { MatrixClient } from "matrix-js-sdk";
import { buildMentionContent, type Mention } from "./mention";

const PREFIX = "/_matrix/client/unstable/org.matrix.msc4140";

interface DelayedSendOpts {
  /** ms — 이만큼 후에 발사. 서버는 보통 분/초 단위로 정렬해 처리. */
  delayMs?: number;
  /** ISO timestamp — 절대 시각. delayMs와 함께 주면 delayMs 우선. */
  sendAt?: string;
  mentions?: Mention[];
}

interface DelayedSendResult {
  /** 예약된 메시지 식별자. cancel/refresh에 사용. */
  delay_id: string;
}

interface DelayedListItem {
  delay_id: string;
  room_id: string;
  type: string;
  content: Record<string, unknown>;
  /** ms 단위 남은 시간 */
  delay: number;
  /** 발사 시각 (서버 시계 기준 ISO) */
  send_at?: string;
}

interface DelayedListResponse {
  delayed_events: DelayedListItem[];
  next_batch?: string;
}

/** PUT /rooms/{roomId}/send/{eventType}/{txnId}?org.matrix.msc4140.delay=<ms> */
export async function sendDelayedMessage(
  client: MatrixClient,
  roomId: string,
  text: string,
  opts: DelayedSendOpts = {},
): Promise<string> {
  const content = buildMentionContent(text, opts.mentions);
  const txnId = `m${Date.now()}.${Math.floor(Math.random() * 1e6)}`;
  const params = new URLSearchParams();
  if (opts.delayMs) {
    params.set("org.matrix.msc4140.delay", String(opts.delayMs));
  } else if (opts.sendAt) {
    // sendAt(ISO) → ms 변환 (서버는 delay 또는 send_at 받음)
    const diff = new Date(opts.sendAt).getTime() - Date.now();
    params.set("org.matrix.msc4140.delay", String(Math.max(0, diff)));
  }
  const path = `/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${encodeURIComponent(txnId)}?${params}`;
  // SDK http API 직접 사용 — 표준 endpoint가 아니라 v3 prefix로 쏘되 query는 MSC4140 그대로
  const res = (await (
    client as unknown as {
      http: {
        authedRequest: (
          method: string,
          path: string,
          queryParams: Record<string, string>,
          body: unknown,
          opts?: { prefix?: string },
        ) => Promise<unknown>;
      };
    }
  ).http.authedRequest("PUT", path, {}, content, {
    prefix: "/_matrix/client/v3",
  })) as DelayedSendResult;
  return res.delay_id;
}

/** GET /delayed_events — 내가 예약한 전체 목록. */
export async function listDelayed(
  client: MatrixClient,
): Promise<DelayedListItem[]> {
  const items: DelayedListItem[] = [];
  let from: string | undefined;
  for (let i = 0; i < 10; i++) {
    const params: Record<string, string> = {};
    if (from) params.from = from;
    const res = (await (
      client as unknown as {
        http: {
          authedRequest: (
            method: string,
            path: string,
            queryParams: Record<string, string>,
            body: unknown,
            opts?: { prefix?: string },
          ) => Promise<unknown>;
        };
      }
    ).http.authedRequest("GET", "/delayed_events", params, undefined, {
      prefix: PREFIX,
    })) as DelayedListResponse;
    items.push(...res.delayed_events);
    if (!res.next_batch) break;
    from = res.next_batch;
  }
  return items;
}

/** POST /delayed_events/{id}?action=cancel|send|restart */
async function actDelayed(
  client: MatrixClient,
  id: string,
  action: "cancel" | "send" | "restart",
): Promise<void> {
  await (
    client as unknown as {
      http: {
        authedRequest: (
          method: string,
          path: string,
          queryParams: Record<string, string>,
          body: unknown,
          opts?: { prefix?: string },
        ) => Promise<unknown>;
      };
    }
  ).http.authedRequest(
    "POST",
    `/delayed_events/${encodeURIComponent(id)}`,
    {},
    { action },
    { prefix: PREFIX },
  );
}

export function cancelDelayed(client: MatrixClient, id: string): Promise<void> {
  return actDelayed(client, id, "cancel");
}

export function sendDelayedNow(
  client: MatrixClient,
  id: string,
): Promise<void> {
  return actDelayed(client, id, "send");
}
