# WebSocket 메시지 명세 v2 (넉백 난투 추가분)

001 [websocket.md](../../001-realtime-room-board/contracts/websocket.md)의 v1에 더하는 것만 적는다. 공통 규칙(JSON 텍스트 프레임,
2KB, `bad_message`, 닫힘 코드, 재연결)은 그대로다. 스키마의 진실의 원천은 `src/core/protocol.ts`이고, 이 문서의 JSON 예시도
`tests/core/protocol.test.ts`가 스키마로 검사한다.

- `PROTOCOL_VERSION`은 2가 된다. v1 클라이언트는 `unsupported_version`(4002)을 받고 새로고침한다(001 규칙).
- 같은 채널 안에서만 오간다(FR-018). 경기장 좌표·칸은 data-model.md "경기장". `launch.p`는 소수 2자리, `launch.v`·`launch.s`는 3자리.
- `at`: 서버가 보낸 시각(Unix ms). 화면은 이것으로 서버 시계를 어림한다(research R3).
- 서버가 받아들이지 않는 기술·블록 요청은 조용히 무시한다(FR-034). 기술은 `swing`이 안 오는 것으로 알 수 있다.

## 클라이언트 → 서버

### `move` (바뀜)

```json
{ "t": "move", "p": [31.5, 1, 2.25], "r": 1.57, "a": "walk", "d": [1, 0] }
```

- `d`(선택): 누르고 있는 방향 입력 `[x, z]`(길이 ≤ 1). 방향 틀기(FR-028)와 던지기 방향(FR-004)에 쓴다.
- 날아가는 중·경직 중에는 서버가 `p`를 무시하고 `d`만 받는다(research R4). 입구·출구 칸에 들어서면 서버가 `correction`으로 순간이동시킨다(R5).

### `hold`

```json
{ "t": "hold", "k": "smash" }
```

- 강펀치 모으기 시작. 서버가 받은 시각부터 `skill smash`까지를 모은 시간으로 잰다(최대 `smashChargeMs`).

### `skill`

```json
{ "t": "skill", "k": "jab", "nonce": "s7" }
```

- `k`: `jab` | `smash` | `throw`. 잽 단계(1~3)는 서버가 연타 간격으로 센다. 던지기 방향은 마지막 `d`.
- `nonce`(선택, 32자 이하): 내 화면의 미리 보인 이펙트를 서버 결과 `swing`과 맞추는 값.
- 다시 쓰기 시간 중에 누른 잽은 화면이 들고 있다가 끝날 때 보낸다(research R2). 서버는 다시 쓰기 시간 중에 온 `skill`을 무시한다.

### `guard`

```json
{ "t": "guard", "on": true }
```

- 방어 누름·뗌. 경직 중의 누름은 낙법 판정에만 쓴다(FR-003).

### `roll`

```json
{ "t": "roll", "d": [0, -1] }
```

- 구르기. 기력이 모자라거나 경직 중이면 무시한다. 이동 자체는 화면이 `move`로 보낸다(서버는 무적 시간만 정한다).
  날아가는 중·미끄러지는 중이면 무적만 주고 궤적은 그대로 이어진다(넉아웃은 서버가 정함).

### `air`

```json
{ "t": "air", "k": "recover" }
```

- `k`: `jump` | `recover`. 공중에서 남은 횟수가 있으면 서버가 새 궤적을 시작한다(FR-029).

### `block`

```json
{ "t": "block", "op": "place", "kind": "dirt", "h": 0 }
```

- `op`: `place` | `break`. `kind`는 `place`일 때만(`dirt` | `stone`). `h`: `-1`(앞쪽 아래) | `0`(발 높이) | `1`(눈 높이).
- 대상 칸은 서버가 내 위치와 보는 방향으로 정한다(FR-015a). 초당 4개를 넘으면 `rate_limited {scope: "block"}`.

### `match_start`

```json
{ "t": "match_start" }
```

- 경기장에 있는 사람만, 경기장에 2명 이상이고 판이 없을 때(FR-025).

## 서버 → 클라이언트

### `welcome` (바뀜)

```json
{ "t": "welcome", "v": 2, "you": { "peerId": "p_1aQ9", "nickname": "느긋한 고양이", "avatarId": "a3" }, "channel": 1,
  "room": { "id": "AbCdEfGhIj", "title": "카페", "description": "", "roomData": { "version": 1, "themeId": "cafe", "objects": [] } },
  "peers": [], "spawn": [0, 0, 4],
  "arena": { "blocks": [[[3, 1, 5], "dirt", 1], [[4, 0, 4], null, 0]], "fighters": [], "match": null }, "at": 1763400000000 }
```

