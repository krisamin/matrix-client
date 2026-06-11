# Variant: light-mono

## Design stance
001 dense-dark의 라이트 버전 — 종이 위의 코드 에디터, GitHub 감성.

## Key choices
- Layout: 001과 동일한 240px 트리 + 플랫 로그 (다크/라이트 비교용 쌍)
- Typography: 13.5px, 메타데이터 모노스페이스
- Color: zinc 라이트 스케일, 흰 배경 + zinc-50 사이드바/패널
- Message: 아바타 없음, 001과 동일 구조
- Interaction: 동일 (hover 액션 바)

## Trade-offs
- Strong at: 밝은 환경 가독성, 문서 느낌의 깔끔함
- Weak at: 보조 텍스트 대비가 낮아 한 단계 진하게 조정 필요 (실구현 시 zinc-400→500)

## Best for
라이트 모드 선호자. 001을 고르면 이게 라이트 테마 짝이 됨.
