import type { MatrixClient, MatrixEvent } from "matrix-js-sdk";
import type {
  EventShieldColour,
  EventShieldReason,
} from "matrix-js-sdk/lib/crypto-api";
import { useEffect, useState } from "react";

interface ShieldInfo {
  colour: EventShieldColour;
  reason: EventShieldReason | null;
}

/** 모듈 레벨 캐시 — 가상 스크롤로 EventLine이 재마운트되면 useShield
 *  effect가 다시 실행되며 crypto.getEncryptionInfoForEvent를 매번 호출.
 *  큰 방에서 스크롤 폭주하면 메인 스레드 freeze 유발.
 *  이벤트 id별로 결과 캐시 → 두 번째 호출부터 즉시 반환.
 *  ★ 캡: 세션이 길어지면(수만 메시지 스크롤) 무한 성장 — 상한 도달 시
 *  전체 클리어(단순·저비용, 재계산은 스크롤 시 자연 재충전). */
const SHIELD_CACHE_MAX = 5000;
const shieldCache = new Map<string, ShieldInfo | null>();
/** 진행 중 promise도 캐시 — 같은 이벤트가 동시에 여러 번 mount 시 1번만 호출. */
const inflight = new Map<string, Promise<ShieldInfo | null>>();

/** 메시지 한 건의 E2EE shield 상태 (Element 패턴).
 *  - colour: NONE(표시 안 함) / GREY(미인증 device 등) / RED(키 mismatch)
 *  - reason: shield 사유 (hover tooltip)
 *  E2EE 방의 메시지에만 의미 — 평문 방은 항상 NONE. */
export function useShield(
  client: MatrixClient,
  ev: MatrixEvent,
): ShieldInfo | null {
  const eventId = ev.getId();
  const cached = eventId ? shieldCache.get(eventId) : undefined;
  const [info, setInfo] = useState<ShieldInfo | null>(cached ?? null);

  useEffect(() => {
    const crypto = client.getCrypto();
    if (!crypto || !eventId) return;
    if (shieldCache.has(eventId)) {
      const c = shieldCache.get(eventId);
      if (c !== undefined) setInfo(c);
      return;
    }
    let cancelled = false;
    const existing = inflight.get(eventId);
    const p =
      existing ??
      crypto
        .getEncryptionInfoForEvent(ev)
        .then((res) => {
          const v: ShieldInfo | null = res
            ? { colour: res.shieldColour, reason: res.shieldReason }
            : null;
          if (shieldCache.size >= SHIELD_CACHE_MAX) shieldCache.clear();
          shieldCache.set(eventId, v);
          inflight.delete(eventId);
          return v;
        })
        .catch(() => {
          if (shieldCache.size >= SHIELD_CACHE_MAX) shieldCache.clear();
          shieldCache.set(eventId, null);
          inflight.delete(eventId);
          return null;
        });
    if (!existing) inflight.set(eventId, p);
    p.then((v) => {
      if (!cancelled) setInfo(v);
    });
    return () => {
      cancelled = true;
    };
  }, [client, ev, eventId]);
  return info;
}
