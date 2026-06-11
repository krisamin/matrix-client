import { EventType, type MatrixClient, type Room } from "matrix-js-sdk";
import { KnownMembership } from "matrix-js-sdk/lib/types";
import { getDmUserId } from "./matrix";

/** Space 트리 노드 — Space 하나 + 하위 Space/방 (재귀) */
export interface SpaceNode {
  space: Room;
  children: SpaceNode[];
  rooms: Room[];
}

/** 사이드바 트리 전체 */
export interface RoomTree {
  /** DM 방 (m.direct) — Space에 속해 있어도 Direct 섹션 우선 */
  dms: Room[];
  /** 최상위 Space들 (다른 Space의 자식이 아닌 것) */
  spaces: SpaceNode[];
  /** 어느 Space에도 속하지 않은 일반 방 */
  orphanRooms: Room[];
}

/** Space 방의 m.space.child state → 자식 roomId 목록.
 *  content가 빈 이벤트는 "관계 해제"를 뜻하므로 제외 (스펙). */
function childRoomIds(space: Room): string[] {
  return space.currentState
    .getStateEvents(EventType.SpaceChild)
    .filter((ev) => {
      const content = ev.getContent();
      return content && Object.keys(content).length > 0;
    })
    .map((ev) => ev.getStateKey()!)
    .filter(Boolean);
}

/**
 * 참여중 방 목록 → Space 계층 트리.
 *
 * - Space = m.space 타입 방. 계층은 부모 Space의 m.space.child로 판단
 *   (자식의 m.space.parent는 보조 신호라 child 쪽만 신뢰해도 충분)
 * - 같은 방이 여러 Space에 속하면 각각에 표시 (Matrix 스펙상 다대다)
 * - 미참여(미리보기) 자식 방은 트리에 안 넣음 — getRoom() null이거나 join 아님
 * - 순환 참조(Space A ⊂ B ⊂ A)는 visited 가드로 차단
 */
export function buildRoomTree(client: MatrixClient, rooms: Room[]): RoomTree {
  const joined = rooms.filter(
    (r) => r.getMyMembership() === KnownMembership.Join,
  );
  const dms = joined.filter((r) => !r.isSpaceRoom() && getDmUserId(client, r));
  const spaces = joined.filter((r) => r.isSpaceRoom());
  const normalRooms = joined.filter(
    (r) => !r.isSpaceRoom() && !getDmUserId(client, r),
  );

  const spaceById = new Map(spaces.map((s) => [s.roomId, s]));
  const roomById = new Map(normalRooms.map((r) => [r.roomId, r]));

  // 어떤 Space의 자식으로 등장하는 roomId 집합 (Space/방 공용)
  const childIds = new Set<string>();
  for (const space of spaces) {
    for (const id of childRoomIds(space)) childIds.add(id);
  }

  const buildNode = (space: Room, visited: Set<string>): SpaceNode => {
    visited.add(space.roomId);
    const children: SpaceNode[] = [];
    const childRooms: Room[] = [];
    for (const id of childRoomIds(space)) {
      const childSpace = spaceById.get(id);
      if (childSpace && !visited.has(id)) {
        children.push(buildNode(childSpace, visited));
        continue;
      }
      const room = roomById.get(id);
      if (room) childRooms.push(room);
    }
    return { space, children, rooms: childRooms };
  };

  // 최상위 = 다른 Space의 자식이 아닌 Space
  const topSpaces = spaces
    .filter((s) => !childIds.has(s.roomId))
    .map((s) => buildNode(s, new Set()));

  // 고아 방 = 어느 Space에도 안 속한 일반 방
  const orphanRooms = normalRooms.filter((r) => !childIds.has(r.roomId));

  return { dms, spaces: topSpaces, orphanRooms };
}