- `arena.blocks`: 기본 경기장과의 차이 `[칸, 종류 | null(없어짐), 남은 내구]`. `fighters`: 경기장에 있는 사람의 `Fighter` 보기
  (`peerId`, `damage`, `launch` | null, `stocks` | null). `match`: 아래 `match`와 같은 모양 또는 null.

### `swing`

```json
{ "t": "swing", "peerId": "p_1aQ9", "k": "jab", "step": 1, "nonce": "s7", "at": 1763400000120, "hitstopMs": 35, "readyAt": 1763400000505,
  "hits": [{ "peerId": "p_7bX2", "damage": 3, "guarded": false, "hitstopMs": 35,
    "launch": { "t": 1763400000155, "p": [31.5, 1, 2.25], "v": [0.78, 0, 0], "s": 1.3, "cause": "hit" } }] }
```

- 기술 하나의 판정 결과를 채널 전원에게(때린 사람 포함). `nonce`는 때린 사람에게 보내는 것에만 있다. 빈 `hits`는 헛스윙.
- `launch.t`는 타격 시각 + 타격 정지. 화면은 `launch`만으로 궤적을 계산한다(FR-032).
- `hitstopMs`(위쪽): 때린 사람의 타격 정지 = 맞은 사람들 `hitstopMs`의 최댓값, 헛스윙이면 0. `readyAt` = `at` + `hitstopMs` + 다시 쓰기 시간
  (서버 시각). 화면은 들고 있던 잽을 어림한 서버 시계로 `readyAt`이 지난 뒤 보낸다(research R2).

### `launch`

```json
{ "t": "launch", "peerId": "p_7bX2", "at": 1763400000400,
  "launch": { "t": 1763400000400, "p": [40, 1, 2.25], "v": [-1.2, 0.4, 0], "s": 5.1, "cause": "wall" }, "wall": { "result": "bounce", "damage": 5, "cell": [9, 1, 2] } }
```

- 새 궤적의 시작: 벽 튕김·뚫림(`cause: "wall"`, `wall.result` = `bounce` | `break`), 공중 점프·복귀기(`air`·`recover`),
  경로의 블록이 바뀜(`block`). 뚫림이면 그 칸의 블록도 없어진다(`block` 메시지를 따로 보내지 않는다).

### `landed`

```json
{ "t": "landed", "peerId": "p_7bX2", "p": [33, 1, 2.25], "end": "land", "at": 1763400000700 }
```

- 궤적이 끝났다. `end`: `land`(착지·미끄러짐 멈춤), `tech`(낙법, 추가 피해 없이 벽 앞에 멈춤).
  이 뒤로 위치의 주인은 다시 그 사람이다.

### `knocked_out`

```json
{ "t": "knocked_out", "peerId": "p_7bX2", "respawnAt": 1763400003700, "stocks": 2, "out": false, "at": 1763400000700 }
```

- `stocks`: 판 중이면 남은 목숨, 아니면 null. `out: true`면 탈락(다시 서지 않고 방 시작 지점으로).

### `respawned`

```json
{ "t": "respawned", "peerId": "p_7bX2", "p": [32, 1, 12], "at": 1763400003700 }
```

- 재시작(피해 0%) 또는 되돌리기로 시작 지점에 다시 섬. 내 것이면 화면은 그 위치로 옮긴다.

### `block`

```json
{ "t": "block", "cell": [3, 1, 5], "kind": "dirt", "hp": 1, "at": 1763400000800 }
```

- 놓기(`kind`·`hp`), 치기(`hp` 감소), 없어짐(`kind: null`, `hp: 0`).

### `arena_reset`

```json
{ "t": "arena_reset", "at": 1763400000900 }
```

- 관리자 되돌리기(FR-040) 때만 보낸다. 채널이 비어 기본으로 돌아간 것은 다음에 들어온 사람이 `welcome`의 빈 차이로 안다.
  화면은 기본 경기장으로 돌리고, 뒤따르는 `respawned`로 경기장 사람을 옮긴다. 판이 있었으면 `match {state: "cancelled"}`가 먼저 온다.

### `match`

```json
{ "t": "match", "state": "running", "endsAt": 1763400300000, "players": [{ "peerId": "p_1aQ9", "stocks": 3 }, { "peerId": "p_7bX2", "stocks": 3 }], "at": 1763400000000 }
```

```json
{ "t": "match", "state": "ended", "ranks": [{ "peerId": "p_1aQ9", "rank": 1 }, { "peerId": "p_7bX2", "rank": 2 }], "at": 1763400090000 }
```

- `state`: `running`(시작), `ended`(결과, 같은 순위 허용), `cancelled`(되돌리기로 결과 없이 끝남). 결과는 저장하지 않는다(FR-027).

### `rate_limited` (바뀜)

- `scope`에 `block`이 더해진다. `nonce`는 없다.
