# Variant: airy-dark

## Design stance
개발자 도구의 어두움 + 모던 메신저의 여유 — Linear/Raycast 감성.

## Key choices
- Layout: 268px 사이드바(트리 대신 섹션+인덴트 그룹) + 둥근 카드형 메인 영역(rounded-xl로 떠 있음)
- Typography: 14px, 한국어 친화적 줄간격(relaxed)
- Color: neutral 계열, 배경 3단계(사이드바 < 메인 카드 < 코드블록)로 깊이 표현
- Message: 사각 아바타 컬럼 (이니셜), 그룹당 한 번 표시
- Interaction: hover 플로팅 액션, 스레드 요약이 큰 카드 버튼

## Trade-offs
- Strong at: 첫인상, 읽기 편안함, 아바타 덕에 화자 구분 빠름
- Weak at: 화면당 메시지 수 적음, 001 대비 "도구" 느낌 덜함

## Best for
오래 머무르는 메인 메신저로 쓸 때. 데스크톱+태블릿 겸용.
