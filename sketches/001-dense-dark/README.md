# Variant: dense-dark

## Design stance
VSCode 그 자체 — 13px 고밀도, 직각에 가까운 모서리, 정보 밀도 최우선.

## Key choices
- Layout: 240px 트리 사이드바 (인덴트 가이드라인 포함) + 플랫 메시지 로그 + 스레드 패널
- Typography: Wanted Sans 13px, 메타데이터(시간/ID/배지)는 모노스페이스
- Color: zinc 계열 무채색, 액센트 없음. 선택 상태는 배경 밝기로만 구분
- Message: 아바타 없음, sender+시간 한 줄 위에, 연속 메시지는 sender 생략
- Interaction: hover 시 메시지 우상단 플로팅 액션 바 (Slack 스타일)

## Trade-offs
- Strong at: 정보 밀도, 개발자 친숙함, 메시지 많을 때 스캔 속도
- Weak at: 처음 보면 다소 차가움, 터치 타겟 작음 (모바일 부적합)

## Best for
키보드 중심 데스크톱 헤비유저. 마로처럼 IDE에서 사는 사람.
