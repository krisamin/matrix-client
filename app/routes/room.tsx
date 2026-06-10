import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  ClientEvent,
  EventType,
  MatrixEventEvent,
  MsgType,
  RoomEvent,
  SyncState,
  type MatrixClient,
  type MatrixEvent,
  type Room,
} from "matrix-js-sdk";
import { getReadyClient } from "../lib/matrix";

export function meta() {
  return [{ title: "방 — matrix-client" }];
}

/** 타임라인에서 표시할 이벤트만 추림 (복호화되면 type이 m.room.message로 바뀜) */
function visibleEvents(room: Room): MatrixEvent[] {
  return room
    .getLiveTimeline()
    .getEvents()
    .filter(
      (ev) =>
        ev.getType() === EventType.RoomMessage ||
        ev.getType() === EventType.RoomMessageEncrypted ||
        ev.isDecryptionFailure(),
    );
}

function EventLine({ ev, myUserId }: { ev: MatrixEvent; myUserId: string }) {
  const sender = ev.getSender() ?? "?";
  const mine = sender === myUserId;
  const content = ev.getContent();
  let body: string;
  if (ev.isDecryptionFailure()) {
    body = "🔒 복호화 실패 (키 없음 — 기기 인증/키 백업 확인)";
  } else if (ev.getType() === EventType.RoomMessageEncrypted) {
    body = "🔒 복호화 중...";
  } else if (ev.isRedacted()) {
    body = "(삭제된 메시지)";
  } else if (content.msgtype === MsgType.Image) {
    body = `🖼 이미지: ${content.body ?? ""}`;
  } else {
    body = content.body ?? `(${content.msgtype ?? ev.getType()})`;
  }
  const time = new Date(ev.getTs()).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <li className={`flex flex-col py-1 ${mine ? "items-end" : "items-start"}`}>
      <span className="text-xs text-gray-500">
        {sender} · {time}
      </span>
      <span
        className={`max-w-[80%] whitespace-pre-wrap break-words rounded-lg px-3 py-1.5 ${
          mine ? "bg-blue-600 text-white" : "bg-gray-200 dark:bg-gray-800"
        }`}
      >
        {body}
      </span>
    </li>
  );
}

export default function RoomView() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<MatrixClient | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [events, setEvents] = useState<MatrixEvent[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const myUserId = client?.getUserId() ?? "";

  useEffect(() => {
    const promise = getReadyClient();
    if (!promise || !roomId) {
      navigate("/login", { replace: true });
      return;
    }
    let c: MatrixClient | undefined;
    let cleanup: (() => void) | undefined;
    promise.then((cl) => {
      c = cl;
      setClient(cl);
      if (!cl.clientRunning) cl.startClient({ initialSyncLimit: 20 });

      const bind = () => {
        const r = cl.getRoom(roomId);
        if (!r) return false;
        setRoom(r);
        // 과거 암호화 이벤트 복호화 시도
        for (const ev of r.getLiveTimeline().getEvents()) {
          if (ev.getType() === EventType.RoomMessageEncrypted) {
            cl.decryptEventIfNeeded(ev);
          }
        }
        setEvents(visibleEvents(r));
        return true;
      };

      const onSync = (state: SyncState) => {
        if (state === SyncState.Prepared) bind();
      };
      if (!bind()) cl.on(ClientEvent.Sync, onSync);

      const refresh = () => {
        const r = cl.getRoom(roomId);
        if (r) setEvents(visibleEvents(r));
      };
      const onTimeline = (_ev: MatrixEvent, r?: Room) => {
        if (r?.roomId !== roomId) return;
        refresh();
      };
      const onDecrypted = (ev: MatrixEvent) => {
        if (ev.getRoomId() !== roomId) return;
        refresh();
      };
      cl.on(RoomEvent.Timeline, onTimeline);
      cl.on(MatrixEventEvent.Decrypted, onDecrypted);
      cleanup = () => {
        cl.off(ClientEvent.Sync, onSync);
        cl.off(RoomEvent.Timeline, onTimeline);
        cl.off(MatrixEventEvent.Decrypted, onDecrypted);
      };
    });
    return () => cleanup?.();
  }, [roomId, navigate]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [events]);

  async function send() {
    if (!client || !roomId || !draft.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await client.sendTextMessage(roomId, draft);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col p-4">
      <header className="flex items-center gap-3 border-b border-gray-200 pb-3 dark:border-gray-800">
        <Link to="/" className="text-blue-500">
          ←
        </Link>
        <h1 className="truncate text-lg font-bold">{room?.name ?? roomId}</h1>
        {room?.hasEncryptionStateEvent() && <span title="E2EE 방">🔐</span>}
      </header>
      <ul className="flex-1 overflow-y-auto py-3">
        {events.map((ev) => (
          <EventLine key={ev.getId()} ev={ev} myUserId={myUserId} />
        ))}
        <div ref={bottomRef} />
      </ul>
      {error && <p className="pb-1 text-sm text-red-500">{error}</p>}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          className="flex-1 rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="메시지 입력..."
        />
        <button
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          disabled={sending || !draft.trim()}
        >
          전송
        </button>
      </form>
    </main>
  );
}
