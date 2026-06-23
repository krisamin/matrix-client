/** 한국어 사전 — 마스터.
 *  새 키 추가 시 ko 먼저, 그 다음 en/ja도 같은 키 채울 것. */
export const ko = {
  // 사이드바 섹션 라벨
  "sidebar.invites": "초대",
  "sidebar.dms": "대화",
  "sidebar.spaces": "스페이스",
  "sidebar.rooms": "방",
  "sidebar.empty": "아직 대화가 없어요. 위 + 버튼으로 새 대화를 시작해 보세요.",

  // 사이드바 헤더 액션
  "sidebar.action.new": "새로 만들기",
  "sidebar.action.settings": "설정",
  "sidebar.action.logout": "로그아웃",
  "sidebar.action.profile": "프로필 편집",
  "sidebar.create.dm": "새 대화",
  "sidebar.create.room": "새 방",
  "sidebar.create.space": "새 Space",

  // 방 우클릭 메뉴
  "sidebar.context.favorite": "즐겨찾기",
  "sidebar.context.unfavorite": "즐겨찾기 해제",
  "sidebar.context.mute": "알림 끄기",
  "sidebar.context.unmute": "알림 켜기",

  // 초대 row
  "invite.accept": "수락",
  "invite.reject": "거절",

  // 공통 액션
  "common.cancel": "취소",
  "common.save": "저장",
  "common.saving": "저장 중…",
  "common.create": "만들기",
  "common.creating": "만드는 중…",
  "common.close": "닫기",
  "common.confirm": "확인",
  "common.delete": "삭제",
  "common.copy": "복사",
  "common.copied": "복사됨",
  "common.search": "검색",
  "common.loading": "불러오는 중…",
  "common.empty": "결과 없음",

  // 메시지 호버 툴바
  "message.action.react": "리액션",
  "message.action.reply": "답장",
  "message.action.thread": "스레드",
  "message.action.forward": "전달",
  "message.action.copyMarkdown": "마크다운 원본 복사",
  "message.action.pin": "고정",
  "message.action.unpin": "고정 해제",
  "message.action.edit": "수정",
  "message.action.delete": "삭제",

  // 메시지 입력
  "input.placeholder.room": "메시지 입력",
  "input.placeholder.thread": "스레드에 답장",
  "input.attach": "파일 첨부",
  "input.emoji": "이모지",
  "input.send": "전송 (⌘/Ctrl + Enter)",
  "input.replyCancel": "답장 취소",

  // 모달 헤더
  "modal.newRoom.title": "새 방 만들기",
  "modal.newSpace.title": "새 Space 만들기",
  "modal.newDm.title": "새 대화 시작",
  "modal.forward.title": "메시지 전달",
  "modal.profile.title": "프로필 편집",
  "modal.roomSettings.title": "방 설정",
  "modal.spaceSettings.title": "Space 설정",
  "modal.appSettings.title": "설정",

  // 설정 모달 (앱 설정)
  "settings.section.general": "일반",
  "settings.section.account": "계정",
  "settings.lang": "표시 언어",
  "settings.lang.desc": "기본은 브라우저 설정을 따릅니다.",
  "settings.account.profile": "프로필 편집",
  "settings.account.logout": "로그아웃",

  // 검색 패널
  "search.placeholder.local": "검색 (로드된 메시지에서)…",
  "search.placeholder.server": "검색 (Enter)…",
  "search.empty": "결과 없음",
  "search.loadMore": "결과 더 보기",
  "search.deepenLocal": "과거 더 불러와서 검색",
  "search.localCount": "로드된 {{total}}개 중 {{hits}}건",

  // 방 정보 패널
  "roomInfo.title": "방 정보",
  "roomInfo.encrypted": "종단간 암호화됨",
  "roomInfo.notEncrypted": "암호화 안 됨",
  "roomInfo.members": "멤버",
  "roomInfo.invite": "초대",
  "roomInfo.leave": "방 나가기",
  "roomInfo.leaveConfirm": "정말 나갈까?",
  "roomInfo.leaveWarnEncrypted":
    "암호화 방은 다시 들어와도 이전 메시지를 못 읽을 수 있어.",
  "roomInfo.member.me": "(나)",

  // 사이드바 푸터
  "footer.sync.starting": "starting",
  "footer.sync.connecting": "연결 중",
  "footer.sync.synced": "동기화됨",
} as const;

export type DictKey = keyof typeof ko;
