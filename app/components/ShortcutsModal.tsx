import { useT } from "../lib/i18n";
import { Modal, ModalHeader } from "./Modal";
import { Kbd } from "./Kbd";

/** 키보드 단축키 안내 모달 — `?` 또는 `Ctrl+/`로 열림. */
export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const isMac =
    typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
  const mod = isMac ? "⌘" : "Ctrl";

  const rows: Array<[string, string]> = [
    [`${mod} K`, t("shortcuts.switch")],
    [`${mod} F`, t("shortcuts.search")],
    ["Esc", t("shortcuts.close")],
    ["Enter", t("shortcuts.send")],
    [`Shift Enter`, t("shortcuts.newline")],
    ["?", t("shortcuts.help")],
  ];

  return (
    <Modal onClose={onClose} size="sm">
      <ModalHeader title={t("shortcuts.title")} />
      <div className="flex flex-col divide-y divide-line">
        {rows.map(([keys, label]) => (
          <div key={keys} className="flex items-center px-4 py-2.5 text-[13px]">
            <span className="flex-1 text-fg-1">{label}</span>
            <span className="flex shrink-0 items-center gap-1">
              {keys.split(" ").map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
