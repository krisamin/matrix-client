# Variant: dense-dark v2 (확정 후보)

001 dense-dark에 마로 피드백 반영한 버전.

## 마로 피드백 반영 사항
1. **스레드 = 트리의 자식 노드** — 룸/DM 아래 뎁스에 `message-square-text` 아이콘으로 표시, 안읽음 배지 지원
2. **스레드 화면 = 메인 채팅과 100% 동일 구조** — 헤더/메시지 행/hover 액션/리액션/입력창 전부 같은 컴포넌트. 별도 "패널" 디자인 없음
3. **세 가지 뷰 모드**
   - `chat`: 채팅만
   - `split`: 채팅방 안에서 스레드 클릭 → 좌우 50:50 분할
   - `thread-full`: 트리에서 스레드 클릭 or 분할 상태에서 maximize → 스레드가 일반 채팅처럼 풀 화면
4. **아바타** — Space/Room = 정사각형 + rounded(4px), DM 유저 = 완전 원형. mxc 아바타 (목업은 dicebear placeholder)
5. **폰트** — 본문 Wanted Sans, 고정폭 Fira Code (시간/룸ID/배지/코드)

## 실구현 시 매핑 노트
- 트리 스레드 노드: `room.getThreads()` 중 최근 활동순 N개 (전부는 과함) 또는 안읽음 있는 것만
- 뷰 모드 상태는 URL로: `/room/:id` / `/room/:id/thread/:threadId` (풀) / 쿼리 `?thread=` (분할)
- 스레드 풀 화면의 헤더 뒤로가기 → 부모 룸으로
