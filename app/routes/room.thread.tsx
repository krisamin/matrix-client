import { Maximize2, MessageSquareText, Minimize2, X } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { MessageInput } from "../components/MessageInput";
import { PaneHeader, PaneHeaderButton } from "../components/PaneHeader";
import { Timeline } from "../components/Timeline";
import { useReadReceipt } from "../hooks/useRoomTimeline";
import { useThreadTimeline } from "../hooks/useThreadTimeline";
import { quotePreview } from "../lib/reply";
import { useRoomContext } from "./room";

export function meta() {
  return [{ title: "스레드 — matrix-client" }];
}

/** 스레드 페인 — 채팅 화면과 100% 동일한 구조 (헤더/타임라인/입력창).
 *  ?full=1이면 풀 화면(부모가 채팅 페인 숨김), 아니면 좌우 분할. */
export default function ThreadView() {
  const { client, room } = useRoomContext();
  const { roomId, threadId } = useParams<{
    roomId: string;
    threadId: string;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const full = searchParams.get("full") === "1";

  const { events, initialising, loadingOlder, loadOlder } = useThreadTimeline(
    client,
    room,
    threadId!,
  );
  useReadReceipt(client, events);
  const myUserId = client.getUserId() ?? "";

  const rootEvent =
    room.findEventById(threadId!) ?? room.getThread(threadId!)?.rootEvent;
  const title = rootEvent ? quotePreview(rootEvent) : "스레드";
  const replyCount = room.getThread(threadId!)?.length ?? 0;

  async function sendReply(text: string) {
    // threadId를 relation root로 — SDK가 m.thread 관계로 보냄
    await client.sendTextMessage(room.roomId, threadId!, text);
  }

  function close() {
    navigate(`/room/${encodeURIComponent(roomId!)}`);
  }

  return (
    <section
      className={`flex min-w-0 flex-1 flex-col ${full ? "" : "border-l border-line"}`}
    >
      <PaneHeader
        actions={
          <>
            <PaneHeaderButton
              title={full ? "분할 화면" : "전체 화면"}
              onClick={() =>
                setSearchParams(full ? {} : { full: "1" }, { replace: true })
              }
            >
              {full ? (
                <Minimize2 className="h-[15px] w-[15px]" />
              ) : (
                <Maximize2 className="h-[15px] w-[15px]" />
              )}
            </PaneHeaderButton>
            <PaneHeaderButton title="닫기" onClick={close}>
              <X className="h-[15px] w-[15px]" />
            </PaneHeaderButton>
          </>
        }
      >
        <MessageSquareText className="h-[15px] w-[15px] shrink-0 text-fg-2" />
        <h1 className="truncate font-semibold text-fg-0">{title}</h1>
        {replyCount > 0 && (
          <span className="shrink-0 font-mono text-[10px] text-fg-3">
            답글 {replyCount}
          </span>
        )}
      </PaneHeader>

      {initialising ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="animate-pulse font-mono text-[11px] text-fg-3">
            스레드 불러오는 중…
          </span>
        </div>
      ) : (
        <Timeline
          client={client}
          room={room}
          events={events}
          myUserId={myUserId}
          loadingOlder={loadingOlder}
          loadOlder={loadOlder}
        />
      )}

      <MessageInput
        client={client}
        room={room}
        placeholder="스레드에 답글 보내기…"
        onSend={sendReply}
      />
    </section>
  );
}
