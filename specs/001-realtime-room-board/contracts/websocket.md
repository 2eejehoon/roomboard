# WebSocket 메시지 명세 v1

연결: `GET /api/rooms/{roomId}/ws` (업그레이드, openapi.yaml 참고). 방 DO 하나가 그 방의 모든 채널을 맡는다.

## 공통 규칙

- 모든 메시지는 UTF-8 JSON 텍스트 프레임 하나다. 바이너리 프레임은 닫힘 코드 `1003`으로 끊는다.
- 모든 메시지에 `t`(종류) 필드가 있다. 스키마는 `src/core/protocol.ts`의 zod 스키마가 진실의 원천이고, 이 문서는 그것과
  같아야 한다(`tests/core/protocol.test.ts`가 이 문서의 JSON 예시를 스키마로 검사한다).
- 서버는 형식이 틀린 메시지를 버리고 `error {code: "bad_message"}`를 보낸다. 10초 안에 5번 틀리면 `4008`로 끊는다.
- 좌표는 미터 단위 `[x, y, z]`, 방향 `r`은 Y축 회전(라디안). 숫자는 소수점 2자리로 반올림해 보낸다.
- 시각은 Unix ms.
- 메시지 최대 크기 2KB. 넘으면 `1009`로 끊는다.

## 연결 수명

```text
client                                   server (Room DO)
  | -- HTTP upgrade ------------------------> |  방 없음 404 / 삭제됨 410
  | -- join -------------------------------> |  5초 안에 join이 없으면 4000으로 닫음
  | <------------------------------ welcome  |  채널 배정, 같은 채널 peers 목록
  | <------------------------- peer_joined   |  (다른 참가자들에게)
  | -- move / chat ------------------------> |
  | <------------- peer_moved / chat / ...   |
  | -- "ping" (텍스트) ---------------------> |  자동 응답 "pong" (DO를 깨우지 않음)
  | -- close ------------------------------> |
  |                              peer_left ->|  (같은 채널 다른 참가자들에게)
```

- 클라이언트는 20초마다 텍스트 `ping`을 보낸다(JSON 아님). 서버는 `pong`으로 자동 응답한다.
- 끊기면 클라이언트는 1s, 2s, 4s, 8s, 이후 15s 간격(±20% 지터)으로 다시 연결하고, 그동안 "다시 연결 중"을 보여준다(FR-015).
  다시 연결하면 새 `peerId`를 받지만 닉네임·아바타는 같다(기기 키에서 결정되므로).

## 클라이언트 → 서버

### `join`

```json
{ "t": "join", "v": 1, "deviceKey": "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b" }
```

- 연결 후 첫 메시지. 두 번째 `join`은 `bad_message`.
- `v`가 지원 버전이 아니면 `error {code: "unsupported_version"}` 후 `4002`로 닫는다.
- 서버는 기기 키 원문을 저장하지 않는다. 닉네임·아바타 계산에만 쓴다.

### `move`

```json
{ "t": "move", "p": [1.25, 0, -3.5], "r": 1.57, "a": "walk" }
```

- `a`: `idle` | `walk` | `run` | `jump`.
- 클라이언트는 위치나 상태가 바뀔 때만, 초당 최대 5번 보낸다. 멈추면 `a: "idle"`을 한 번 보낸다.
- 서버 검증(research R4): 테마 경계 밖, 마지막 위치에서 초속 8m를 넘는 이동은 거부하고 `correction`으로 마지막
  정상 위치를 돌려준다. 초당 10개를 넘으면 조용히 버린다.

### `chat`

```json
{ "t": "chat", "text": "안녕하세요", "nonce": "c-17" }
```

- `text` 1~200자(앞뒤 공백 제거 후). `nonce`는 클라이언트가 자기 메시지 전송 결과를 맞춰보는 용도(최대 32자).
- 서버가 욕설 필터를 적용한 뒤 같은 채널 전원(보낸 사람 포함)에게 `chat`을 보낸다.
- 토큰 버킷(10초에 5개)을 넘으면 그 메시지는 버리고 보낸 사람에게만 `rate_limited`.

## 서버 → 클라이언트

### `welcome`

```json
{
  "t": "welcome",
  "v": 1,
  "you": { "peerId": "p_8Kx2", "nickname": "느긋한 수달", "avatarId": "char-03" },
  "channel": 2,
  "room": { "id": "aB3dE5fG7h", "title": "작은 카페", "description": "쉬어 가는 방", "roomData": { "version": 1, "themeId": "cafe", "objects": [] } },
  "peers": [
    { "peerId": "p_1aQ9", "nickname": "용감한 고양이", "avatarId": "char-01", "p": [0, 0, 0], "r": 0, "a": "idle" }
  ],
  "spawn": [0, 0, 2]
}
```

