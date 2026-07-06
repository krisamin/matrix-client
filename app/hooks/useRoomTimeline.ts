import {
  ClientEvent,
  type EventTimelineSet,
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
import { perfSpan } from "../lib/perf-log";
import {
  decryptPending,
  eventsSignature,
  visibleEvents,
} from "../lib/timeline";

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
  // 세대 토큰(D2): effect 재실행(방/클라 전환)마다 증가. async 작업이
  // await에서 깨어났을 때 이 토큰이 바뀌었으면 = 이미 다른 방으로 넘어간 것
  // → 이전 방 데이터를 현재 state에 쓰는 race를 차단한다.
  const genRef = useRef(0);
  // 마지막으로 커밋한 events의 내용 서명(D3). 같으면 setEvents 스킵 → 참조 보존.
  const lastSigRef = useRef<string>("\u0000init");
  // receipt epoch: 읽음 표시는 events 내용을 안 바꾸지만 ReadReceipts 갱신을
  // 위해 리렌더가 필요하다(기존 동작). epoch을 올려 서명을 강제로 바꿔
  // 새 배열을 내보낸다 — 정체성 보존 dedup이 receipt를 삼키지 않게.
  const receiptEpochRef = useRef(0);

  /** 현재 방의 표시 이벤트를 state에 반영. 단:
   *  1) gen이 어긋나면(방 전환됨) 무시 — stale write 차단
   *  2) 내용 서명이 직전과 같으면 setEvents 스킵 — 배열 참조 보존(리렌더 폭주 방지)
   *  precomputed: 호출부가 이미 visibleEvents를 계산했으면 재사용(중복 필터 방지). */
  const commit = useCallback(
    (r: Room, gen: number, precomputed?: MatrixEvent[]) => {
      if (gen !== genRef.current) return;
      const next = precomputed ?? visibleEvents(r, tlSetRef.current);
      const sig = `${receiptEpochRef.current}:${eventsSignature(next)}`;
      if (sig === lastSigRef.current) return;
      lastSigRef.current = sig;
      setEvents(next);
    },
    [],
  );

  useEffect(() => {
    const gen = ++genRef.current;
    setRoom(null);
    setEvents([]);
    setHasMore(true);
    tlSetRef.current = null;
    lastSigRef.current = "\u0000init";
    // 방 전환 계측 — bind(방 준비)→filter(MSC3874 왕복)→fill(백필+복호화).
    // total은 "화면에 메시지가 처음 뜰 때까지"의 체감 시간과 대응.
    const endSwitchTotal = perfSpan(`room:total ${roomId.slice(0, 12)}`);

    // 보이는 이벤트가 최소치를 넘거나 타임라인 끝에 닿을 때까지 backwards 페이지네이션
    // limit 30: 메시지 짧은 방에서 1회 50개=과도. 30이면 점진적 + decryption 부담 분산.
    // ref guard: 빠른 방 전환 + scroll 시 fillUntilVisible과 loadOlder 동시 진입 방지.
    const fillUntilVisible = async (r: Room) => {
      if (loadingOlderRef.current) return;
      loadingOlderRef.current = true;
      const endFill = perfSpan("room:fill");
      let pages = 0;
      try {
        const tlSet = tlSetRef.current;
        // 루프 조건용 카운트는 paginate 결과로만 갱신 — 매 반복 전체 필터 재계산
        // (visibleEvents는 filter+정렬 O(n))을 피한다. 최초 1회만 현재 상태를 센다.
        let visibleCount = visibleEvents(r, tlSet).length;
        for (let i = 0; i < 10 && visibleCount < 15; i++) {
          if (gen !== genRef.current) return; // 방 전환됨 — 중단
          const timeline = tlSet?.getLiveTimeline() ?? r.getLiveTimeline();
          let more: boolean;
          try {
            more = await client.paginateEventTimeline(timeline, {
              backwards: true,
              limit: 30,
            });
            pages++;
          } catch (e) {
            console.warn("[fillUntilVisible] paginate 실패:", e);
            break;
          }
          if (gen !== genRef.current) return; // await 사이 방 전환됨
          decryptPending(client, timeline.getEvents());
          // paginate 후 한 번만 필터 — 조건용 카운트와 commit이 같은 배열을 공유.
          const next = visibleEvents(r, tlSet);
          visibleCount = next.length;
          commit(r, gen, next);
          if (!more) {
            if (gen === genRef.current) setHasMore(false);
            break;
          }
        }
        endFill(`pages=${pages} visible=${visibleCount}`);
        endSwitchTotal();
      } finally {
        loadingOlderRef.current = false;
      }
    };

    const bind = () => {
      const r = client.getRoom(roomId);
      if (!r) return false;
      setRoom(r);
      decryptPending(client, r.getLiveTimeline().getEvents());
      commit(r, gen);
      // MSC3874: 스레드 답글 제외 필터드 타임라인 → 이후 페이지네이션은
      // 서버가 스레드 답글 빼고 줌 (빈 페이지 데드락 원천 차단)
      void (async () => {
        const endFilter = perfSpan("room:filter");
        const tlSet = await getNoThreadTimelineSet(client, r);
        endFilter(tlSet ? undefined : "fallback=live");
        if (gen !== genRef.current) return; // await 사이 방 전환됨
        tlSetRef.current = tlSet;
        if (tlSet) commit(r, gen);
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
      if (r) commit(r, gen);
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
    // m.replace 이벤트는 visibleEvents에서 필터되므로 events 배열 시그니처가
    // 동일 → commit()이 dedup으로 setEvents 스킵 → groupTimeline 재실행 안 됨
    // → eventVersion(=contentVersion prop)이 갱신 안 됨 → EventLine 안 그려짐.
    // 해결: m.replace 감지 시 receiptEpoch을 올려 시그니처를 강제로 흔든다 →
    // setEvents 통과 → groupTimeline 재실행 → contentVersion 변경 → memo 리렌더.
    const isReplaceEvent = (ev: MatrixEvent): boolean =>
      ev.getRelation?.()?.rel_type === "m.replace" ||
      ev.isRelation?.("m.replace") === true;
    const onTimeline = (ev: MatrixEvent, r?: Room) => {
      if (r?.roomId !== roomId) return;
      if (isReplaceEvent(ev)) receiptEpochRef.current++;
      refresh();
    };
    const onDecrypted = (ev: MatrixEvent) => {
      if (ev.getRoomId() !== roomId) return;
      // 복호화된 게 m.replace이면 동일하게 epoch 트리거
      if (isReplaceEvent(ev)) receiptEpochRef.current++;
      refresh();
    };
    // E2EE 수정(m.replace)은 복호화 후 비동기로 원본에 합쳐짐(makeReplaced)
    // → 그 시점에 다시 그려야 최종 수정 내용이 보임 (스트리밍 봇 메시지).
    // 주의: SDK는 MatrixEventEvent.Replaced를 localEvent(=내가 보낸 메시지)에만
    // re-emit (client.ts:2862). 원격 sender 메시지의 m.replace는 이 리스너에
    // 안 옴 — onTimeline / onDecrypted에서 잡는다.
    const onReplaced = (ev: MatrixEvent) => {
      if (ev.getRoomId() === roomId) {
        receiptEpochRef.current++;
        refresh();
      }
    };
    // 스레드 답글 수 배지 갱신
    const onThreadUpdate = () => refresh();
    // local echo 상태 변화(전송중→완료/실패) — 실패 표시/재전송 UI의 데이터 소스
    const onLocalEcho = (_ev: MatrixEvent, r: Room) => {
      if (r.roomId === roomId) refresh();
    };
    // 읽음 receipt 도착 — ReadReceipts(아바타 스택) 갱신.
    // receipt는 events 내용을 안 바꾸므로 epoch을 올려 dedup을 우회 →
    // 새 배열을 강제로 내보내 리렌더 트리거(기존 동작 보존).
    const onReceipt = (_ev: MatrixEvent, r: Room) => {
      if (r.roomId === roomId) {
        receiptEpochRef.current++;
        refresh();
      }
    };
    client.on(RoomEvent.Timeline, onTimeline);
    client.on(MatrixEventEvent.Decrypted, onDecrypted);
    client.on(MatrixEventEvent.Replaced, onReplaced);
    client.on(RoomEvent.LocalEchoUpdated, onLocalEcho);
    client.on(RoomEvent.Receipt, onReceipt);
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
      client.off(RoomEvent.Receipt, onReceipt);
      const r = client.getRoom(roomId);
      r?.off(ThreadEvent.Update, onThreadUpdate);
      r?.off(ThreadEvent.NewReply, onThreadUpdate);
    };
  }, [client, roomId, commit]);

  /** 과거 페이지 로드. 더 가져왔으면 true (동시 호출은 무시) */
  const loadOlder = useCallback(async (): Promise<boolean> => {
    if (!room || loadingOlderRef.current || !hasMore) return false;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const gen = genRef.current;
    const endOlder = perfSpan("older:page");
    try {
      const timeline =
        tlSetRef.current?.getLiveTimeline() ?? room.getLiveTimeline();
      const more = await client.paginateEventTimeline(timeline, {
        backwards: true,
        limit: 60,
      });
      if (gen !== genRef.current) return false; // await 사이 방 전환됨
      setHasMore(more);
      decryptPending(client, timeline.getEvents());
      commit(room, gen);
      endOlder(`events=${timeline.getEvents().length}`);
      return true;
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [client, room, hasMore, commit]);

  return { room, events, hasMore, loadingOlder, loadOlder };
}

/** 읽음 처리 훅: 탭이 보이는 상태에서 마지막 메시지가 바뀌면 receipt 전송.
 *  (없으면 다른 클라이언트에서 안읽음 배지가 영원히 안 꺼짐)
 *  스레드 이벤트면 SDK가 MSC3771 thread receipt로 보냄. */
export function useReadReceipt(
  client: MatrixClient | null,
  events: MatrixEvent[],
): void {
  // 마지막으로 receipt를 보낸 (방·이벤트) 페어 — 방 전환 시 자동 리셋되도록
  // 키에 방 id를 같이 넣는다. 기존엔 event id만 저장해서, 방 A→B로 이동했을 때
  // B의 마지막 이벤트가 우연히 같은 id 아니어도 lastReceiptRef가 stale 상태로
  // 남아 즉시 전송 path를 안 타는 케이스가 있었음(특히 빠른 전환 race).
  const lastReceiptRef = useRef<string | null>(null);
  useEffect(() => {
    if (!client || events.length === 0) return;
    const last = events[events.length - 1];
    const id = last.getId();
    if (!id) return;
    const roomId = last.getRoomId() ?? "";
    const key = `${roomId}:${id}`;
    const sendReceipt = () => {
      if (document.visibilityState !== "visible") return;
      // "~"로 시작하면 local echo (서버 미확정) — receipt 불가
      if (id.startsWith("~") || lastReceiptRef.current === key) return;
      lastReceiptRef.current = key;
      client.sendReadReceipt(last).catch((e) => {
        lastReceiptRef.current = null; // 실패 시 재시도 허용
        console.warn("read receipt 실패:", e);
      });
    };
    // ★ 즉시 1회 + rAF 후 1회 — 방 진입 직후 events가 아직 마지막이 안 잡힌
    //   타이밍(필터드 타임라인 commit이 비동기로 한 번 더 옴)을 흡수한다.
    //   같은 key는 위 guard로 중복 발사 안 됨.
    sendReceipt();
    const raf = requestAnimationFrame(sendReceipt);
    // 백그라운드에서 새 메시지 → 탭으로 돌아왔을 때 읽음 처리
    document.addEventListener("visibilitychange", sendReceipt);
    window.addEventListener("focus", sendReceipt);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", sendReceipt);
      window.removeEventListener("focus", sendReceipt);
    };
  }, [client, events]);
}

/** 안읽음 마커 훅: 방 진입 시점의 "여기까지 읽음" 이벤트 id를 1회 캡처.
 *  이후 receipt가 갱신돼도 마커는 고정 — 방을 나갔다 들어오면 재캡처.
 *  주의: useReadReceipt보다 먼저 호출해야 함 (effect 실행 순서 —
 *  receipt 전송으로 로컬 읽음 위치가 끝으로 가버리기 전에 캡처) */
export function useUnreadMarker(
  room: Room | null,
  myUserId: string,
): string | null {
  const [marker, setMarker] = useState<string | null>(null);
  const capturedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!room || capturedForRef.current === room.roomId) return;
    capturedForRef.current = room.roomId;
    setMarker(room.getEventReadUpTo(myUserId));
  }, [room, myUserId]);
  return marker;
}
