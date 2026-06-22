# Matrix 방/Space 풀셋 설정 구현 플랜

> **For Hermes:** 단계별로 진행. 각 Phase 끝마다 typecheck/biome/build/헤드리스 검증/커밋.

**Goal:** 방·Space 생성 시 공개/비공개·alias·권한 같은 핵심 옵션을 노출하고, 생성 후에는 모든 설정을 사후 편집할 수 있게 한다 (Element/Discord와 동급의 권한·접근 풀셋).

**Architecture:**
- `lib/matrix.ts`에 단일 책임 헬퍼들을 추가 (createRoom 옵션 확장, set* 시리즈, 알리아스 헬퍼). UI는 시안 합의된 B-final 톤(divide-y row 그리드 + 풀폭 버튼) 그대로 따라간다.
- 생성 폼은 "기본"과 "고급" 두 단계로 — 기본만 채워도 동작, 고급 펼치면 권한/알리아스/공개여부까지.
- 사후 편집은 RoomInfoPane(방)과 SpaceView(Space)에서 톱니바퀴 → `RoomSettingsModal` / `SpaceSettingsModal`로 진입. 탭: **일반 / 접근 / 권한 / 위험**.

**Tech Stack:** matrix-js-sdk (`createRoom`, `sendStateEvent`, `setRoomName/Topic`, `setPowerLevel`, `setGuestAccess`), React 19, react-router 7, tailwindcss v4.

---

## Matrix 스펙 매핑 (구현 전 정독)

### 생성 시 옵션 (`ICreateRoomOpts`)
| UI 항목 | API 필드 | 값 |
|---|---|---|
| 이름 | `name` | string |
| 주제 | `topic` | string |
| 공개 디렉토리 노출 | `visibility` | `Visibility.Public` / `Private` (홈서버 공개 방 목록에 보일지) |
| 프리셋 | `preset` | `PrivateChat` / `TrustedPrivateChat` / `PublicChat` |
| 별칭 (alias) | `room_alias_name` | localpart만 (`#name:server` 자동 조합) |
| 초기 권한 오버라이드 | `power_level_content_override` | 객체 |
| 초기 상태(암호화 등) | `initial_state` | `[{type, state_key, content}]` |
| 초대 | `invite` | userId[] |
| Space 여부 | `creation_content.type` | `m.space` |

### 사후 편집 상태 이벤트
| 항목 | 이벤트 타입 | content | 메서드 |
|---|---|---|---|
| 이름 | `m.room.name` | `{name}` | `setRoomName(roomId, name)` |
| 주제 | `m.room.topic` | `{topic}` | `setRoomTopic(roomId, topic)` |
| 아바타 | `m.room.avatar` | `{url: mxc}` | `sendStateEvent` |
| 알리아스 | `m.room.canonical_alias` | `{alias, alt_aliases?}` | `sendStateEvent` (별도 `PUT /directory/room/{alias}`로 등록 필요) |
| 가입 규칙 | `m.room.join_rules` | `{join_rule: invite/public/knock/restricted}` | `sendStateEvent` |
| 게스트 접근 | `m.room.guest_access` | `{guest_access: can_join/forbidden}` | `setGuestAccess` |
| 히스토리 가시성 | `m.room.history_visibility` | `{history_visibility: invited/joined/shared/world_readable}` | `sendStateEvent` |
| 권한 | `m.room.power_levels` | `RoomPowerLevelsEventContent` | `sendStateEvent` 또는 `setPowerLevel(roomId, userId, lvl)` |

### 권한 모델 (PowerLevel)
- 사용자별: `users[userId] = 0~100`. 빈 칸은 `users_default`(보통 0).
- 액션별 기본: `events_default`(메시지 보내기), `state_default`(상태 이벤트), `invite`, `kick`, `ban`, `redact`.
- 이벤트별: `events[type] = N` — 예: `m.room.name`만 admin이 바꾸게.
- 관례: **0 멤버 / 50 모더레이터 / 100 관리자**. (Element 동일)

### 권한 변경 안전장치 (필수)
- **자기 자신을 강등하면 복구 불능** → "내 PL이 떨어지는 변경"은 확인 모달.
- 대상 PL이 내 PL 이상이면 변경 자체가 서버에서 거부됨. UI에서도 사전 차단.
- `room.currentState.maySendStateEvent("m.room.power_levels", myUserId)` 권한 가드.

---

## Phase 0: 합의 ★

