# 채팅 신고 스냅샷은 서버 서명으로 검증

- 날짜: 2026-11-06
- 대상: specs/001-realtime-room-board/research.md R14, contracts/websocket.md `chat.sig`, contracts/openapi.yaml `/reports`
- 출처: 001 plan, PR #3
- 대체한 판례: 없음

## 결정

판례 2026-11-06-chat-report-snapshot을 구체화한다(대체 아님). 서버는 브로드캐스트하는 채팅마다 HMAC 서명을 붙이고, 신고 시 클라이언트가 받은 메시지와 서명을 보내면 Worker가 검증해 스냅샷으로 저장한다. 서명 유효 기간은 24시간.

## 이유

Hibernation된 DO는 메모리가 비워질 수 있어서 메모리 버퍼 방식은 조용한 방에서 신고가 실패한다. 서명 방식은 채팅을 저장하지 않으면서 위조를 막는다.

## 검토한 대안

DO 메모리 최근 100개 버퍼(Hibernation 시 유실), DO 저장소에 최근 채팅 저장(채팅 미저장 결정 위반).
