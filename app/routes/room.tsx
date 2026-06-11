import { Lock, Users } from "lucide-react";
import {
  EventType,
  type MatrixClient,
  type MatrixEvent,
  MsgType,
  type Room,
} from "matrix-js-sdk";
import { useState } from "react";
import {
  Outlet,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router";
import { RoomAvatar } from "../components/Avatar";
import { MessageInput } from "../components/MessageInput";
import { PaneHeader } from "../components/PaneHeader";
import { Timeline } from "../components/Timeline";
import { useReadReceipt, useRoomTimeline } from "../hooks/useRoomTimeline";
import { useAppContext } from "./app-layout";

export function meta() {
  return [{ title: "matrix-client" }];
}

export interface RoomContext {
  client: MatrixClient;
  room: Room;
}

/** 자식 라우트(스레드)에서 client/room 접근용 */
export function useRoomContext(): RoomContext {
  return useOutletContext<RoomContext>();
}

/** 방 화면 — 채팅 페인 + (스레드 라우트 활성 시) 분할/풀 스레드 페인.
 *  - /room/:roomId               → 채팅만
 *  - /room/:roomId/thread/:tid   → 채팅 | 스레드 분할
 *  - + ?full=1                   → 스레드 풀 화면 (트리에서 진입) */
export default function RoomView() {
  const { client } = useAppContext();
  const { roomId, threadId } = useParams<{
    roomId: string;
    threadId?: string;
  }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { room, events, hasMore, loadingOlder, loadOlder } = useRoomTimeline(
    client,
    roomId!,
  );
  useReadReceipt(client, events);

  const [replyTo, setReplyTo] = useState<MatrixEvent | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const myUserId = client.getUserId() ?? "";

  const threadFull = threadId != null && searchParams.get("full") === "1";

  if (!room) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="animate-pulse font-mono text-[12px] text-fg-3">
          loading…
        </span>
      </div>
    );
  }

  async function send(text: string) {
    if (replyTo) {
      // 답장: m.in_reply_to 관계 + 구식 클라용 fallback 인용문 (스펙 권장)
      const orig = replyTo.getContent().body ?? "";
      const fallbackQuote = orig
        .split("\n")
        .map((l: string, i: number) =>
          i === 0 ? `> <${replyTo.getSender()}> ${l}` : `> ${l}`,
        )
        .join("\n");
      await client.sendEvent(roomId!, EventType.RoomMessage, {
        msgtype: MsgType.Text,
        body: `${fallbackQuote}\n\n${text}`,
        "m.relates_to": {
          "m.in_reply_to": { event_id: replyTo.getId()! },
        },
      });
      setReplyTo(null);
    } else {
      await client.sendTextMessage(roomId!, text);
    }
  }

  /** 인용 박스 클릭 → 원문으로 스크롤 + 잠깐 강조.
   *  로드된 범위에 없으면 과거를 더 불러오며 시도 (최대 5페이지) */
  async function jumpTo(eventId: string) {
    for (let i = 0; i < 5; i++) {
      const el = document.getElementById(`ev-${eventId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightId(eventId);
        setTimeout(() => setHighlightId(null), 1600);
        return;
      }
      if (!hasMore) break;
      await loadOlder();
    }
  }

  function openThread(rootId: string) {
    navigate(
      `/room/${encodeURIComponent(roomId!)}/thread/${encodeURIComponent(rootId)}`,
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      {/* 채팅 페인 — 스레드 풀 화면일 땐 숨김 */}
      {!threadFull && (
        <section className="flex min-w-0 flex-1 flex-col">
          <PaneHeader
            actions={
              <span
                className="p-2"
                title={`멤버 ${room.getJoinedMemberCount()}명`}
              >
                <Users className="h-[15px] w-[15px]" />
              </span>
            }
          >
            <RoomAvatar client={client} room={room} size={20} />
            <h1 className="truncate font-semibold text-fg-0">{room.name}</h1>
            {room.hasEncryptionStateEvent() && (
              <Lock className="h-3.5 w-3.5 shrink-0 text-fg-3" />
            )}
          </PaneHeader>
          <Timeline
            client={client}
            room={room}
            events={events}
            myUserId={myUserId}
            loadingOlder={loadingOlder}
            hasMore={hasMore}
            loadOlder={loadOlder}
            onOpenThread={openThread}
            onReply={setReplyTo}
            highlightId={highlightId}
            onJumpTo={jumpTo}
          />
          <MessageInput
            client={client}
            room={room}
            placeholder={`${room.name}에 메시지 보내기…`}
            onSend={send}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
          />
        </section>
      )}
      {/* 스레드 페인 (자식 라우트) */}
      <Outlet context={{ client, room } satisfies RoomContext} />
    </div>
  );
}
