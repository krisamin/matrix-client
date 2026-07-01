import { ShieldAlert, ShieldQuestion } from "lucide-react";
import type { MatrixClient, MatrixEvent } from "matrix-js-sdk";
import {
  EventShieldColour,
  EventShieldReason,
} from "matrix-js-sdk/lib/crypto-api";
import { useShield } from "../hooks/useShield";
import { useT } from "../lib/i18n";

/** E2EE 메시지 shield 아이콘. NONE이면 표시 안 함. */
export function ShieldIcon({
  client,
  ev,
}: {
  client: MatrixClient;
  ev: MatrixEvent;
}) {
  const t = useT();
  const info = useShield(client, ev);
  if (!info || info.colour === EventShieldColour.NONE) return null;
  const reasonKey = (() => {
    switch (info.reason) {
      case EventShieldReason.UNVERIFIED_IDENTITY:
        return "shield.unverifiedIdentity";
      case EventShieldReason.UNSIGNED_DEVICE:
        return "shield.unsignedDevice";
      case EventShieldReason.UNKNOWN_DEVICE:
        return "shield.unknownDevice";
      case EventShieldReason.AUTHENTICITY_NOT_GUARANTEED:
        return "shield.authenticityNotGuaranteed";
      case EventShieldReason.MISMATCHED_SENDER_KEY:
        return "shield.mismatchedSender";
      case EventShieldReason.SENT_IN_CLEAR:
        return "shield.unsafeSource";
      default:
        return null;
    }
  })();
  const isRed = info.colour === EventShieldColour.RED;
  const titleBase = isRed ? t("shield.red.title") : t("shield.grey.title");
  const title = reasonKey ? `${titleBase} — ${t(reasonKey)}` : titleBase;
  const Icon = isRed ? ShieldAlert : ShieldQuestion;
  return (
    <span
      title={title}
      className={`shrink-0 ${isRed ? "text-red-400" : "text-fg-3"}`}
    >
      <Icon className="h-3 w-3" />
    </span>
  );
}
