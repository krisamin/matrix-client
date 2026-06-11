import {
  ClientEvent,
  type EventTimelineSet,
  EventType,
  type MatrixClient,
  type MatrixEvent,
  MatrixEventEvent,
  type Room,
  RoomEvent,
  SyncState,
  ThreadEvent,
} from "matrix-js-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { getNoThreadTimelineSet } from "../lib/matrix";
import { visibleEvents } from "../lib/timeline";

/** 타임라인의 미복호화 이벤트에 복호화 시도 */
function decryptPending(client: MatrixClient, events: MatrixEvent[]): void {
  for (const ev of events) {
    if (ev.getType() === EventType.RoomMessageEncrypted) {
      client.decryptEventIfNeeded(ev);
    }
  }
}

/**
 * 방 타임라인 훅 — 채팅 화면의 데이터 레이어 전부.
 * (클라이언트는 AppLayout이 준비해서 주입 — 여기선 방 바인딩부터)
 *
 * - 방 바인딩 (sync 전이면 Prepared 대기)
 * - MSC3874 no-thread 필터드 타임라인 생성
 * - 표시할 메시지가 모일 때까지 초기 자동 백필 (스크롤 데드락 방지)
 * - 실시간 리스너: Timeline / Decrypted / Replaced(E2EE 수정 반영) /
 *   LocalEchoUpdated(전송 상태) / ThreadEvent(답글 배지)
 * - loadOlder: backwards 페이지네이션 (동시 호출 가드 포함)
 */