마로 결정 필요한 것:
1. **DM 설정 편집**: 1:1 DM에도 RoomSettingsModal 노출할지? (보통은 의미 적음 — 권한 편집·공개 알리아스 등 무관). **제안: DM은 "방 정보 보기" 그대로, 일반 방·Space에만 설정.**
2. **알리아스 등록**: `#name:server` 별칭 등록은 디렉토리 등록 API(`/directory/room/{alias}`)도 같이 호출해야 검색 가능. 구현 범위에 포함할지? **제안: 포함 (반쪽짜리면 공개 방 의미 약함).**
3. **권한 UI 깊이**:
   - (a) **간단**: 멤버별 역할(멤버/모더레이터/관리자) 드롭다운만 + 기본 액션 PL.
   - (b) **풀**: 위 + 이벤트별 PL(특정 상태이벤트만 따로) 전부.
   - **제안: (a)부터 — Element도 일반 사용자에겐 (a)만 보여줌. (b)는 "고급" 토글 뒤로.**
4. **단계별 진행 방식**: Phase 1→2→3 순차로 갈지, 아니면 더 작게 쪼개서 매 Phase 마로 검수 받을지? **제안: 매 Phase 끝에 검수 — 헛다리 짚으면 손해 큼.**

→ 합의 후 Phase 1부터.

---

## Phase 1: 생성 옵션 확장 (방)

**Goal:** NewRoomModal에 "고급" 토글 추가 → 공개 디렉토리 노출 / alias / 가입 규칙 / 게스트 접근 / 히스토리 가시성 선택. encrypted 토글은 그대로 유지.

### Task 1.1: `lib/matrix.ts`에 `createGroupRoom` 옵션 확장
- `visibility?: Visibility`
- `aliasLocalpart?: string` — 검증 후 `room_alias_name`에 전달
- `joinRule?: JoinRule` — `initial_state`에 `m.room.join_rules`로 (preset이 잘못 덮어쓰지 않게)
- `guestAccess?: GuestAccess` — `initial_state`
- `historyVisibility?: HistoryVisibility` — `initial_state`
- 검증: 빈 객체로 호출하면 기존 동작 100% 동일 (회귀 0)

### Task 1.2: NewRoomModal 고급 섹션
- divide-y row 패턴 그대로
- "고급 설정" 헤더로 접기/펼치기 (`<details>` 또는 useState)
- 각 항목: 라벨 + select/input + 짧은 설명(text-fg-3)

### Task 1.3: 검증 (헤드리스로 모달 톤 확인 + 빌드)

---

## Phase 2: 생성 옵션 확장 (Space)

**Goal:** NewSpaceModal에도 동일 옵션. Space는 암호화/게스트 접근 무의미 → join_rule, history_visibility(보통 `world_readable`/`invited`), alias만.

### Task 2.1: `createSpace` 옵션 확장 + alias 지원
### Task 2.2: NewSpaceModal 고급 섹션
### Task 2.3: 검증

---

## Phase 3: RoomSettingsModal (사후 편집)

**Goal:** 방의 모든 설정을 탭으로. B-final 톤 + 좌측 탭 + 우측 내용.

### Task 3.1: `lib/matrix.ts` 헬퍼
- `setRoomNameTopic(client, roomId, {name?, topic?})`
- `setRoomJoinRule(client, roomId, rule)` — `sendStateEvent`
- `setRoomHistoryVisibility(...)`, `setRoomGuestAccess(...)`
- `setRoomCanonicalAlias(...)` — 디렉토리 등록 포함
- 모두 권한 확인 후 사전 거절

### Task 3.2: 탭 일반 — 이름/주제/아바타 편집
### Task 3.3: 탭 접근 — 공개 디렉토리/alias/join_rule/guest/history
### Task 3.4: 탭 권한 — 멤버별 역할 + 기본 액션 PL
### Task 3.5: 탭 위험 — 방 업그레이드(룸 버전 마이그레이션은 별도)/삭제(나가기 + 모두 강퇴)
### Task 3.6: RoomInfoPane에서 ⚙ 버튼으로 진입

---

## Phase 4: SpaceSettingsModal

**Goal:** Space 전용 설정 모달. Space는 메시지 없음 → "권한" 탭이 핵심(누가 방 추가 가능 등).

### Task 4.1: SpaceView 헤더에 ⚙ 버튼
### Task 4.2: 탭 일반/접근/권한 (history는 `world_readable`/`invited`만)
### Task 4.3: Space 멤버 관리(초대/강퇴/역할)

---

## Phase 5: 권한 변경 안전장치

### Task 5.1: 자기 강등 확인 모달
### Task 5.2: 권한 부족 시 사전 차단 (회색+툴팁)
### Task 5.3: 변경 실패(403) 친절한 에러 메시지

---

## 회귀 위험

- 기존 NewRoom/NewSpaceModal은 빈 옵션으로 호출 → 헬퍼가 정확히 기존과 동일 페이로드 만드는지 단위 테스트는 안 짜고 헤드리스 + 실서버 검증.
- `initial_state`에 같은 type을 2번 넣으면 preset과 충돌. preset이 만드는 기본 state와 우리가 추가하는 것 사이 우선순위 확인 필요.
