import { useEffect, useRef, useState } from "react";
import {
  MatrixEventEvent,
  RoomEvent,
  ThreadEvent,
  type MatrixClient,
  type MatrixEvent,
  type Room,
} from "matrix-js-sdk";
import { visibleThreadEvents } from "../lib/timeline";
import { useReadReceipt } from "../hooks/useRoomTimeline";
import { EventLine } from "./EventLine";

/** 스레드 패널: 루트 이벤트 + 답글 타임라인 + 입력창 */
export function ThreadPanel({
  client,
  room,
  rootId,
  myUserId,
  onClose,
}: {
  client: MatrixClient;
  room: Room;
  rootId: string;
  myUserId: string;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<MatrixEvent[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [initialising, setInitialising] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const listRef = useRef<HTMLUListElement>(null);
  const backfillingRef = useRef(false);

  useEffect(() => {
    const thread =
      room.getThread(rootId) ??
      room.createThread(rootId, room.findEventById(rootId), [], true);

    const refresh = () => {
      // 주의: liveTimeline 레퍼런스를 미리 잡아두면 안 됨 —
      // SDK가 초기화 시 resetLiveTimeline()으로 갈아끼움.
      // thread.events getter는 항상 현재 타임라인을 가리킴.
      setEvents(visibleThreadEvents(client, thread.events));
      if (thread.initialEventsFetched) {
        setInitialising(false);
        // 초기 로드분이 수정(m.replace)/리액션 위주면 필터 후 한두 개만
        // 남아 스크롤바가 없음 → 스크롤 트리거 데드락. 표시할 게
        // 모일 때까지 자동 백필 (메인 타임라인 fillUntilVisible과 동일 패턴)
        void backfillUntilVisible();
      }
    };

    const backfillUntilVisible = async () => {
      if (backfillingRef.current) return;
      backfillingRef.current = true;
      try {
        for (
          let i = 0;
          i < 10 && visibleThreadEvents(client, thread.events).length < 15;
          i++
        ) {
          // backward 토큰이 없으면 스레드 시작 도달
          const more = await client.paginateEventTimeline(thread.liveTimeline, {
            backwards: true,
            limit: 50,
          });
          setEvents(visibleThreadEvents(client, thread.events));
          if (!more) break;
        }
      } catch (e) {
        console.warn("[thread backfill] 실패:", e);
      } finally {
        backfillingRef.current = false;
      }
    };

    refresh();

    // SDK가 초기 fetch(리셋 + 최신 답글 로드)를 스스로 수행하고
    // 끝나면 ThreadEvent.Update / RoomEvent.TimelineReset을 emit함
    const onUpdate = () => refresh();
    thread.on(ThreadEvent.Update, onUpdate);
    thread.on(ThreadEvent.NewReply, onUpdate);
    thread.on(RoomEvent.Timeline, onUpdate);
    thread.on(RoomEvent.TimelineReset, onUpdate);
    const onDecrypted = (ev: MatrixEvent) => {
      if (ev.threadRootId === rootId || ev.getId() === rootId) refresh();
    };
    client.on(MatrixEventEvent.Decrypted, onDecrypted);
    // 수정(m.replace) 적용 신호. E2EE에선 수정 이벤트 복호화가 끝난 "뒤"에
    // 비동기로 원본에 makeReplaced 되므로, 이걸 안 들으면 스트리밍 봇
    // 메시지가 중간 버전에서 박제됨. (Replaced는 "수정된 원본" 이벤트가
    // emit → threadRootId 필터 사용 가능. 수정 이벤트 자체는 threadRootId가
    // 없어 Decrypted 필터로는 못 잡음 — 실측)
    const onReplaced = (ev: MatrixEvent) => {
      if (ev.threadRootId === rootId || ev.getId() === rootId) refresh();
    };
    client.on(MatrixEventEvent.Replaced, onReplaced);
    return () => {
      thread.off(ThreadEvent.Update, onUpdate);
      thread.off(ThreadEvent.NewReply, onUpdate);
      thread.off(RoomEvent.Timeline, onUpdate);
      thread.off(RoomEvent.TimelineReset, onUpdate);
      client.off(MatrixEventEvent.Decrypted, onDecrypted);
      client.off(MatrixEventEvent.Replaced, onReplaced);
    };
  }, [client, room, rootId]);

  // 새 답글 오면 바닥 고정 (사용자가 위를 보고 있으면 유지)
  useEffect(() => {
    if (stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [events]);

  // 스레드 읽음 처리 — 스레드 이벤트는 SDK가 MSC3771 thread receipt로 보냄
  useReadReceipt(client, events);

  async function loadOlderReplies() {
    if (loadingOlder) return;
    setLoadingOlder(true);
    try {
      const thread = room.getThread(rootId);
      if (!thread) return;
      // 호출 시점의 liveTimeline 사용 (리셋 이후의 현재 타임라인)
      await client.paginateEventTimeline(thread.liveTimeline, {
        backwards: true,
        limit: 50,
      });
      setEvents(visibleThreadEvents(client, thread.events));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingOlder(false);
    }
  }

  function onScroll() {
    const list = listRef.current;
    if (!list) return;
    stickToBottomRef.current =
      list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    if (list.scrollTop < 100) loadOlderReplies();
  }

  async function sendReply() {
    if (!draft.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await client.sendTextMessage(room.roomId, rootId, draft);
      setDraft("");
      stickToBottomRef.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-gray-200 pl-3 dark:border-gray-800">
      <header className="flex items-center justify-between border-b border-gray-200 pb-2 dark:border-gray-800">
        <h2 className="text-sm font-bold">스레드</h2>
        <button onClick={onClose} className="px-2 text-gray-500">
          ✕
        </button>
      </header>
      <ul ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto py-2">
        {(initialising || loadingOlder) && (
          <li className="py-2 text-center text-xs text-gray-500">
            {initialising ? "스레드 불러오는 중..." : "과거 답글 불러오는 중..."}
          </li>
        )}
        {events.map((ev) => (
          <EventLine
            key={ev.getId()}
            ev={ev}
            myUserId={myUserId}
            client={client}
            room={room}
          />
        ))}
        {!initialising && events.length === 0 && (
          <li className="py-2 text-xs text-gray-500">답글 없음</li>
        )}
        <div ref={bottomRef} />
      </ul>
      {error && <p className="pb-1 text-xs text-red-500">{error}</p>}
      <form
        className="flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          sendReply();
        }}
      >
        <input
          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="스레드에 답글..."
        />
        <button
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={sending || !draft.trim()}
        >
          ↩
        </button>
      </form>
    </aside>
  );
}