- `peers`에는 같은 채널의 다른 참가자만 있다(최대 19명).
- 이전 채팅 기록은 보내지 않는다(채팅 저장 안 함).

### `peer_joined`

```json
{ "t": "peer_joined", "peer": { "peerId": "p_1aQ9", "nickname": "용감한 고양이", "avatarId": "char-01", "p": [0,0,2], "r": 0, "a": "idle" } }
```

### `peer_left`

```json
{ "t": "peer_left", "peerId": "p_1aQ9" }
```

### `peer_moved`

```json
{ "t": "peer_moved", "peerId": "p_1aQ9", "p": [1.25, 0, -3.5], "r": 1.57, "a": "walk" }
```

- 받는 쪽은 마지막 두 위치 사이를 보간해서 그린다.

### `correction`

```json
{ "t": "correction", "p": [1.0, 0, -3.0], "r": 1.57 }
```

- 내 `move`가 거부됐을 때 나에게만. 클라이언트는 그 위치로 되돌린다.

### `chat`

```json
{ "t": "chat", "messageId": "m_k2P9", "peerId": "p_8Kx2", "nickname": "느긋한 수달", "text": "안녕하세요", "sentAt": 1762400000000, "channel": 2, "sig": "Qm9…", "nonce": "c-17" }
```

- `nonce`는 보낸 사람에게 가는 사본에만 있다.
- `sig` = `HMAC-SHA256(SERVER_SECRET, "chat|" + roomId|messageId|nickname|text|sentAt|channel)`, base64url. 서버는 채팅을
  저장하지 않으므로, 신고할 때 클라이언트가 이 메시지 필드와 `sig`를 그대로 `POST /api/reports`에 보낸다(research R14).

### `rate_limited`

```json
{ "t": "rate_limited", "scope": "chat", "retryAfterMs": 1800, "nonce": "c-18" }
```

### `room_updated`

```json
{ "t": "room_updated", "room": { "id": "aB3dE5fG7h", "title": "새 제목", "description": "", "roomData": { "version": 1, "themeId": "library", "objects": [] } } }
```

- 주인이 방을 고쳤을 때 모든 채널에. 테마가 바뀌면 클라이언트는 장면을 다시 만들고 `spawn`으로 옮긴다.

### `room_deleted`

```json
{ "t": "room_deleted", "by": "owner" }
```

- 보낸 직후 서버가 `4001`로 연결을 닫는다. 클라이언트는 다시 연결하지 않고 안내 후 목록으로 간다(FR-016).

### `error`

```json
{ "t": "error", "code": "bad_message" }
```

- `code`: `bad_message` | `unsupported_version` | `not_joined`.

## 닫힘 코드

| 코드 | 뜻 | 클라이언트 동작 |
|---|---|---|
| 1000 | 정상 종료 | 재연결 안 함 |
| 1003 | 바이너리 프레임 | 재연결 안 함(버그) |
| 1009 | 메시지 너무 큼 | 재연결 안 함(버그) |
| 4000 | join 시간 초과 | 재연결 |
| 4001 | 방 삭제됨 | 재연결 안 함, 목록으로 |
| 4002 | 지원하지 않는 버전 | 재연결 안 함, 새로고침 안내 |
| 4008 | 잘못된 메시지 반복 | 재연결 안 함 |
| 그 밖 | 네트워크·서버 문제 | 백오프 재연결 |

- `welcome`을 받기 전에 닫힌 연결(업그레이드 거부 포함)은 재연결 전에 `GET /api/rooms/{roomId}`로 방을 확인한다. 404·410이면
  재연결하지 않고 `4001`과 같이 안내한다. 삭제된 방은 업그레이드를 410으로 거부하는데 브라우저는 이를 `1006`으로만 알린다.

## 개발 빌드 전용 테스트 훅 (E2E)

`import.meta.env.DEV`일 때만 `window.__roomboard`를 노출한다. 프로덕션 번들에 없어야 한다(빌드 검사).

```text
window.__roomboard = {
  state(): { you, channel, peers, chat, connection: "connecting"|"open"|"reconnecting"|"closed" }
  move(p, r): void          // 컨트롤러 없이 이동 메시지 보내기
}
```
