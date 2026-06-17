import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Virtualizer, type VirtualizerHandle } from "virtua";

/** 인증 없는 스크롤 동작 테스트 페이지. virtua reverse infinite scroll을
 *  가변 높이 mock 메시지로 검증한다. 실제 Timeline과 동일한 로직:
 *  - 초기 진입: 맨 아래
 *  - 과거 로드(prepend): shift로 위치 유지
 *  - append: 바닥 근처면 추적 */

type Msg = { id: number; height: number; text: string };

const LOAD_TRIGGER_PX = 400;

let nextId = 1;
function makeMsg(): Msg {
  const id = nextId++;
  // 가변 높이 (실제 메시지처럼 40~200px) — 이게 수동 보정을 깨뜨리던 핵심
  const height = 40 + Math.floor(Math.random() * 160);
  return { id, height, text: `메시지 #${id} (h=${height})` };
}

export default function ScrollTest() {
  const [msgs, setMsgs] = useState<Msg[]>(() =>
    Array.from({ length: 30 }, makeMsg),
  );
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const vRef = useRef<VirtualizerHandle>(null);
  const stickToBottomRef = useRef(true);
  // 초기 바닥 정렬: scheduled(중복 스케줄 방지) / done(onScroll 허용 시점).
  // rAF로 정렬이 끝난 뒤에 done=true → 그 전 onScroll의 loadOlder 폭주 차단.
  const initialScheduledRef = useRef(false);
  const initialDoneRef = useRef(false);
  const prevLastKeyRef = useRef<number | null>(null);
  const loadingRef = useRef(false);

  // prepend 감지를 데이터로 — flag(ref)는 async loadOlder + 중간 loading 렌더를
  // 못 버티고 useLayoutEffect 리셋에 죽는다. 대신 "첫 key가 바뀌고 마지막 key는
  // 그대로 + 길이 증가"면 이번 렌더가 prepend라고 렌더 중에 판정 → shift 켠다.
  const prevFirstKeyRef = useRef<number | null>(null);
  const prevLenRef = useRef(0);

  const addLog = useCallback((s: string) => {
    setLog((p) =>
      [`${new Date().toLocaleTimeString()} ${s}`, ...p].slice(0, 12),
    );
  }, []);

  const firstKey = msgs.length > 0 ? msgs[0].id : null;
  const lastKey = msgs.length > 0 ? msgs[msgs.length - 1].id : null;

  // 렌더 중 prepend 판정 (refs는 아래 useLayoutEffect에서 갱신)
  const isPrepend =
    msgs.length > prevLenRef.current &&
    firstKey !== prevFirstKeyRef.current &&
    lastKey === prevLastKeyRef.current;

  // 렌더 반영 후 비교 기준 갱신
  useLayoutEffect(() => {
    prevFirstKeyRef.current = firstKey;
    prevLenRef.current = msgs.length;
  });

  useEffect(() => {
    const handle = vRef.current;
    if (!handle || msgs.length === 0) return;
    const lastIdx = msgs.length - 1;
    const endChanged = lastKey !== prevLastKeyRef.current;
    prevLastKeyRef.current = lastKey;

    // 초기 진입: 측정이 끝난 다음 프레임에 맨 아래로. rAF로 미뤄야 virtua가
    // 아이템을 측정한 뒤라 scrollToIndex가 정확히 바닥에 닿는다(측정 전 호출은
    // 부정확). didInitial 가드는 onScroll의 loadOlder 폭주를 막는 데도 쓰인다.
    if (!initialScheduledRef.current) {
      initialScheduledRef.current = true;
      requestAnimationFrame(() => {
        handle.scrollToIndex(lastIdx, { align: "end" });
        initialDoneRef.current = true;
        addLog(`초기진입 → rAF scrollToIndex(${lastIdx}, end)`);
      });
      return;
    }
    if (!isPrepend && endChanged && stickToBottomRef.current) {
      handle.scrollToIndex(lastIdx, { align: "end" });
      addLog(`append 바닥추적 → scrollToIndex(${lastIdx}, end)`);
    } else if (isPrepend) {
      addLog(`prepend (shift=true, virtua가 위치 유지)`);
    }
  }, [msgs.length, lastKey, isPrepend, addLog]);

  const loadOlder = useCallback(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoadingOlder(true);
    addLog("loadOlder 시작... (실제앱 흐름: 재무장 없음)");
    // 측정: prepend 직전 scrollTop/scrollHeight 기록
    const sc = scrollRef.current;
    const beforeTop = sc?.scrollTop ?? 0;
    const beforeH = sc?.scrollHeight ?? 0;
    // 네트워크 흉내 (300ms 지연) — 실제 앱처럼 isPrependRef 재무장 안 함.
    // onScroll에서 한 번 켠 게 중간 loadingOlder 렌더에서 리셋되는지 본다.
    setTimeout(() => {
      // 실제 앱은 여기서 isPrependRef를 다시 켜지 않는다 (부모가 events만 줌)
      setMsgs((p) => [...Array.from({ length: 20 }, makeMsg).reverse(), ...p]);
      loadingRef.current = false;
      setLoadingOlder(false);
      // prepend 반영 후 측정
      requestAnimationFrame(() => {
        const afterTop = sc?.scrollTop ?? 0;
        const afterH = sc?.scrollHeight ?? 0;
        const hGrew = afterH - beforeH;
        const topGrew = afterTop - beforeTop;
        addLog(
          `prepend 완료 — heightGrew=${hGrew} scrollTopGrew=${topGrew} ` +
            `${hGrew === topGrew ? "✓보존" : hGrew * 2 === topGrew ? "✗이중!" : "✗어긋남"}`,
        );
      });
    }, 300);
  }, [addLog]);

  const onScroll = useCallback(
    (offset: number) => {
      const handle = vRef.current;
      if (!handle) return;
      // 초기 측정 전(viewportSize=0)이거나 초기 정렬 전이면 트리거 금지 —
      // 측정 전 onScroll(offset≈0)이 loadOlder를 연쇄 발화하는 폭주 차단.
      if (handle.viewportSize === 0 || !initialDoneRef.current) return;
      stickToBottomRef.current =
        offset - handle.scrollSize + handle.viewportSize >= -1.5;
      if (offset < LOAD_TRIGGER_PX && !loadingRef.current) {
        loadOlder();
      }
    },
    [loadOlder],
  );

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "monospace" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minWidth: 0,
        }}
      >
        <div style={{ padding: 8, background: "#222", color: "#fff" }}>
          스크롤 테스트 — 위로 스크롤하면 과거 로드. 총 {msgs.length}개
          {loadingOlder && " · 로딩중..."}
          <button
            type="button"
            style={{ marginLeft: 12, padding: "2px 8px" }}
            onClick={() => {
              stickToBottomRef.current = true;
              setMsgs((p) => [...p, makeMsg()]);
            }}
          >
            + 새 메시지(append)
          </button>
        </div>
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
            overflowAnchor: "none",
            padding: "12px 0",
            background: "#f5f5f5",
          }}
        >
          <div style={{ flexGrow: 1 }} />
          <Virtualizer
            ref={vRef}
            scrollRef={scrollRef}
            shift={isPrepend}
            onScroll={onScroll}
          >
            {msgs.map((m) => (
              <div
                key={m.id}
                style={{
                  height: m.height,
                  margin: "4px 12px",
                  padding: 8,
                  background: m.id % 2 ? "#fff" : "#e8eef5",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  boxSizing: "border-box",
                }}
              >
                {m.text}
              </div>
            ))}
          </Virtualizer>
        </div>
      </div>
      <div
        style={{
          width: 320,
          padding: 8,
          background: "#111",
          color: "#0f0",
          fontSize: 11,
          overflowY: "auto",
        }}
      >
        <div style={{ color: "#fff", marginBottom: 8 }}>
          이벤트 로그 (최신순)
        </div>
        {log.map((l) => (
          <div key={l} style={{ marginBottom: 2 }}>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}