export function useRoomTimeline(client: MatrixClient, roomId: string) {
  const [room, setRoom] = useState<Room | null>(null);
  const [events, setEvents] = useState<MatrixEvent[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingOlderRef = useRef(false);
  const tlSetRef = useRef<EventTimelineSet | null>(null);

  useEffect(() => {
    setRoom(null);
    setEvents([]);
    setHasMore(true);
    tlSetRef.current = null;

    // 보이는 이벤트가 최소치를 넘거나 타임라인 끝에 닿을 때까지 backwards 페이지네이션
    const fillUntilVisible = async (r: Room) => {
      const tlSet = tlSetRef.current;
      for (let i = 0; i < 10 && visibleEvents(r, tlSet).length < 15; i++) {
        const timeline = tlSet?.getLiveTimeline() ?? r.getLiveTimeline();
        let more: boolean;
        try {
          more = await client.paginateEventTimeline(timeline, {
            backwards: true,
            limit: 50,
          });
        } catch (e) {
          console.warn("[fillUntilVisible] paginate 실패:", e);
          break;
        }
        decryptPending(client, timeline.getEvents());
        setEvents(visibleEvents(r, tlSet));
        if (!more) {
          setHasMore(false);
          break;
        }
      }
    };

    const bind = () => {
      const r = client.getRoom(roomId);
      if (!r) return false;
      setRoom(r);
      decryptPending(client, r.getLiveTimeline().getEvents());
      setEvents(visibleEvents(r));
      // MSC3874: 스레드 답글 제외 필터드 타임라인 → 이후 페이지네이션은
      // 서버가 스레드 답글 빼고 줌 (빈 페이지 데드락 원천 차단)
      void (async () => {
        const tlSet = await getNoThreadTimelineSet(client, r);
        tlSetRef.current = tlSet;
        if (tlSet) setEvents(visibleEvents(r, tlSet));
        await fillUntilVisible(r);
      })();
      return true;
    };

    const onSync = (state: SyncState) => {
      if (state === SyncState.Prepared) bind();
    };
    if (!bind()) client.on(ClientEvent.Sync, onSync);

    const refreshNow = () => {
      const r = client.getRoom(roomId);
      if (r) setEvents(visibleEvents(r, tlSetRef.current));
    };
    // 복호화/수정 이벤트는 페이지네이션 중 메시지당 수십 번 연쇄로 터짐 —
    // 프레임당 1회로 배칭해서 전체 리스트 리렌더 폭주 방지
    let refreshScheduled = false;
    const refresh = () => {
      if (refreshScheduled) return;
      refreshScheduled = true;
      requestAnimationFrame(() => {
        refreshScheduled = false;
        refreshNow();
      });
    };
    const onTimeline = (_ev: MatrixEvent, r?: Room) => {
      if (r?.roomId === roomId) refresh();
    };
    const onDecrypted = (ev: MatrixEvent) => {
      if (ev.getRoomId() === roomId) refresh();
    };
    // E2EE 수정(m.replace)은 복호화 후 비동기로 원본에 합쳐짐(makeReplaced)
    // → 그 시점에 다시 그려야 최종 수정 내용이 보임 (스트리밍 봇 메시지)
    const onReplaced = (ev: MatrixEvent) => {
      if (ev.getRoomId() === roomId) refresh();
    };
    // 스레드 답글 수 배지 갱신
    const onThreadUpdate = () => refresh();
    // local echo 상태 변화(전송중→완료/실패) — 실패 표시/재전송 UI의 데이터 소스
    const onLocalEcho = (_ev: MatrixEvent, r: Room) => {
      if (r.roomId === roomId) refresh();
    };
    client.on(RoomEvent.Timeline, onTimeline);
    client.on(MatrixEventEvent.Decrypted, onDecrypted);
    client.on(MatrixEventEvent.Replaced, onReplaced);
    client.on(RoomEvent.LocalEchoUpdated, onLocalEcho);
    // ThreadEvent는 Room이 emit — 방이 생긴 뒤에 단다
    const tryAttachThreadListener = () => {
      const r = client.getRoom(roomId);
      if (!r) return false;
      r.on(ThreadEvent.Update, onThreadUpdate);
      r.on(ThreadEvent.NewReply, onThreadUpdate);
      return true;
    };
    const onSyncForThread = (state: SyncState) => {
      if (state === SyncState.Prepared && tryAttachThreadListener()) {
        client.off(ClientEvent.Sync, onSyncForThread);
      }
    };
    if (!tryAttachThreadListener())
      client.on(ClientEvent.Sync, onSyncForThread);

    return () => {
      client.off(ClientEvent.Sync, onSync);
      client.off(ClientEvent.Sync, onSyncForThread);
      client.off(RoomEvent.Timeline, onTimeline);
      client.off(MatrixEventEvent.Decrypted, onDecrypted);
      client.off(MatrixEventEvent.Replaced, onReplaced);
      client.off(RoomEvent.LocalEchoUpdated, onLocalEcho);
      const r = client.getRoom(roomId);
      r?.off(ThreadEvent.Update, onThreadUpdate);
      r?.off(ThreadEvent.NewReply, onThreadUpdate);
    };
  }, [client, roomId]);

  /** 과거 페이지 로드. 더 가져왔으면 true (동시 호출은 무시) */
  const loadOlder = useCallback(async (): Promise<boolean> => {
    if (!room || loadingOlderRef.current || !hasMore) return false;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const timeline =
        tlSetRef.current?.getLiveTimeline() ?? room.getLiveTimeline();
      const more = await client.paginateEventTimeline(timeline, {
        backwards: true,
        limit: 30,
      });
      setHasMore(more);
      decryptPending(client, timeline.getEvents());
      setEvents(visibleEvents(room, tlSetRef.current));
      return true;
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [client, room, hasMore]);

  return { room, events, hasMore, loadingOlder, loadOlder };
}

/** 읽음 처리 훅: 탭이 보이는 상태에서 마지막 메시지가 바뀌면 receipt 전송.
 *  (없으면 다른 클라이언트에서 안읽음 배지가 영원히 안 꺼짐)
 *  스레드 이벤트면 SDK가 MSC3771 thread receipt로 보냄. */
export function useReadReceipt(
  client: MatrixClient | null,
  events: MatrixEvent[],
): void {
  const lastReceiptRef = useRef<string | null>(null);
  useEffect(() => {
    if (!client || events.length === 0) return;
    const sendReceipt = () => {
      if (document.visibilityState !== "visible") return;
      const last = events[events.length - 1];
      const id = last.getId();
      // "~"로 시작하면 local echo (서버 미확정) — receipt 불가
      if (!id || id.startsWith("~") || lastReceiptRef.current === id) return;
      lastReceiptRef.current = id;
      client.sendReadReceipt(last).catch((e) => {
        lastReceiptRef.current = null; // 실패 시 재시도 허용
        console.warn("read receipt 실패:", e);
      });
    };
    sendReceipt();
    // 백그라운드에서 새 메시지 → 탭으로 돌아왔을 때 읽음 처리
    document.addEventListener("visibilitychange", sendReceipt);
    window.addEventListener("focus", sendReceipt);
    return () => {
      document.removeEventListener("visibilitychange", sendReceipt);
      window.removeEventListener("focus", sendReceipt);
    };
  }, [client, events]);
}
