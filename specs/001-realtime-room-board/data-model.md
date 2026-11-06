# Data Model: 실시간 3D 방 게시판 v1

저장 위치는 세 곳이다. **D1**(영구), **방 DO 메모리·소켓 attachment**(접속 중에만), **기기 localStorage**(기기 키).
개인정보(이메일, 전화번호, 실명, IP)는 어디에도 없다(헌법 원칙 II).

## D1 (영구)

### rooms

| 컬럼 | 타입 | 규칙 |
|---|---|---|
| id | TEXT PK | 랜덤 10자 URL-safe id |
| title | TEXT NOT NULL | 1~60자, 앞뒤 공백 제거, 욕설 필터 적용 후 저장 |
| description | TEXT NOT NULL DEFAULT '' | 0~300자, 욕설 필터 적용 후 저장 |
| room_data | TEXT NOT NULL | 방 데이터 JSON(아래 RoomData). `theme_id`와 항상 일치 |
| theme_id | TEXT NOT NULL | `themes` 목록의 id 중 하나 |
| password_hash | TEXT NOT NULL | `pbkdf2-sha256$<반복>$<솔트>$<해시>` (research R5) |
| online_count | INTEGER NOT NULL DEFAULT 0 | 방 DO가 2초 디바운스로 기록 |
| created_at | INTEGER NOT NULL | Unix ms |
| updated_at | INTEGER NOT NULL | Unix ms |
| deleted_at | INTEGER NULL | 삭제 시각. NULL이 아니면 목록·조회에서 제외 |
| deleted_by | TEXT NULL | `owner` 또는 `admin` |

- 인덱스: `(deleted_at, created_at DESC)` — 최신순 목록(FR-001).
- 삭제는 소프트 삭제다. 삭제된 방 주소에는 "삭제된 방"(410)을, 없는 id에는 "없는 방"(404)을 답한다.
- 만든 사람의 기기 키는 저장하지 않는다. 소유는 비밀번호로만 증명한다.
- 자동 만료 없음(FR-008).

### reports

| 컬럼 | 타입 | 규칙 |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| target_type | TEXT NOT NULL | `room` 또는 `message` |
| room_id | TEXT NOT NULL | rooms.id |
| message_id | TEXT NOT NULL DEFAULT '' | message일 때 메시지 id, room일 때 빈 문자열 |
| message_snapshot | TEXT NULL | message일 때 JSON `{nickname, text, sentAt, channel}` (필터 적용 후 내용) |
| reason | TEXT NOT NULL | `spam` \| `abuse` \| `sexual` \| `illegal` \| `other` |
| reporter_hash | TEXT NOT NULL | `SHA-256(기기 키 + REPORT_PEPPER)` hex. 중복 판별 전용 |
| status | TEXT NOT NULL DEFAULT 'open' | `open` → `resolved` |
| created_at | INTEGER NOT NULL | Unix ms |
| resolved_at | INTEGER NULL | |

- 유니크: `(target_type, room_id, message_id, reporter_hash)` — 같은 기기·같은 대상은 한 번만(FR-040).
  중복 신고는 오류 없이 `200 {duplicate: true}`로 답한다.
- 인덱스: `(status, created_at DESC)` — 관리자 목록.
- 관리자가 방을 삭제하면 그 방의 `open` 신고는 모두 `resolved`가 된다. 메시지 신고는 `resolved`로만
  바뀐다(지울 채팅 원본이 없음, FR-041).

## 방 데이터 (RoomData, `rooms.room_data`)

```text
RoomData {
  version: 1
  themeId: ThemeId
  objects: RoomObject[]          // v1: 테마 기본 오브젝트 복사본
}
RoomObject {
  id: string                     // 방 안에서 유일
  assetId: string                // 에셋 목록의 id (CC0 GLB)
  position: [x, y, z]
  rotationY: number              // 라디안
  scale?: number                 // 기본 1
  collider: "box" | "none"
}
```

- 테마를 바꾸면(FR-005) `objects`를 새 테마 기본값으로 다시 채운다.
- 이 형식은 나중의 "직접 만들기" 에디터 입력이 된다. 에디터는 v1 범위 밖이다.

## Theme (코드 안 정적 데이터, `src/core/themes.ts`)

```text
Theme {
  id: ThemeId                    // v1: 3개
  nameKey: I18nKey               // 문구 키
  bounds: { min: [x,y,z], max: [x,y,z] }   // 이동 검증 경계
  spawn: [x, y, z]
  defaultObjects: RoomObject[]
}
```

## 방 DO 상태 (접속 중에만)

### Participant (소켓 attachment, Hibernation 후 복원)

```text
Participant {
  peerId: string                 // 접속마다 새 랜덤 id (탭마다 다른 참가자)
  nickname: string               // nicknameFor(기기 키)
  avatarId: string               // avatarFor(기기 키)
  channel: number                // 1부터
  pose: { p: [x,y,z], r: number, a: AnimState }
  lastMoveAt: number             // 속도 검증용
}
AnimState = "idle" | "walk" | "run" | "jump"
```

- 기기 키 원문은 attachment에 넣지 않는다.

### Channel (파생 값)

- 같은 `channel` 값을 가진 소켓들의 집합. 최대 20명(FR-013).
- 배정 규칙(순수 함수 `assignChannel(counts)`): 인원이 20 미만인 가장 작은 번호, 없으면 `max + 1`.
- 빈 채널은 따로 지우지 않는다(소켓이 없으면 자연히 사라진다).

### ChatBuffer (메모리, 저장 안 함)

- 채널별 최근 100개 `{messageId, nickname, text, sentAt}`. 메시지 신고 스냅샷 전용.
- Hibernation으로 비워지면 그 전 메시지 신고는 410(research R6).

### RateBucket (메모리)

- 참가자별 토큰 버킷: 채팅 10초에 5개, 이동 초당 10개(research R9).

## 기기 localStorage

| 키 | 값 |
|---|---|
| `rb.deviceKey` | `crypto.randomUUID()` |
| `rb.view` | `3d` \| `2d` (사용자가 고른 화면) |

- localStorage를 못 쓰면 메모리에서 새 키를 만들고 그 탭에서만 쓴다(스펙 Edge Cases).

## 상태 전이

```text
Room:    (없음) --create--> active --update--> active
                  active --delete(owner|admin)--> deleted   (되돌리기 없음)
Report:  open --resolve(admin)--> resolved
Peer:    connecting --join ok--> in_channel --close/timeout--> gone
                     in_channel --room deleted--> gone (room_deleted 메시지 후 close 4001)
```

## 검증 규칙 요약

| 대상 | 규칙 | 근거 |
|---|---|---|
| 제목 | 1~60자, 필터 | FR-002 |
| 설명 | 0~300자, 필터 | FR-002 |
| 글 비밀번호 | 4~64자 | FR-002, FR-005 |
| 테마 | 목록 안 id | FR-002 |
| 채팅 | 1~200자, 필터, 버킷 | FR-021~023 |
| 이동 | 테마 경계 안, 속도 ≤ 8m/s(점프 포함 여유), 초당 10개 | FR-012, research R4 |
| 기기 키 | UUID 형식 | FR-030 |
