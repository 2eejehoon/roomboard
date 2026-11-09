# 채팅 서명 검증은 본문 앞 필드에 구분자가 있으면 거부한다

- 날짜: 2026-11-09
- 대상: specs/001-realtime-room-board/research.md R14, contracts/websocket.md `chat.sig`, tasks.md T069·T072
- 출처: 001 US4 PR (T068~T074)
- 대체한 판례: 없음

## 결정

- 서명 문자열은 websocket.md 그대로 `"chat|" + roomId|messageId|nickname|text|sentAt|channel`이다. 패딩 없는 base64url(43자).
- 검증(`verifyChat`)은 `roomId`·`messageId`·`nickname`에 `|`가 있으면 서명을 보지 않고 거부한다. `text`에는 `|`가 있어도 된다.
- 비교는 `crypto.subtle.verify`로 한다(상수 시간).

## 이유

필드를 `|`로 이어 붙이기 때문에, 신고자가 본문 앞부분을 닉네임 뒤로 옮겨도(`닉|앞` + `뒤`) 서명 문자열이 같아진다.
본문 앞 필드는 서버가 만든 값이라 `|`가 들어갈 일이 없다. 그러면 본문 위치가 하나로 정해진다(뒤의 `sentAt`·`channel`은 정수).

## 검토한 대안

- 필드마다 길이를 앞에 붙이는 형식: 계약 문자열이 바뀌고 읽기 어렵다.
- 필드를 JSON 배열로 서명: 같은 이유로 계약 변경이 필요하다. 지금 형식에 검사 한 줄이면 충분하다.
