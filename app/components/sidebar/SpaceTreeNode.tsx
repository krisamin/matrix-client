import { ChevronDown, ChevronRight } from "lucide-react";
import type { MatrixClient } from "matrix-js-sdk";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { roomPath } from "../../lib/format";
import { useT } from "../../lib/i18n";
import type { SpaceNode } from "../../lib/spaces";
import { RoomAvatar } from "../Avatar";
import { RoomNode } from "./RoomNode";

/** Space 트리 노드 — 접을 수 있는 부모, 아래 하위 Space/방 재귀 렌더.
 *  chevron 클릭=펼치기/접기, 이름 클릭=Space 홈으로 이동 */
export function SpaceTreeNode({
  client,
  node,
  activeRoomId,
  activeThreadId,
}: {
  client: MatrixClient;
  node: SpaceNode;
  activeRoomId?: string;
  activeThreadId?: string;
}) {
  const t = useT();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const avatarSize = isMobile ? 22 : 16;
  /** 이 Space 서브트리에 활성 방이 들어있는지 (있으면 자동 펼침 유지) */
  const containsActive = (n: SpaceNode): boolean =>
    n.rooms.some((r) => r.roomId === activeRoomId) ||
    n.children.some(containsActive);
  const [collapsed, setCollapsed] = useState(false);
  const expanded = !collapsed || containsActive(node);
  const active = activeRoomId === node.space.roomId;

  return (
    <div>
      <div className={`tree-row group/row ${active ? "active" : ""}`}>
        <div className="flex shrink-0 items-center">
          <RoomAvatar client={client} room={node.space} size={avatarSize} />
        </div>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5"
          onClick={() => navigate(roomPath(node.space.roomId))}
        >
          <span className="min-w-0 flex-1 truncate text-left font-medium text-fg-0">
            {node.space.name}
          </span>
        </button>
        {/* 우측 펼침 chevron — 데스크탑/모바일 공통. 기존 "avatar→chevron hover
            교체" 결은 모바일 호환·발견성 모두 떨어져 버리고, 좌측 avatar는
            그대로 두고 우측에 항상 표시되는 chevron으로 통일.
            높이는 avatar(16px)와 맞춰 행이 커지지 않게. 터치 hit은 -m으로 확장. */}
        <button
          type="button"
          className="flex h-4 w-4 shrink-0 items-center justify-center text-fg-2 hover:text-fg-0"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setCollapsed((v) => !v);
          }}
          aria-label={t(expanded ? "sidebar.collapse" : "sidebar.expand")}
          title={t(expanded ? "sidebar.collapse" : "sidebar.expand")}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>
      </div>
      {expanded && (
        <div className="tree-children">
          {node.children.map((child) => (
            <SpaceTreeNode
              key={child.space.roomId}
              client={client}
              node={child}
              activeRoomId={activeRoomId}
              activeThreadId={activeThreadId}
            />
          ))}
          {node.rooms.map((room) => (
            <RoomNode
              key={room.roomId}
              client={client}
              room={room}
              active={activeRoomId === room.roomId}
              activeThreadId={
                activeRoomId === room.roomId ? activeThreadId : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
