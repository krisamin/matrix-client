import { ChevronDown, ChevronRight } from "lucide-react";
import type { MatrixClient } from "matrix-js-sdk";
import { useState } from "react";
import { useNavigate } from "react-router";
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
        {/* Avatar 위에 chevron overlay — hover 시(또는 펼친 상태) 표시 */}
        <div className="relative shrink-0">
          <RoomAvatar client={client} room={node.space} size={16} />
          <button
            type="button"
            className="absolute inset-0 flex items-center justify-center bg-bg-2 text-fg-1 opacity-0 group-hover/row:opacity-100"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCollapsed((v) => !v);
            }}
            title={t(expanded ? "sidebar.collapse" : "sidebar.expand")}
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
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
