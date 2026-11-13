---
description: "Task list for 001-realtime-room-board"
---

# Tasks: 실시간 3D 방 게시판 v1

**Input**: `specs/001-realtime-room-board/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Tests**: 필수. 헌법 원칙 III(테스트 우선, NON-NEGOTIABLE)에 따라 모든 스토리에서 테스트 작업이 구현보다 먼저 오고, 먼저 실패하는 것을
확인한 뒤 구현한다. unit은 Vitest(`tests/core` Node, `tests/worker` workerd), E2E는 Playwright(`tests/e2e`, 브라우저 컨텍스트 2개 이상).

**Organization**: 스토리별 phase. 경로는 plan.md의 단일 패키지 구조(`src/core`, `src/worker`, `src/client`, `tests/`)를 따른다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일이고 미완료 작업에 기대지 않아 병렬 가능
- **[Story]**: US1~US7 (spec.md)

---

## Phase 1: Setup

**Purpose**: 저장소 기반. 클라우드 세션·Codespaces·Actions에서 같은 명령으로 돌아가야 한다(헌법 원칙 I).

- [x] T001 `package.json` 생성: research R1 버전 고정(vite 8.3, @cloudflare/vite-plugin 1.67, wrangler 4.158, react/react-dom 19.3, three 0.187, @react-three/fiber 9.8, @react-three/drei 10.7, @react-three/rapier 2.2, ecctrl 2.0, hono 4.13, zod 4.6, vitest 5.1, @cloudflare/vitest-plugin 1.6, @playwright/test 1.65, typescript 6.0), `"engines": {"node": ">=22.18"}`, 스크립트 `dev`, `build`, `typecheck`, `lint`, `test`, `test:e2e`, `check:bundle` — 완료. `check:bundle`은 T050에서 추가. npm 11 설치 스크립트 허용: esbuild·workerd(`allowScripts`).
- [x] T002 `tsconfig.json`(strict, ES2022, `src/core`·`src/client`·`src/worker`·`tests` 경로)과 `src/worker` 전용 `tsconfig.worker.json`(workers 타입) 생성 — 완료. Node/브라우저/Worker 세 tsconfig(`tsconfig.json`, `tsconfig.app.json`, `tsconfig.worker.json`), Worker 타입은 `wrangler types`로 생성(커밋 안 함).
- [x] T003 [P] `wrangler.jsonc` 생성: Worker `roomboard`, 정적 에셋(SPA fallback), D1 바인딩 `DB`(`roomboard`), DO 바인딩 `ROOM` 클래스 `RoomDurableObject`, migrations `new_sqlite_classes: ["RoomDurableObject"]`, Rate Limiting 바인딩 `RL_CREATE`(3/60s)·`RL_PASSWORD`(5/60s)·`RL_REPORT`(10/60s)·`RL_ADMIN`(5/60s), vars 없음(비밀값은 `.dev.vars`) — 부분 완료: 이름·main·호환 날짜·정적 에셋(SPA, `/api/*` 먼저 Worker). D1·DO·Rate Limit 바인딩은 그것을 쓰는 작업에서 추가. D1 `DB`는 F2(T013)에서 추가(`database_id` 없음, 첫 배포 때 wrangler가 만든다).
- [x] T004 [P] `vite.config.ts`: `@vitejs/plugin-react` + `@cloudflare/vite-plugin`, 3D 코드 청크 분리 설정 — 완료(청크 분리는 3D 코드가 생기는 US1에서).
- [x] T005 [P] `vitest.config.ts`: 프로젝트 2개 — `core`(Node, `tests/core/**`), `worker`(`@cloudflare/vitest-plugin`, `wrangler.jsonc` 사용, D1 마이그레이션 적용, `tests/worker/**`) — 완료(판례 2026-11-06-vitest-plugin). D1 마이그레이션 적용은 T013에서.
- [x] T006 [P] `playwright.config.ts`: `webServer`로 `npm run dev`, Chromium 데스크톱 + 모바일(터치) 프로젝트, 기본 `trace: 'off'` — 완료. `PLAYWRIGHT_CHROMIUM_PATH`로 미리 설치된 Chromium 사용 가능(클라우드 세션).
- [x] T007 [P] 린트 설정 `eslint.config.js`: `src/core/**`에서 `react`, `three`, `@react-three/*`, `ecctrl`, `hono`, `cloudflare:*`, DOM 전역 사용 금지(헌법 원칙 IV), `src/client/**` JSX 안 한글 문자열 리터럴 금지(i18n) — 완료. 규칙 자체를 `tests/scripts/lint-rules.test.ts`로 검증(원칙 VI).
- [x] T008 [P] `.dev.vars.example`(`ADMIN_TOKEN`, `SERVER_SECRET`, `TURNSTILE_SECRET=1x0000000000000000000000000000000AA`)와 `.env.example`(`VITE_TURNSTILE_SITEKEY=1x00000000000000000000AA`), `.gitignore`에 `.dev.vars`·`.env`·`.wrangler/`·`test-results/` 추가 — 완료.
- [x] T009 [P] `.devcontainer/devcontainer.json`: Node 22, `postCreateCommand: npm ci && npx playwright install --with-deps chromium` (research R15) — 완료.
- [x] T010 [P] `.github/workflows/ci.yml`: PR·main push마다 `npm ci` → `typecheck` → `lint` → `test` → `build` → `check:bundle` → Playwright 설치 → `test:e2e`, 실패 시 머지 차단 — 완료(`check:bundle`은 T050에서 추가).

---

## Phase 2: Foundational

**Purpose**: 모든 스토리가 기대는 측정·스키마·순수 로직. 이 phase가 끝나야 스토리를 시작한다.

### 측정 먼저 (plan 구현 순서 메모)

- [x] T011 `tests/worker/perf-password.test.ts`: workerd에서 PBKDF2-SHA256 100,000회 해시 1회의 CPU 시간을 측정해 기록하고, 100,000회가 workerd에서 허용되는지 확인(research R5, 미확인 항목). 결과를 `research.md` R5에 적는다. 10ms를 넘으면 R5의 대안(해시를 방 DO 안에서 계산)으로 결정을 바꾸고 plan.md를 고친다 — 완료. 중앙값 19ms(로컬 workerd) > 10ms라서 해시는 방 DO 안에서 계산한다(research R5, plan.md, 판례 2026-11-06-password-hash-in-do). 로컬 workerd는 100,001회도 허용. 테스트는 측정값만 출력하고 기준을 단언하지 않는다(기계마다 다름).
- [x] T012 `tests/worker/perf-html.test.ts`: `HTMLRewriter`로 `index.html`에 `<title>`·`<meta name="description">`·`<noscript>`를 넣는 처리의 CPU 시간을 측정해 `research.md` R8에 기록(목표 ≤ 2ms) — 완료. 평균 0.085ms.

### 데이터·스키마

- [x] T013 `migrations/0001_init.sql`: data-model.md 그대로 `rooms`(id TEXT PK "랜덤 10자 URL-safe", title "1~60자", description "0~300자" DEFAULT '', room_data, theme_id, password_hash, online_count DEFAULT 0, created_at, updated_at, deleted_at NULL, deleted_by NULL `owner`|`admin`, 인덱스 `(deleted_at, created_at DESC)`)와 `reports`(target_type `room`|`message`, room_id, message_id DEFAULT '', message_snapshot NULL, reason `spam`|`abuse`|`sexual`|`illegal`|`other`, reporter_hash, status DEFAULT 'open', created_at, resolved_at NULL, UNIQUE `(target_type, room_id, message_id, reporter_hash)`, 인덱스 `(status, created_at DESC)`) — 완료. data-model 규칙을 CHECK 제약으로도 둔다(길이, enum 값). `vitest.config.ts` worker 프로젝트가 테스트마다 마이그레이션을 적용한다.
- [x] T014 `scripts/seed-dev.ts`: 로컬·E2E용 방 1개(id `seedroom01`, 테마 첫 번째, 비밀번호 `seed-pass`)를 넣는 스크립트(`npm run seed:dev`). US1을 방 만들기(US3) 없이 검증하기 위함 — 완료. 마이그레이션 적용까지 같이 하고 `INSERT OR REPLACE`라 여러 번 돌려도 된다. 해시는 Node `pbkdf2Sync`로 같은 저장 형식. 실행 확인: 클라우드 세션에서 `npm run seed:dev` 두 번 실행, 로컬 D1에 `seedroom01`(테마 `cafe`, `pbkdf2-sha256$100000$…`) 1행.

### `src/core` — 테스트 먼저

- [x] T015 [P] `tests/core/protocol.test.ts`: contracts/websocket.md의 모든 메시지 예시가 `src/core/protocol.ts` 스키마를 통과하고, 형식이 틀린 예(필드 누락, `a` 값 밖, `text` 201자, 2KB 초과)가 거부되는지 — 완료. 테스트가 websocket.md의 JSON 예시를 직접 읽어 검사한다(예시를 실제로 유효한 값으로 고침).
- [x] T016 [P] `tests/core/api-schemas.test.ts`: openapi.yaml 요청 스키마 규칙(제목 "1~60자", 설명 "0~300자", 비밀번호 "4~64자", `themeId` 목록 안, `deviceKey` UUID, 신고 `reason` enum, 메시지 신고 `message` 필드 6개 필수) — 완료.
- [x] T017 [P] `tests/core/themes.test.ts`, `tests/core/room-data.test.ts`: 테마 3개, 각 테마의 `spawn`이 `bounds` 안, `createRoomData(themeId)`가 `{version:1, themeId, objects: 기본값 복사본}`, 테마 변경 시 objects가 새 기본값으로 바뀜 — 완료. 테마 id는 `cafe`, `library`, `garden`.
- [x] T018 [P] `tests/core/identity.test.ts`: `nicknameFor(key)`·`avatarFor(key)`가 같은 키에 항상 같은 값, 다른 키 1,000개에서 닉네임이 충분히 퍼짐(서로 다른 값 ≥ 900), 닉네임에 금칙어 없음 — 완료. 형용사 80 × 동물 80(1,000개 키에서 약 925개).
- [x] T019 [P] `tests/core/channels.test.ts`: `assignChannel(counts)` — 빈 방 → 1, `{1:20}` → 2, `{1:20, 2:5}` → 2, `{1:19, 2:20}` → 1, `{1:20, 2:20}` → 3 — 완료.
- [x] T020 [P] `tests/core/movement.test.ts`: `validateMove(prev, next, now, bounds)` — 경계 밖 거부, 초속 8m 초과 거부, 정상 이동 허용 — 완료. 시간이 흐르지 않은 이동(같은 ms)은 제자리일 때만 허용.
- [x] T021 [P] `tests/core/rate-bucket.test.ts`: 토큰 버킷 — 채팅 "10초에 5개"(6번째 거부, `retryAfterMs` 계산), 이동 "초당 10개" — 완료.
- [x] T022 [P] `tests/core/chat-filter.test.ts`: 금칙어를 `*`로 가림, 공백·특수문자 끼워넣기·자모 분리 우회도 가림, 정상 문장은 그대로 — 완료. 매치는 원래 글자 단위(음절)로만 인정해서 "조절" 같은 말이 "좆"에 걸리지 않는다. 띄어쓰기를 건너뛰는 매치는 낱말 처음에서 시작해 낱말 끝에서 끝나야 하고(기호·보이지 않는 문자는 낱말을 끊지 않음), 3음절 이상 금칙어만 끝에 조사·어미 목록(아, 야, 들 …)이 붙을 수 있다(`개 새끼야`는 가림, "push it", "a bit chilly", "포도 씨 발라", "몇 시 팔아"는 그대로). 휴리스틱이라 오탐·누락이 남는다. 목록 보강은 운영 중 신고로. 글자마다 NFKC를 거치고 NFD 한글도 같은 자모로 맞춘다.

### `src/core` — 구현

- [x] T023 [P] `src/core/protocol.ts`: websocket.md의 모든 클라이언트→서버, 서버→클라이언트 메시지 zod 스키마와 타입, 닫힘 코드 상수 — 완료. 2KB 초과는 `too_large`(DO가 1009로 닫음), 나머지는 `bad_message`.
- [x] T024 [P] `src/core/api-schemas.ts`: openapi.yaml 요청 바디 zod 스키마 — 완료. 목록 조회 쿼리·`fields` 문구 키는 그것을 쓰는 US3에서.
- [x] T025 [P] `src/core/themes.ts`, `src/core/room-data.ts`: 테마 3개(id, `nameKey`, `bounds`, `spawn`, `defaultObjects`), `createRoomData`, `changeTheme` — 완료.
- [x] T026 [P] `src/core/identity.ts`: 형용사·동물 단어 목록과 아바타 id 목록, 해시 기반 결정적 선택(동기 함수, 외부 의존 없음) — 완료.
- [x] T027 [P] `src/core/channels.ts`, `src/core/movement.ts`, `src/core/rate-bucket.ts` — 완료. `RateBucket`은 정수 ms GCRA(토큰 소수점 반올림 없음).
- [x] T028 [P] `src/core/chat-filter.ts`와 `src/data/profanity-ko.txt`(한국어·영어 금칙어 초기 목록) — 완료. 금칙어 목록은 인자로 받는다(core는 파일을 읽지 않음, `tsconfig.core.json`이 DOM·Node·Workers 타입 없이 검사).

### Worker·클라이언트 공통 기반

- [x] T029 `tests/worker/app.test.ts`: 알 수 없는 `/api/*` 경로 404 JSON `{code:"not_found"}`, 오류 응답이 openapi `Error` 스키마를 따름, 응답·로그에 IP가 기록되지 않음(콘솔 출력 캡처 검사) — 완료. 예상하지 못한 오류는 500 `{code:"internal"}`(openapi `Error` enum에 추가). 로그에는 오류 이름과 스택 프레임만 남긴다. 스택 첫머리의 `이름: 메시지` 줄 수만큼 건너뛴다(여러 줄 메시지도 요청 본문을 담을 수 있음). Hono `HTTPException` 4xx는 그 상태와 헤더(`WWW-Authenticate` 등) 그대로, 코드는 401·404·410·429면 해당 코드, 나머지는 `validation`.
- [x] T030 `src/worker/index.ts`: Hono 앱, `/api` 라우터 뼈대, 공통 오류 처리(`Error` 스키마), 정적 에셋 위임, `RoomDurableObject` export — 완료. 정적 에셋은 `run_worker_first: ["/api/*"]`라서 Worker를 거치지 않는다(`/rooms/:id` HTML은 T057). `RoomDurableObject` export와 DO 바인딩은 T040에서 같이 추가.
- [x] T031 [P] `src/worker/rate-limit.ts`: Rate Limiting 바인딩 래퍼 — 키는 `cf-connecting-ip`를 요청 중에만 사용하고 저장·로그 금지(research R9), 초과 시 429 + `Retry-After` + `retryAfterMs` — 완료. Rate Limiting 바인딩(`RL_*`)은 쓰는 스토리에서 `wrangler.jsonc`에 추가.
- [x] T032 [P] `src/client/i18n/ko.ts`, `src/client/i18n/t.ts`: 문구 객체와 `t(key, vars)`, 키 타입 추출(없는 키는 타입 오류) (research R10) — 완료. 테스트 `tests/client/i18n.test.ts`(테마 `nameKey` 전부 있음, 없는 키는 `@ts-expect-error`).
- [x] T033 [P] `src/client/device.ts`: `rb.deviceKey`(없으면 `crypto.randomUUID()` 생성), localStorage를 못 쓰면 메모리 키, `rb.view` 읽기·쓰기 (data-model 기기 localStorage) — 완료. 저장소를 인자로 받아 Node에서 테스트(`tests/client/device.test.ts`).
- [x] T034 `src/client/main.tsx`, `src/client/App.tsx`: 라우터(`/`, `/new`, `/rooms/:id`, `/rooms/:id/edit`, `/admin`), 공통 상태 컴포넌트(로딩, 네트워크 오류, 429 안내) — contracts/screens.md "공통 상태" — 완료. 라우터 의존성 없이 `history` + `popstate`(`matchRoute`, 앱 안 이동은 `navigate`), 공통 상태는 `src/client/Status.tsx`. 화면 내용은 각 스토리에서.

**Checkpoint**: `npm test`의 core·worker 기반 테스트 통과, 측정 결과 기록 완료.

---

## Phase 3: User Story 1 — 방에 들어가서 다른 사람과 함께 움직이기 (P1) 🎯 MVP

**Goal**: 시드 방에 두 사람이 들어가 서로의 아바타 이동을 실시간으로 본다.

**Independent Test**: quickstart Q1~Q3. 브라우저 2개로 `seedroom01`에 들어가 한쪽 이동이 다른 쪽 테스트 훅·참가자 목록에 1초 안에 반영.

### Tests (먼저 작성, 실패 확인)

- [x] T035 [P] [US1] `tests/core/room-session.test.ts`: 순수 상태 기계 `RoomSession` — `join` → 나에게 `welcome`(같은 채널 peers만), 다른 참가자에게 `peer_joined`; `move` 정상 → 같은 채널에 `peer_moved`; 거부 → 나에게 `correction`; 초당 10개 초과는 조용히 버림; `leave` → `peer_left`; join 전 다른 메시지 → `error not_joined`; 두 번째 join → `bad_message`; 잘못된 메시지 10초 5번 → 닫힘 4008 — 완료. 채널 21번째 배정, 경계 밖 이동, 2KB 초과(1009), 4002, Hibernation 후 `restore`도 검사. 채팅은 US4(T068).
- [x] T036 [P] [US1] `tests/worker/room-do.test.ts`: 실제 DO에 WebSocket 2개 접속 — join/welcome, 이동 전달, 닫으면 peer_left, 5초 안에 join 없으면 4000, 바이너리 프레임 1003, 2KB 초과 1009, 텍스트 `ping`에 `pong` 자동 응답, Hibernation 후(attachment 복원) 새 참가자의 `welcome.peers`에 기존 참가자 위치가 있음, 없는 방 404·삭제된 방 410 — 완료. 없는 방 404·삭제된 방 410·`Upgrade` 없음 426, `GET /api/rooms/:roomId`도 같은 파일. Hibernation은 `evictDurableObject`.
- [x] T037 [P] [US1] `tests/worker/online-count.test.ts`: 입장·퇴장 후 DO alarm으로 2초 디바운스되어 `rooms.online_count`가 갱신됨(`setTimeout` 미사용) — 완료. 예약된 alarm 시각(2초 뒤)과 alarm 전에는 D1이 그대로인지 확인.
- [x] T038 [P] [US1] `tests/e2e/us1-move.spec.ts`: Q1(컨텍스트 A·B 입장, A가 `__roomboard.move` → B의 `state().peers`와 2D 목록 갱신 1초 이내), Q2(A 닫으면 B 목록에서 제거), Q3(모바일 프로젝트에서 조이스틱 보임·드래그 시 `move` 전송), 랜덤 닉네임 표시 — 완료(2D 목록 확인은 T051 `us2-fallback.spec.ts`의 Q1 테스트). Q1·Q2는 WebGL을 끈 컨텍스트로 잰다: CI의 소프트웨어 WebGL(SwiftShader)이 CPU를 다 써서 같은 기기의 로컬 Worker가 메시지를 1.4~1.6초 늦게 내보냈다(운영에서는 서버가 따로 있고 GPU를 쓴다). 3D 송신 경로는 같은 파일의 T045·Q3 테스트(데스크톱 WASD, 모바일 조이스틱 드래그 → B가 위치 변화와 멈춘 뒤 `idle`을 봄)가 맡는다. 같은 이유로 Playwright `workers: 1`, 실행 인자 `--use-angle=swiftshader --enable-unsafe-swiftshader`. WebGL이 없으면 3D만 빠지고 방은 유지되는지도 검사(2D 전환은 T056). seed는 Playwright `webServer`가 `npm run seed:dev`로 넣는다. 실행 확인: main CI run 42349355500에서 seed + e2e(desktop·mobile) 통과(U2 시점). 실행 확인: main CI run 42426718401 통과(U3 머지 뒤, 커밋 324f072).

### Implementation

- [x] T039 [US1] `src/core/room-session.ts`: T035를 통과하는 순수 상태 기계(입력: 참가자 집합 + 메시지 + 시각, 출력: 보낼 메시지 목록·닫을 소켓), `assignChannel`·`validateMove`·`RateBucket`·`nicknameFor` 사용 — 완료. 참가자 키는 `peerId`(DO가 접속 때 만듦), 나가는 숫자는 소수점 2자리.
- [x] T040 [US1] `src/worker/room-do.ts`: `RoomDurableObject` — RPC `hashPassword`·`verifyPassword`(research R5), `acceptWebSocket`(Hibernation API), `setWebSocketAutoResponse("ping","pong")`, attachment `{peerId, nickname, avatarId, channel, pose, lastMoveAt}` 직렬화·복원(기기 키 원문 미포함), 메시지를 `RoomSession`에 넘기고 결과 전송, join 타임아웃 4000, 크기·바이너리 검사, `online_count` alarm 디바운스 — 부분 완료: RPC `hashPassword`는 T064(US3)에서 추가, `verifyPassword`는 쓰는 곳(US6 수정·삭제)에서. 나머지 완료. attachment에 join 마감용 `connectedAt` 추가, alarm 하나가 join 마감(4000)과 `online_count` 기록을 같이 한다. 방 정보는 깨어날 때 D1에서 읽는다(`ctx.id.name` = 방 id). 후속(PR #20 리뷰 제안): 서버가 닫은 소켓이 닫힘 완료 전에 Hibernation되면 깨어날 때 attachment 때문에 유령 참가자로 복원될 수 있다(미확인). 다음에 room-do를 고칠 때 테스트 먼저 쓰고, `close()` 전에 attachment의 `participant`를 비운다. 확인(Polish PR): 재현 안 됨. workerd는 서버가 `close()`한 소켓을 그 자리에서 `getWebSockets()`에서 뺀다. 그래서 깨어날 때 attachment로 복원될 소켓이 없다. 회귀 테스트(`room-do.test.ts`: 서버가 1009로 닫은 직후 내보내도 새 참가자는 남은 한 명만 본다)만 두고, 실패하는 테스트가 없는 attachment 비우기는 넣지 않았다(테스트는 처음부터 통과).
- [x] T041 [US1] `src/worker/index.ts`에 `GET /api/rooms/:roomId/ws` 추가: D1에서 방 확인(404/410), `Upgrade` 없으면 426, DO로 전달. 그리고 `GET /api/rooms/:roomId`(방 정보, 404/410) 추가 — 완료. 방 조회는 `src/worker/rooms.ts` `requireRoom`(형식이 틀린 id도 404, `password_hash`는 읽지 않음).
- [x] T042 [US1] `src/client/net/room-socket.ts`: 연결·join·ping 20초·재연결 백오프(1,2,4,8,이후 15초, ±20% 지터)·닫힘 코드별 동작(websocket.md 표), 이동 송신 throttle(변경 시에만, 초당 최대 5번, 멈추면 `idle` 1번) — 완료. 소켓 클래스·타이머·난수를 주입해 Node에서 테스트(`tests/client/room-socket.test.ts`). throttle은 마지막 자세를 200ms 뒤에 보내는 방식, 연결 중이 아닐 때 이동은 버린다.
- [x] T043 [US1] `src/client/state/room-store.ts`: 3D·2D가 같이 읽는 상태(you, channel, peers, chat, connection), 서버 메시지 적용 로직은 `src/core` 타입 사용 — 완료. `RoomStore`(`subscribe`/`getState`로 `useSyncExternalStore`). 끊기면 peers를 비우고 다음 welcome이 다시 채운다. 채팅·`room_updated`는 각 스토리에서.
- [x] T044 [US1] `src/client/room/RoomPage.tsx`: 방 정보 로드, 소켓 연결, 머리글(제목·채널·인원·내 닉네임·전환 버튼 자리), "다시 연결 중" 띠 — screens.md S3 공통 영역 — 완료. 404/410은 S6 문구와 목록으로 버튼. 재연결하지 않는 닫힘 코드는 안내로 바꾼다(4001 목록으로, 4002 새 버전·새로고침, 그 밖 연결 끊김·새로고침). 전환 버튼 자리만 두고 버튼은 T056.
- [x] T045 [US1] `src/client/room/room3d/Scene.tsx`(동적 import): R3F Canvas, Rapier 물리, 테마 `roomData.objects`를 GLB로 배치하고 `collider: "box"`는 고정 충돌체, ecctrl 3인칭 컨트롤러(WASD/방향키, Shift, Space), 내 위치를 `room-socket`으로 송신 — 완료. 바닥과 테마 경계의 벽은 충돌체. ecctrl 2는 입력을 직접 읽지 않아 매 프레임 키보드·조이스틱 상태를 `setMovement`로 넘기고, 카메라는 drei `CameraControls`가 따라간다(드래그로 회전). 물리는 `<Physics paused>` + ecctrl `TimeControl`(프레임마다 한 스텝, 최대 1/30초): 고정 스텝은 낮은 fps에서 튀고, 가변 스텝은 긴 프레임에서 폭주했다. 송신 규칙은 `src/client/room/send-rule.ts` `nextSend`(`tests/client/send-rule.test.ts`): 내 입력이 시작하고 남은 움직임이 끝나면 `idle` 한 번(가만히 있는 물리는 보내지 않음). 저장소의 `you`가 내 송신이 아닌 이유로 바뀌면(`correction`, 재연결 `welcome`, 테스트 훅) 3m 넘게 떨어졌을 때만 몸을 그 자리로 옮기고, 아니면 지금 위치를 한 번 더 보낸 뒤 `idle`을 보낸다(`onStorePose`, ai-review): 네트워크 지터로 생긴 `correction`은 한두 걸음 뒤이고, 서버는 거부할 때 `lastMoveAt`을 갱신하지 않아 다음 이동을 받아들인다. 거부된 것이 마지막 이동일 수 있어 다시 보낸다. `room-socket`은 `correction`을 받으면 마지막 송신 기억을 지워, 같은 자세도 다시 보낸다. 빌드한 `index-*.js`에 three·R3F·Rapier·ecctrl 없음 확인(3D 청크는 gzip 약 1.2MB). 도서관·정원 테마는 에셋(T067)이 들어올 때까지 3D가 실패해 머리글만 보인다. 실행 확인: main CI run 42426718401 통과(U3 머지 뒤, 커밋 324f072).
- [x] T046 [US1] `src/client/room/room3d/RemoteAvatar.tsx`: 다른 참가자 아바타(Quaternius 캐릭터, `avatarId`), 마지막 두 위치 보간, 애니메이션 상태, 머리 위 닉네임 — 완료. 보간은 송신 간격(200ms) 동안 이전 위치에서 새 위치로(그룹은 마운트 자세만 props로 받는다, ai-review). E2E `T046`이 닉네임 라벨의 화면 위치로 중간 프레임을 확인. 내 아바타도 같은 `Avatar`(0.5배, 약 1.65m)를 쓴다.
- [x] T047 [US1] `src/client/room/room3d/TouchControls.tsx`: 터치 기기에서 `ecctrl/input`의 `Joystick`·점프 `VirtualButton`, 카메라 드래그 — 완료. `(pointer: coarse)`일 때만. Joystick은 DOM(`div`, 포인터 이벤트)이라 E2E는 `aria-label`을 단 감싸는 상자를 찾아 마우스로 끈다. 카메라 드래그는 캔버스 전체(CameraControls).
- [x] T048 [P] [US1] `public/assets/`에 테마 1개분 CC0 에셋(Quaternius 방·가구·캐릭터, Poly Haven HDRI)과 `public/assets/CREDITS.md`(파일별 출처·라이선스), 테마당 첫 로딩 ≤ 5MB (판례 2026-11-07-assets-quaternius) — 완료. 카페: 캐릭터 8개(애니메이션 4개만, meshopt), Sushi Restaurant Kit 가구 4개, HDRI 1k, 합계 약 2.9MB. `bash scripts/fetch-assets.sh`가 원본(Drive 파일 ID 기록)에서 다시 만든다. 환경 네트워크에 `drive.google.com`·`drive.usercontent.google.com`을 추가했다(Quaternius 다운로드가 Drive). 실행 확인: 스크립트를 두 번 돌려 결과 파일이 바이트 단위로 같음. 실행 확인: main CI run 42426718401 통과(U3 머지 뒤, 커밋 324f072).
- [x] T049 [US1] `src/client/test-hooks.ts`: `import.meta.env.DEV`일 때만 `window.__roomboard = { state(), move(p, r) }` — 완료. `installTestHooks(store, socket)`를 RoomPage가 부른다.
- [x] T050 [US1] `scripts/check-bundle.mjs`(`npm run check:bundle`): `dist/` 클라이언트 번들에 `__roomboard` 문자열이 없으면 통과 — 완료. 폴더를 인자로 받고(기본 `dist/client`), 폴더가 없으면 실패. CI `build` 다음 단계. 실행 확인: 머지 후 main CI run 42349355500에서 `check:bundle` 통과.

**Checkpoint**: US1 독립 동작. MVP 데모 가능.

---

## Phase 4: User Story 2 — 2D 대체 화면으로 방 이용하기 (P1)

**Goal**: WebGL 없이도 같은 방 상태를 텍스트로 보고, 검색 엔진도 방 제목·설명을 읽는다.

**Independent Test**: quickstart Q4, Q5.

### Tests (먼저 작성, 실패 확인)

- [x] T051 [P] [US2] `tests/e2e/us2-fallback.spec.ts`: Q4(WebGL을 끈 컨텍스트 — `HTMLCanvasElement.prototype.getContext`에서 webgl/webgl2를 null로 — 로 입장하면 2D 자동, 오류 화면 없음, 3D 청크 요청 없음), 3D↔2D 전환 버튼, 다른 컨텍스트(3D)의 입장·퇴장이 2D 목록과 `aria-live` 영역에 반영, 키보드만으로 3D 전환 버튼 도달 — 완료. 도우미(`newPage`, `withoutWebGL`, `enter`, `state`, `move`)는 `tests/e2e/helpers.ts`로 옮겼다. 3D 청크 요청 확인은 URL 패턴(`/room3d/`, three, rapier, ecctrl, `Scene-*.js`)으로 하고, 같은 패턴이 3D 화면에서는 요청을 잡는지도 확인한다(dev 서버는 `Scene.tsx`와 사전 번들 의존성을 보낸다). 3D 로딩 실패는 `Scene` 요청을 끊어 만든다. T038 Q1의 2D 목록 갱신(1초)도 여기서 WebGL을 끈 두 컨텍스트로 잰다. US1의 "WebGL 없이도 머리글" 테스트는 Q4로 대체. 실행 확인: main CI run 42478521442 통과(US2 머지 뒤, 커밋 54780eb).
- [x] T052 [P] [US2] `tests/worker/seo-html.test.ts`: Q5 — `GET /rooms/seedroom01` HTML에 방 제목이 `<title>`과 `<noscript>`에, 설명이 `<meta name="description">`에 있음, 제목에 `<script>`가 있으면 이스케이프됨, 없는 방 404·삭제된 방 410 상태 코드로 HTML 응답 — 완료. 테스트 풀에는 정적 에셋이 없어 `ASSETS`를 `index.html?raw`를 `/`에서만 주는 가짜로 바꿔 넣는다(플랫폼은 `/index.html`을 `/`로 넘긴다). 잘못된 `%` 이스케이프도 404. 실행 확인: main CI run 42478521442 통과(US2 머지 뒤, 커밋 54780eb).

### Implementation

- [x] T053 [US2] `src/client/room/webgl.ts`: WebGL 지원 감지, `rb.view` 기본값 결정 — 완료. WebGL이 없으면 `rb.view`와 상관없이 2D(판례 2026-11-07-2d-view-rules).
- [x] T054 [US2] `src/client/room/room2d/Room2D.tsx`: screens.md S3 2D — `<main>`, `<h1>`, 설명, 테마, 채널, 참가자 `<ul>`(닉네임, 상태, 테마 구역 이름), 입장·퇴장 `aria-live` 알림 — 완료. App의 `<main>` 안에 `<section>`(h1, 설명, 테마·채널, 참가자 `<ul>`, `aria-live` 알림). 알림은 `RoomStore.notices`(`peer_joined`·`peer_left`에서만, 최근 5개).
- [x] T055 [US2] `src/core/themes.ts`에 테마별 구역(zone) 이름 키와 `zoneAt(themeId, p)` 추가, `tests/core/themes.test.ts`에 테스트 먼저 추가 — 완료. 구역은 바닥 사각형 `[minX, minZ, maxX, maxZ]` 목록, 마지막 구역은 나머지 전부(data-model.md Zone).
- [x] T056 [US2] `src/client/room/RoomPage.tsx`: 3D/2D 전환(선택 저장 `rb.view`), 3D는 `React.lazy`로만 로드, 3D 로딩 실패 시 2D로 전환하고 안내 — 완료. 전환 버튼은 머리글에, WebGL이 없으면 없다. `rb.view`는 버튼을 눌렀을 때만 저장. 3D가 실패하면(청크·WebGL·에셋) `SceneBoundary`가 2D로 바꾸고 안내를 띄운다. `React.lazy`는 실패한 import를 기억해서, 청크가 실패한 뒤 3D를 다시 누르면 새로고침 전까지 바로 2D로 돌아온다.
- [x] T057 [US2] `src/worker/index.ts`: `GET /rooms/:id` HTML 응답 — `env.ASSETS`의 `index.html`을 `HTMLRewriter`로 고쳐 제목·설명 삽입(이스케이프), 404/410 상태 코드 — 완료. `run_worker_first`에 `/rooms/*`, `assets.binding: "ASSETS"`. `/rooms/:id`만 HTML을 고치고 그 밖의 `/rooms/` 경로는 `ASSETS`로 넘긴다. `index.html`에 빈 `<meta name="description">`·`<noscript>`를 두고 `HTMLRewriter`의 `setAttribute`·`setInnerContent`가 이스케이프한다. dev(Vite 머리 스크립트 유지)와 빌드(`vite preview`) 모두에서 `curl`로 확인. D1이 실패하면 셸을 503으로 돌려주고 `onError`와 같은 방식(이름·스택만)으로 기록한다. 그러면 클라이언트의 방 요청이 다시 시도 화면을 띄운다(ai-review).

**Checkpoint**: US1 + US2 = P1 완료.

---

## Phase 5: User Story 3 — 방 만들기 (P2)

**Goal**: 제목·설명·테마·비밀번호로 방을 만들고 목록 맨 위에서 본다.

**Independent Test**: quickstart Q6, Q7.

### Tests (먼저 작성, 실패 확인)

- [x] T058 [P] [US3] `tests/worker/rooms-create.test.ts`: `POST /api/rooms` 201(응답 `Room`, D1에 `password_hash`가 `pbkdf2-sha256$` 형식이고 평문 없음, 제목·설명 필터 적용), 제목 빈 값·61자 400 `fields.title`, 설명 301자 400, 비밀번호 3자 400, 없는 테마 400, Turnstile 실패 키 403 `turnstile_failed`, 4번째 요청 429 — 완료. siteverify는 테스트에서 가짜 응답으로 바꾼다(클라우드 세션의 workerd는 DNS가 없다). 바인딩은 테스트 키가 아닌 비밀 키이고 가짜는 그 키에만 통과로 답한다. Cloudflare 테스트 키 두 개는 siteverify를 부르지 않는지 따로 확인한다. 보낸 값이 `secret`·`response` 둘뿐(`remoteip` 없음)인지도 확인한다. 403은 `app.request`에 실패 키를 넣은 env로 부른다. 요청마다 `cf-connecting-ip`를 다르게 줘서 rate limit 3회가 다른 테스트를 막지 않게 했다. 400은 siteverify를 부르지 않는다(판례 2026-11-08-create-room-check-order). JSON이 아닌 본문도 400. 실행 확인: main CI run 42537059524 통과(#24 머지 뒤, 커밋 3e3be8c).
- [x] T059 [P] [US3] `tests/worker/rooms-list.test.ts`: `GET /api/rooms` 최신순, 삭제된 방 제외, `limit` 기본 20·최대 50, `nextCursor` 페이지 이동, `onlineCount` 포함 — 완료. `limit` 범위 밖·숫자 아님, 형식이 틀린 `cursor`는 400. 커서는 `<createdAt>.<id>`이고 만든 시각이 같은 방도 겹치거나 빠지지 않는다. D1은 테스트마다 따로라서 각 테스트가 자기 행만 본다. 실행 확인: main CI run 42537059524 통과(#24 머지 뒤, 커밋 3e3be8c).
- [x] T060 [P] [US3] `tests/worker/password.test.ts`: `hashPassword`/`verifyPassword` 왕복, 틀린 비밀번호 거부, 저장 형식 파싱 — 완료. seed-dev(Node `pbkdf2Sync`)가 만든 해시 문자열을 그대로 검증하는 벡터, 반복 횟수를 문자열에서 읽음, 형식이 틀린 해시는 예외 없이 false. 실행 확인: main CI run 42537059524 통과(#24 머지 뒤, 커밋 3e3be8c).
- [x] T061 [P] [US3] `tests/e2e/us3-create.spec.ts`: Q6(양식 제출 → 방으로 이동, 다른 컨텍스트 목록 맨 위에 보임), Q7(공백 제목 → 요청 없이 필드 오류, 서버 403을 가로채 위젯 다시 시도 안내), 목록 빈 상태 문구(목록 응답을 가로채 빈 목록) (판례 2026-11-08-create-form-checks) — 완료. 실제로 방을 만드는 것은 Q6뿐이다(데스크톱·모바일 합쳐 실행당 2번, rate limit 3회/60초). 로컬에서 60초 안에 다시 돌리면 429가 날 수 있다. 위젯은 Cloudflare 테스트 사이트 키로 실제 토큰(더미)을 받는다. 서버는 테스트 비밀 키라 siteverify를 부르지 않는다. 403은 응답을 가로채 확인하고, 토큰이 비었다가 새 위젯이 새 토큰을 주는지도 본다. 제출은 버튼에 Enter로 한다. 버튼을 화면 안으로 스크롤해야 하는 `click()`은 클릭이 Turnstile 위젯의 교차 출처 iframe(닫힌 shadow root)에 떨어져 제출되지 않는 일이 있었다. 로컬에서는 매번, CI에서는 가끔 그랬고, 미리 스크롤해도 CI에서 한 번 실패했다. 위젯 높이 변화는 원인이 아니었다(측정함). 정확한 원인은 못 찾았다. `playwright.config.ts` `webServer`가 `.dev.vars`·`.env`를 예시 파일에서 복사한다(CI에는 없다). 실행 확인: main CI run 42537078538 통과(#25 머지 뒤, 커밋 d5b7c05).

### Implementation

- [x] T062 [P] [US3] `src/worker/password.ts`: 방 DO 안에서 부르는 PBKDF2-SHA256(T011: Worker CPU 10ms 초과), 16바이트 솔트, `pbkdf2-sha256$<반복>$<솔트>$<해시>`, 상수 시간 비교 — 완료. 검증은 길이를 먼저 비교한 뒤 `crypto.subtle.timingSafeEqual`. 실행 확인: main CI run 42537059524 통과(#24 머지 뒤, 커밋 3e3be8c).
- [x] T063 [P] [US3] `src/worker/turnstile.ts`: siteverify 호출, 실패 시 403 `turnstile_failed` — 완료. `remoteip`는 보내지 않는다(헌법 II). siteverify가 200이 아니면 예외 → 500 `internal`. Cloudflare 테스트 비밀 키(`1x…AA` 통과, `2x…AA` 실패)는 네트워크 없이 문서의 답을 돌려준다(판례 2026-11-08-turnstile-test-keys). 로컬 workerd는 DNS가 없어 siteverify에 닿지 못한다. 실행 확인: main CI run 42537059524 통과(#24 머지 뒤, 커밋 3e3be8c).
- [x] T064 [US3] `src/worker/rooms.ts`: `POST /api/rooms`(rate limit `RL_CREATE` → zod → Turnstile → 필터 → `createRoomData` → 새 id의 DO RPC `hashPassword` → D1 insert, id 랜덤 10자 URL-safe), `GET /api/rooms`(커서 페이지, `limit`·`cursor`가 틀리면 400) (판례 2026-11-08-create-room-check-order) — 완료. `wrangler.jsonc`에 `RL_CREATE`(3/60s), `secrets.required: ["TURNSTILE_SECRET"]`(CI처럼 `.dev.vars`가 없어도 `wrangler types`가 안다). 오류 `fields` 값은 문구 키 `field.title` 등(`src/core/api-schemas.ts` `FIELD_ERRORS`, `ko.ts` 문구는 T066). 금칙어 목록은 `.txt` 모듈로 읽는다. 실행 확인: main CI run 42537059524 통과(#24 머지 뒤, 커밋 3e3be8c).
- [x] T065 [US3] `src/client/board/BoardPage.tsx`: screens.md S1 — 최신순 카드, "지금 N명", 상대 시간, 무한 스크롤 + "더 보기" 버튼, 빈 상태 — 완료. `Link`(App.tsx)로 앱 안 이동. 상대 시간은 `Intl.RelativeTimeFormat`(`LOCALE`, `tests/client/board.test.ts`). 다음 페이지는 "더 보기" 버튼이 화면에 들어오면 불러오고(IntersectionObserver), 버튼도 그대로 둔다. 카드 격자는 `index.html`의 짧은 스타일(폰 1열, 넓은 화면 2~3열). 실행 확인: main CI run 42537078538 통과(#25 머지 뒤, 커밋 d5b7c05).
- [x] T066 [US3] `src/client/board/CreateRoomPage.tsx`: screens.md S2 — 입력, 남은 글자 수, 테마 카드 3개, 비밀번호 안내, Turnstile 위젯, 필드 오류, 성공 시 이동 — 완료. 제출 때 `createRoomRequest`·`fieldErrors`(`src/core/api-schemas.ts`, 서버와 공용)로 먼저 검사한다(판례 2026-11-08-create-form-checks). 400도 rate limit에 들어가지만, 클라이언트가 같은 스키마로 막으니 받아들인다(PR #24 리뷰 제안에 대한 결정). 403과 그 밖의 실패에서는 위젯을 새로 받고, 400·429에서는 토큰을 둔다. Turnstile 스크립트를 못 받으면(차단·오프라인) 네트워크 오류와 다시 시도를 보인다. 테마 카드 미리보기는 T067의 `previews/`. 실행 확인: main CI run 42537078538 통과(#25 머지 뒤, 커밋 d5b7c05).
- [x] T067 [P] [US3] 나머지 테마 2개분 CC0 에셋과 테마 미리보기 이미지를 `public/assets/`에 추가, `CREDITS.md` 갱신 — 완료. 도서관: Quaternius Ultimate Furniture(책장·책상·소파)와 Ultimate Home Interior(스탠드). 정원: Ultimate Nature(나무·꽃)와 Medieval Village(벤치·우물). HDRI: Poly Haven Reading Room, Garden Nook(1k). Quaternius Drive 폴더에 분수가 없어서 정원 가운데를 우물로 바꿨다(`zone.well`). 이 팩들은 Drive에 OBJ + MTL만 있다. `obj2gltf`는 의존성(cesium) 문제로 깨져서, Node 내장 기능만 쓰는 `scripts/obj-to-glb.ts`(테스트 `tests/scripts/obj-to-glb.test.ts`)로 GLB를 만들고 weld·meshopt한다. 크기는 테마의 `scale`로 맞춘다. 첫 로딩은 도서관 약 3.1MB, 정원 약 3.2MB. `tests/core/themes.test.ts`가 테마마다 HDRI와 오브젝트 GLB 파일이 있는지 확인한다. 미리보기 `previews/<테마>.jpg`(각 약 8KB)는 `scripts/theme-previews.ts`가 dev 서버의 3D 방을 찍어 만들고, 4xx 응답이나 오류 안내가 있으면 실패한다. 실행 확인: `fetch-assets.sh`를 두 번 돌려 결과가 바이트 단위로 같음(기존 13개 파일 해시 그대로), 미리보기 스크립트로 세 테마 모두 3D가 뜸. 실행 확인: main CI run 42537078538 통과(#25 머지 뒤, 커밋 d5b7c05).

**Checkpoint**: 사용자가 직접 방을 만들 수 있다.

---

## Phase 6: User Story 4 — 방 안에서 채팅하기 (P2)

**Goal**: 같은 채널끼리 실시간 채팅, 욕설 필터, 속도 제한, 메시지 신고 진입점.

**Independent Test**: quickstart Q8, Q9.

### Tests (먼저 작성, 실패 확인)

- [x] T068 [P] [US4] `tests/core/room-session.test.ts`에 채팅 케이스 추가: 필터 적용 후 같은 채널 전원에게 `chat`(보낸 사람 사본에만 `nonce`), 다른 채널에는 안 감, "10초에 5개" 초과 시 보낸 사람에게만 `rate_limited`(`nonce` 포함), 공백만 있는 메시지·201자 거부 — 완료. `receive`는 비동기다(서명이 WebCrypto라서). 메시지 id가 Hibernation 뒤에도 겹치지 않는지, 채팅 버킷이 이동 버킷과 따로인지도 검사. 공백만·201자는 스키마에서 `bad_message`(4008 횟수에 들어감). 실행 확인: main CI run 42576130321 통과(#26 머지 뒤, 커밋 c247a6d).
- [x] T069 [P] [US4] `tests/worker/chat-sign.test.ts`: DO가 보낸 `chat.sig`가 `HMAC-SHA256(SERVER_SECRET, "chat|" + roomId|messageId|nickname|text|sentAt|channel)`(base64url)와 일치, 필드 하나라도 바꾸면 검증 실패 — 완료. 기대 서명은 테스트가 WebCrypto로 따로 계산한다. 서명은 패딩 없는 base64url 43자. 방·비밀 키·서명이 바뀌어도 실패, 본문을 닉네임 쪽으로 `|` 너머 옮기면 서명 문자열은 같아도 실패(판례 2026-11-09-chat-sig-separator). 본문 끝을 문자열 `sentAt`으로 옮겨도 실패(`sentAt`·`channel`은 정수만, PR #26 리뷰). `SERVER_SECRET`은 `wrangler.jsonc` `secrets.required`와 vitest 바인딩에 있다. 실행 확인: main CI run 42576130321 통과(#26 머지 뒤, 커밋 c247a6d).
- [x] T070 [P] [US4] `tests/e2e/us4-chat.spec.ts`: Q8(A 전송 → B에 1초 안에 3D·2D 모두 표시, 금칙어 가려짐), Q9(10초 안에 6개 → 6번째 미전달, A에게 안내), 채팅 입력 중 이동 키가 아바타를 움직이지 않음 — 완료. Q8·Q9의 시간은 WebGL을 끈 2D 컨텍스트로 재고, 3D 표시는 따로 3D 컨텍스트에서 시간 제한 없이 본다(T038 메모). 화면 전 커밋(79daa58)에서 데스크톱·모바일 각 3개 모두 채팅 패널이 없어 실패하는 것을 확인했다. T074 확인은 먼저 W로 실제로 움직이는 것을 본 뒤 입력 중에는 움직이지 않는지 본다. Scene의 막기를 빼면 이 테스트가 실패하는 것을 확인했다. 모바일은 Enter 대신 입력창을 누른다(방금 누른 `<summary>`에서 Enter는 패널을 접는다). 2D에 `aria-live`가 둘(알림·채팅)이 되어 `us2-fallback`의 알림 찾기를 `div`로 좁혔다. 로컬 전체 실행에서 모바일 T074가 한 번 앞 단계(W로 움직이는지)의 30초 재시도 안에 움직이지 못해 실패했다(3D 부하). 단독 3번은 통과. PR #26 CI에서 3D 쪽이 세 번 연속 다른 곳에서 실패했다: Q8의 3D 표시 확인(기본 5초, run 42539252136·42542585022), 모바일 3D 페이지의 `enter` 연결 대기(15초, run 42539252136·42541919523). 메시지가 사라진 것은 아니다. `open`은 `welcome`에서 켜지고, 클라이언트는 pong이 없다고 스스로 재연결하지 않는다. 로컬에서 3D 페이지 CPU를 30배 늦춰도 1.8초 뒤 도착했다. 원인은 T038과 같은 CI의 소프트웨어 WebGL이라, 3D 쪽 기다림을 T074와 같은 30초로 늘렸다(Q8 3D 확인, `helpers.ts` `enter`). 2D의 1초 기준은 그대로다. 30초로 늘린 뒤(run 42543483144, 42543611523)에도 T074가 데스크톱(W로 30초 안에 안 움직임)과 모바일(`enter`가 30초 동안 `connecting`)에서 실패했다. 느린 것보다 멈춘 것에 가까워서 기다림은 더 늘리지 않는다. 원인을 보려고 CI가 실패할 때 `test-results/`(페이지 스냅숏)를 `e2e-results` 아티팩트로 올린다. 실행 확인: run 42544750374에서 실패 뒤 `e2e-results`(7.9KB)가 올라갔다. 진짜 원인은 테스트 정리였다. `helpers.ts`의 최상위 `test.afterEach`는 워커당 한 번 읽히는 모듈 안에 있어서 처음 가져간 스펙(us1)에만 걸렸고, us2·us3·us4는 연 페이지를 닫지 않았다. 그래서 T074가 들어갈 때 방에 13명이 남아 있었고(로컬 전체 실행, 단독 실행은 0명) 남은 3D 페이지가 CPU를 썼다. 정리를 자동 fixture(`closeContexts`)로 옮기고 스펙은 `helpers.ts`의 `test`를 쓴다. us1 → us2 뒤 열린 컨텍스트가 7 → 0이 됐다. 앞서 늘린 30초 기다림은 그대로 둔다(T038의 소프트웨어 WebGL 부하는 따로 있다). 실행 확인: main CI run 42576130321 통과(#26 머지 뒤, 커밋 c247a6d).

### Implementation

- [x] T071 [US4] `src/core/room-session.ts`에 채팅 처리 추가(필터, 버킷, `messageId` 생성, 서명은 주입된 함수로 — core는 crypto 구현에 기대지 않음) — 완료. `RoomSession(room, { filter, sign })`. 버킷 → 필터 → 서명 → 같은 채널 전원(보낸 사람 사본에만 `nonce`). 버킷은 서명을 기다리기 전에 쓴다. `messageId`는 `m_<ms 36진수>.<순번>`(방 안에서 유일). 실행 확인: main CI run 42576130321 통과(#26 머지 뒤, 커밋 c247a6d).
- [x] T072 [US4] `src/worker/chat-sign.ts`: WebCrypto HMAC 서명·검증, `room-do.ts`에서 `RoomSession`에 서명 함수 주입 — 완료. `signChat`·`verifyChat`(`crypto.subtle.verify`로 비교). 필터는 `rooms.ts`의 것을 같이 쓴다. 미리보기 배포 워크플로가 아직 없어 `SERVER_SECRET` 저장소 Secret 연결은 그때 한다. 실행 확인: main CI run 42576130321 통과(#26 머지 뒤, 커밋 c247a6d).
- [x] T073 [US4] `src/client/room/ChatPanel.tsx`(3D·2D 공용): 메시지 목록, 200자 입력, Enter 포커스/Esc 해제, `rate_limited` 안내, 2D에서는 `aria-live="polite"`, 모바일 접힘 패널 — 완료. 메시지 목록에만 `aria-live`(2D), 최근 100개, 연결이 열려 있을 때만 입력, 200자를 넘으면 보내지 않고 안내(입력창 `maxLength`는 붙여 넣은 글을 말없이 잘라서 뺐다, PR #26 리뷰), 공백만 있으면 보내지 않음(서버에서는 `bad_message`). 3D에서는 `<details>`(터치 기기는 접힘). Enter는 다른 곳에 포커스가 없을 때만 입력창으로 간다(판례 2026-11-09-chat-panel). `tests/client/chat-panel.test.tsx`. PR #26 리뷰 반영: 속도 제한 안내는 `retryAfterMs`가 지나면 사라지고, 재연결로 다른 채널에 들어가면 이전 채널 채팅을 지운다. 속도 제한에 걸린 메시지는 입력창에 돌아오고, 기다리는 동안은 Enter로 보내지 않는다(Q9 E2E). 되돌리는 것은 마지막으로 보낸 글 하나뿐이다. `rate_limited`가 오기 전에 두 번 보내면 앞의 글은 사라진다(코드 `shortcut:` 주석). 터치 기기에서는 패널이 조이스틱 상자(아래 16px, 높이 200px) 위(`bottom: 232`)에 뜬다. 펼친 패널이 조이스틱·점프 버튼과 겹치지 않는지 모바일 T074 E2E가 본다(PR #26 리뷰). 실행 확인: main CI run 42576130321 통과(#26 머지 뒤, 커밋 c247a6d).
- [x] T074 [US4] `src/client/room/room3d/Scene.tsx`: 채팅 입력 포커스 중 이동 입력 비활성 — 완료. 입력창에 포커스가 있으면 키보드 이동을 모두 끈다(조이스틱은 그대로). 실행 확인: main CI run 42576130321 통과(#26 머지 뒤, 커밋 c247a6d).

**Checkpoint**: 채팅 동작, 신고 버튼은 US7에서 연결.

---

## Phase 7: User Story 5 — 인원이 많을 때 채널 자동 분리 (P2)

**Goal**: 채널당 20명, 넘치면 새 채널.

**Independent Test**: quickstart Q10.

### Tests (먼저 작성, 실패 확인)

- [x] T075 [P] [US5] `tests/worker/channels-do.test.ts`: WebSocket 21개 접속 → 21번째 `welcome.channel === 2`, 채널 1 참가자는 21번째의 `peer_joined`·`peer_moved`·`chat`을 받지 않음, 채널 1에서 1명 나간 뒤 새 접속은 채널 1 — 완료. 채널 배정과 채널별 전송은 US1·US4에서 이미 있어서 처음부터 통과했다. 대신 깨뜨려 확인했다: 전송에서 채널 조건을 빼거나 정원을 21로 바꾸면 실패한다. "받지 않음"은 21번째가 이동·채팅한 뒤(자기 채팅 사본으로 DO 처리를 확인) 채널 1 참가자가 받는 다음 메시지가 같은 채널의 채팅인지로 본다.
- [x] T076 [P] [US5] `tests/e2e/us5-channel.spec.ts`: 방 머리글과 2D 화면에 "채널 N", "인원 n/20" 표시 — 완료. 머리글(3D·2D 공통)에 "채널 1 · n/20". n은 나와 내가 보는 참가자 수와 같고, 한 명이 들어오면 n+1, 나가면 다시 n. 시드 방을 앞 테스트와 같이 쓰고 그 참가자가 아직 나가는 중일 수 있어서, 고정 숫자나 앞서 읽은 n 대신 그때의 상태(나 + 내가 보는 참가자)와 머리글이 같은지 본다(PR #27 리뷰). 머리글 식이 상태 식과 같아서, 상태의 인원이 틀리는 경우(중복 `peerId`, `peer_left` 뒤 남음)는 이 테스트가 잡지 못한다. 이것은 `room-store` 단위 테스트와, 이 테스트의 `b`가 상태에 들어오고 빠지는 폴링이 맡는다(PR #27 리뷰 제안, 미룸). 2D 본문(`<h1>`이 있는 구역)에 "채널 1"(screens.md S3 2D는 채널만). 처음부터 통과했고, 인원을 하나 적게 세게 바꾸면 실패한다. 머리글은 `<main>` 안이라 `banner` 역할이 아니어서 `header`로 찾는다. 21명 채우기는 T075(Worker 테스트, Q10)가 맡는다.

### Implementation

- [x] T077 [US5] `src/worker/room-do.ts`·`src/core/room-session.ts`: 채널별 브로드캐스트 확인·보완(T075 통과까지) — 완료. 고칠 것 없음(T075가 그대로 통과).
- [x] T078 [US5] `src/client/room/RoomPage.tsx`·`room2d/Room2D.tsx`: 채널 번호·인원 표시(i18n 키) — 완료. 고칠 것 없음. `room.channel`·`room.people` 키로 이미 보인다(T076). 실행 확인: main CI run 42577361955 통과(#27 머지 뒤, 커밋 1cf779d).

---

## Phase 8: User Story 6 — 내 글 수정·삭제 (P3)

**Goal**: 글 비밀번호로 수정·삭제, 방 안 참가자에게 반영.

**Independent Test**: quickstart Q11.

### Tests (먼저 작성, 실패 확인)

- [x] T079 [P] [US6] `tests/worker/rooms-update.test.ts`: `PATCH` 맞는 비밀번호 200·`updated_at` 갱신, 테마 변경 시 `room_data.objects`가 새 테마 기본값, 접속 중 소켓에 `room_updated`; 틀린 비밀번호 403·변경 없음; 6번째 시도 429; 비밀번호만 보내면 400(`minProperties: 2`) — 완료. 접속 중 소켓은 DO를 내보낸(Hibernation) 뒤에도 `room_updated`를 받고, 다음 참가자는 새 방·새 스폰과 스폰으로 옮겨진 다른 참가자를 본다(attachment에도 기록됐는지 한 번 더 내보낸 뒤 확인). 제목은 필터를 거친다. 코어 `RoomSession.update` 테스트(모든 채널, 테마가 바뀔 때만 스폰으로)와 `room-store`의 `room_updated` 테스트를 같이 두었다. 구현 전 커밋(383038a)에서 모두 실패. 필터 단어를 실제 목록에 있는 것으로 바꾼 수정은 구현 커밋에 있다.
- [x] T080 [P] [US6] `tests/worker/rooms-delete.test.ts`: `DELETE` 맞는 비밀번호 204, `deleted_at`·`deleted_by='owner'`, 접속 중 소켓에 `room_deleted {by:"owner"}` 후 4001, 이후 `GET` 410·목록 제외; 틀린 비밀번호 403 — 완료. DO를 내보낸 뒤 삭제해도 두 참가자 모두 `room_deleted` 뒤 4001을 받는다. 구현 전 커밋에서 실패.
- [x] T081 [P] [US6] `tests/e2e/us6-edit.spec.ts`: 제목 수정이 목록·방 안에 반영, 방 안 참가자가 삭제 모달 → 목록으로 이동(재연결 안 함) — 완료. 틀린 비밀번호 403 문구, 맞는 비밀번호로 저장 → 방 안 손님의 제목 갱신·목록 반영, 삭제 확인 대화상자 → 주인은 목록, 손님은 "이 방은 삭제됐어요" 모달(3초 동안 새 WebSocket 없음) → 확인 → 목록(삭제된 방 없음). 방은 테스트가 API로 만든다(`seedroom01`은 다른 스펙과 같이 씀). 만들기 제한(60초 3회)을 us3 Q6·다른 프로젝트와 같이 쓰므로 429면 `Retry-After`만큼 한 번 기다린다. 구현 전에는 머리글에 수정 링크가 없어 실패했다.

### Implementation

- [x] T082 [US6] `src/worker/rooms.ts`: `PATCH /api/rooms/:id`, `DELETE /api/rooms/:id`(rate limit `RL_PASSWORD` → DO RPC `verifyPassword` → D1 → DO RPC `roomUpdated(room)` / `roomDeleted(by)`) 후속(PR #21 리뷰 제안): 재연결 대기 중 방이 삭제되면 업그레이드가 410이라 브라우저는 1006으로만 알고 계속 재연결한다. websocket.md 닫힘 표에 줄을 먼저 추가하고(예: welcome 없이 몇 번 실패하면 `GET /api/rooms/:id`로 확인해 S6), 테스트 먼저. — 완료. 순서는 rate limit(`RL_PASSWORD` 5/60s, `wrangler.jsonc`에 추가) → 입력 검사(400) → D1(404/410) → DO RPC `verifyPassword`(403 `wrong_password`) → D1 → DO RPC. 해시는 `rooms.ts` 밖으로 나가지 않고 DO에만 넘긴다. 테마가 같으면 `room_data`를 그대로 둔다. 후속(재연결 중 삭제)도 처리: websocket.md 닫힘 표 아래에 규칙을 먼저 적고, `welcome` 전에 닫힌 연결마다 `GET /api/rooms/:id`로 확인해 404·410이면 4001처럼 멈춘다(판례 2026-11-09-room-gone-check, `room-socket` 테스트).
- [x] T083 [US6] `src/worker/room-do.ts`: RPC `roomUpdated`(모든 채널에 `room_updated`), `roomDeleted`(`room_deleted` 후 4001로 전부 닫기) — 완료. `roomUpdated(room, respawn)`: 테마가 바뀌었는지는 Worker가 알린다(깨어난 세션은 이미 새 방을 읽어 비교할 수 없다). 바뀐 자세는 attachment에도 쓴다. `roomDeleted`는 세션을 거치지 않고 소켓 전부에 보내고 닫으며, 그 DO는 세션을 다시 만들지 않는다(판례 2026-11-09-room-gone-check).
- [x] T084 [US6] `src/client/board/EditRoomPage.tsx`: screens.md S4 — 현재 값, 테마 변경 안내, 삭제 확인 대화상자, 403 문구 — 완료. 제목·설명·테마 입력은 S2와 같은 `RoomFields`를 쓴다(`CreateRoomPage.tsx`에서 꺼냄). 삭제 확인은 `<dialog>`의 `showModal()`. 머리글에 "방 수정·삭제" 링크(S3 메뉴).
- [x] T085 [US6] `src/client/room/RoomPage.tsx`: `room_updated` 시 장면 재구성·스폰 이동, `room_deleted` 모달 → 목록 — 완료. 장면 재구성은 `Scene`이 store의 `room`을 읽어 이미 된다. store가 테마 변경 때 나와 참가자를 스폰으로 옮기고, 기존 `onStorePose`가 몸을 옮긴다. `room_deleted`는 뒤따르는 4001 닫힘으로 끝나고, 4001 화면을 S3 "방이 삭제됨" 모달(`alertdialog`, 확인 → S1)로 바꿨다(이전에는 S6 문구였다).

---

## Phase 9: User Story 7 — 신고와 관리자 삭제 (P3)

**Goal**: 방·메시지 신고, 관리자 토큰으로 검토·삭제.

**Independent Test**: quickstart Q12, Q13, Q15.

### Tests (먼저 작성, 실패 확인)

- [x] T086 [P] [US7] `tests/worker/reports.test.ts`: 방 신고 201 → 같은 `deviceKey` 재신고 200 `duplicate:true`; `reporter_hash`가 `HMAC-SHA256(SERVER_SECRET, "reporter|" + 기기 키)` hex이고 기기 키 원문이 D1 어디에도 없음; 메시지 신고(서명 유효) 201 + `message_snapshot` 저장; `text`를 바꾼 신고 400; `sentAt` 24시간 초과 400; 삭제된 방 410; 11번째 요청 429 — 메모: `chat.sig`는 패딩 없는 base64url 43자라 마지막 글자 하위 2비트가 버려져, 한 메시지에 통과하는 `sig` 문자열이 4가지다. 중복 판정은 `reporter_hash` + 신고 대상으로 하고 `sig`를 식별자로 쓰지 않는다. 쓰게 되면 다시 인코딩해 같은지 비교한다(PR #26 리뷰). — 완료. 서명이 맞고 24시간이 지났을 때만 `fields.message = "report.expired"`, 고친 오래된 메시지는 그냥 400. 다른 방 서명 400, 404, 잘못된 본문 400도 검사. 구현 전 22개 중 21개 실패 확인.
- [x] T087 [P] [US7] `tests/worker/admin.test.ts`: 토큰 없음·틀림 401(6번째 429), 신고 목록 `status` 필터·`reportCount` 집계·`roomTitle`, `resolve` 204, 관리자 방 삭제 204 → 그 방 `open` 신고 전부 `resolved`, `deleted_by='admin'`, 접속 중 소켓 `room_deleted {by:"admin"}` — 완료. 목록은 대상마다 한 줄, 처리 완료는 대상 단위(판례 2026-11-09-report-list-per-target). 맞는 토큰은 횟수에 들지 않고, `ADMIN_TOKEN`이 비면 아무것도 통과하지 않는다. 50개 페이지 넘김도 검사. 테스트의 `ADMIN_TOKEN`은 `app.request`의 env로 넣는다.
- [x] T088 [P] [US7] `tests/e2e/us7-report.spec.ts`: 방 신고 대화상자(접수·중복 문구), 채팅 메시지 신고, 관리자 화면 토큰 입력 → 목록에 스냅샷 → 방 삭제 → 방 주소 "삭제된 방"(Q12, Q15), 토큰 없이 접근 거부(Q13) — 완료. 이 스펙만의 방을 만든다(삭제는 되돌릴 수 없고 다른 스펙이 `seedroom01`을 쓴다). 틀린 토큰 화면 문구, 같은 기기 중복은 신고 수 1, 방 삭제 뒤 방 안 사람에게 삭제 모달, 처리된 탭에 2건도 확인. 프로젝트 한 번에 신고 3번·틀린 토큰 2번(제한 10·5 안). `createRoom`은 us6에서 `helpers.ts`로 옮겼다.

### Implementation

- [x] T089 [US7] `src/worker/reports.ts`: `POST /api/reports`(rate limit `RL_REPORT` → zod → 방 확인 → 메시지면 서명·24시간 검증 → `reporter_hash` 계산 → `INSERT ... ON CONFLICT DO NOTHING`으로 중복 판별) — 완료. `wrangler.jsonc`에 `RL_REPORT`(10/60s)·`RL_ADMIN`(5/60s)과 비밀값 `ADMIN_TOKEN`.
- [x] T090 [US7] `src/worker/admin.ts`: Bearer `ADMIN_TOKEN` 상수 시간 비교 미들웨어(실패 시 `RL_ADMIN`), `GET /api/admin/reports`, `POST /api/admin/reports/:id/resolve`, `DELETE /api/admin/rooms/:id`(DO `roomDeleted("admin")`) — 완료. 토큰은 SHA-256 다이제스트끼리 `timingSafeEqual`(길이를 드러내지 않음). 방 삭제와 신고 처리는 D1 `batch` 하나.
- [x] T091 [US7] `src/client/room/ReportDialog.tsx`(3D·2D 공용): 사유 5개, 결과 문구(접수·중복·만료), 방 메뉴와 `ChatPanel` 메시지에 연결 — 완료. `Dialog`(`purpose="form"`)·`DialogHeader`·`RadioList`·`Button`. 결과는 대화상자 안 `role="status"` 문구로 바꾼다. 방 신고는 머리글 버튼, 메시지 신고는 메시지마다 네이티브 버튼(이름 "<닉네임> 님 메시지 신고", Astryx `Button`의 live region을 목록에 넣지 않으려고, T105). 만료는 서버의 `fields.message = "report.expired"`로 고른다. E2E는 대화상자의 status를 문구로 거른다(닫기·보내기 버튼에도 빈 status가 있다). PR #39 리뷰: 버튼이 읽어 주는 목록 안에 있으면 새 메시지마다 버튼 이름까지 읽혀서, 2D는 "닉네임: 내용"만 담은 숨긴 목록(`VisuallyHidden`)이 읽고 보이는 목록은 읽지 않는다(판례 2026-11-09-chat-live-text).
- [x] T092 [US7] `src/client/admin/AdminPage.tsx`: screens.md S5 — 토큰은 sessionStorage, 열린/처리된 탭, 스냅샷 표시, 방 삭제·처리 완료 — 완료. `TextInput`(비밀번호 형식, 401이면 토큰을 지우고 필드 오류)·`TabList role="tablist"`·`List`/`ListItem`(label·description·endContent)·`AlertDialog`(방 삭제 확인). sessionStorage를 못 쓰면 페이지 메모리. 410(이미 삭제)은 성공으로 본다. 첫 JS 청크 gzip 260.8KB(R16). PR #39 리뷰로 고친 상태 처리(탭·시도마다 결과 칸, 더 보기 중복 제거, 처리·삭제·다음 페이지 실패에도 목록 유지와 같은 작업 다시 시도, 429면 토큰을 지우고 입력 화면)는 `us7-admin-states.spec.ts`가 관리자 API를 `page.route`로 흉내 내어 확인한다. 고치기 전 커밋 9504af3에서 4개 모두 실패했다.

---

## Phase 9a: 디자인 시스템 도입 (research R16)

**Goal**: 화면을 Astryx 컴포넌트로 바꾼다. 동작·문구·스펙은 그대로, E2E는 역할·라벨·문구로 계속 통과.

- [x] T100 `package.json`·`src/client/main.tsx`: Astryx·테마·`@stylexjs/stylex` 정확한 버전 설치, CSS 세 개와 `Theme`·`InternationalizationProvider`(ko-KR)·`LinkProvider`(앱 `Link`). 화면은 그대로 두고 E2E 전체 통과로 3D·터치에 리셋 CSS 영향이 없는지 확인 — 완료. 로컬 E2E 38개 모두 통과(us1 3D·모바일 터치 포함, 2.6분). 측정은 research R16. #32 머지 뒤 main CI run 42590589087에서 데스크톱 3D 두 개(us1 T045 5초 기다림 초과, T046 '사이 위치' 샘플 206→315)가 실패했다. 같은 트리(d45c0ed)는 PR 실행에서, 다음 main run 42592363104도 통과했다. 원인 미확인(T038의 CI 소프트웨어 WebGL 부하와 같은 모양). 다시 나오면 원인을 본다. 재발(#36 머지 뒤 main run 42602091856·42603349133, PR #38·#39의 CI): 모바일·데스크톱 T045 `:35`(기본 5초 poll), T046 '사이 위치'. 로컬에서 CPU 부하·4배 스로틀로 재현되지 않았고, 프레임 간격은 #36 전과 같았다(중앙값 34~45ms). CI 로그의 T046 샘플은 약 50ms 간격인데 끝 위치로 바로 뛰었다. 남은 설명은 200ms 글라이드 전체에 걸친 한 번의 프레임 정지다. 고친 것: T045 `:35`는 `enter()`와 같은 30초. T046은 마지막 옛 위치 프레임과 첫 이동 프레임의 간격이 200ms 이상이면(관찰 불가) 그 시도를 다시 하고, 간격이 짧은데 끝으로 뛰면 실패한다. 글라이드를 1ms로 줄인 코드에서 T046이 '사이 위치'로 실패하는 것을 확인했다. 재발(#42 머지 뒤 main run 42727510876, PR #43): 원인은 테스트가 아니라 라벨이었다. drei `Html`의 frame 콜백이 먼저 구독돼 아바타를 옮기는 콜백보다 먼저 돌아, 라벨이 한 프레임 늦게 따라갔다. 긴 프레임 바로 뒤의 짧은 프레임에서 라벨이 끝으로 뛰었다(CI 숫자 206→315가 로컬에서 그대로 나옴). `RemoteAvatar`의 `useFrame` 우선순위를 -1로 해 먼저 돌린다. 300ms 멈춘 다음 프레임에 라벨이 끝에 있는지 보는 E2E를 추가했다(고치기 전 두 프로젝트에서 실패). 재발(#45 CI run 42924411681 `:57` 입력 30초 미반영, 42924787847·#43 run 42727867496 `enter()` 30초 'reconnecting', 모두 모바일 T045): 인수인계에서 의심한 perf.spec의 `vite preview`가 개발 서버와 `.wrangler/state`를 같이 쓰는 것은 원인이 아니다. 같은 방 DO를 두 서버가 동시에 열고 preview를 끈 뒤에도 개발 서버 입장 6/6 성공, 모바일 T045 실패는 perf.spec(#42) 전에도 있었다(위 #36 뒤 기록). 로컬(4코어)에서 a11y→perf→us1 3회, CPU 스로틀 4·10·20배, DPR 5에서 재현 안 됨. 방 소켓은 열리자마자 join을 보내 join 5초 마감도 멀었다. PR #46 CI에서 T045를 5회 반복(10회) 모두 통과. 원인 미확인. CI 실패 아티팩트는 클라우드 세션에서 받을 수 없어, `enter()`와 T045 실패 메시지에 방 소켓 기록(new/open/welcome/close 코드와 보낸 move 수, 1초 넘는 메인 스레드 정지)을 붙였다(`tests/e2e/helpers.ts`). 다시 나오면 그 기록으로 서버 쪽(close 1006, open 없음)인지 클라이언트 쪽(정지·close 4000)인지 가른다.
- [x] T101 [P] `src/client/board/BoardPage.tsx`, `src/client/Status.tsx`: S1과 공통 상태 — 완료. 목록은 `List`·`ListItem`(li 안 링크), 빈 목록은 `EmptyState`, 더 보기는 `Button`. Astryx `Spinner`·`Banner`에는 알림 역할이 없어 `role="status"`·`role="alert"` 감싸기를 유지한다. `EmptyState`는 제목을 live region에도 써서 E2E는 빈 목록 문구를 제목 역할로 찾는다. 앱 `Link`는 받은 `onClick`을 먼저 부르고 다른 출처·`target`·수정 클릭·`defaultPrevented`는 브라우저에 맡긴다(PR #32 리뷰, `app.test.tsx`, 고치기 전 커밋 d03e6ad에서 실패). 첫 JS 청크 gzip 147.8KB → 199.1KB(4G에서 약 0.3초 추가). 로컬 E2E 40개 통과(빈 목록 문구 1건 고친 뒤 us3 8개 재실행). 실행 확인: main CI run 42592363104 통과(#33 머지 뒤, 커밋 00a3fd5, 단위 377·E2E 40).
- [x] T102 [P] `src/client/board/CreateRoomPage.tsx`: S2(입력 필드·테마 라디오·제출 버튼) — 완료. `TextInput`·`TextArea`·`RadioList`·`Button`, Turnstile은 그대로. 남은 글자 수와 비밀번호 안내는 필드 `description`, 필드 오류는 `status`(aria-invalid·aria-describedby). Astryx 필드는 네이티브 `maxLength`를 받지 않아 `slice`로 자른다(`TextArea`의 `maxLength`는 자르지 않고 자체 카운터를 그려 쓰지 않는다). 제목·비밀번호는 `isRequired`("필수" 표시, 스펙의 필수 입력). 오류 문구는 live region에도 나와 E2E Q7은 필드의 접근성 설명으로 확인한다. S4도 `RoomFields`를 같이 쓴다(비밀번호·삭제 확인은 T103). PR #33 리뷰 약속: 스크롤만으로 다음 페이지를 부르는 E2E 추가(us3). 첫 JS 청크 gzip 199.1KB → 205.9KB. 로컬 E2E 42개·단위 377 통과.
- [x] T103 `src/client/board/EditRoomPage.tsx`: S4(삭제 확인은 `AlertDialog`). PR #31 머지 뒤 — 완료. 제목·설명·테마는 T102의 `RoomFields`, 비밀번호는 `TextInput`(오류는 `status`), 저장·삭제는 `Button`, 삭제 확인은 `AlertDialog`(제목 "삭제", 설명은 기존 확인 문구, 취소는 우리 문구). 쓰는 곳이 없어진 `FieldError`는 지웠다. E2E us6은 확인 창을 `alertdialog` 역할로 찾는다. 첫 JS 청크 gzip 205.9KB → 251.4KB(원인과 판단은 R16). 로컬 E2E 42개·단위 377 통과.
- [x] T104 `src/client/room/RoomPage.tsx`·`room2d/Room2D.tsx`: S3 머리글·안내·2D 본문, S6 — 완료. 머리글은 `Stack`·`Text`·`Button`·`Link`(3D에는 h1이 없도록 제목은 `Text`), 다시 연결 중 띠·3D 실패 안내·닫힘·S6 안내는 `Banner`를 `role="status"`/`"alert"`로 감싼다. 삭제된 방 모달은 확인 하나라 `AlertDialog` 대신 `role="alertdialog"` `Stack`과 `Button`. 2D는 `Heading`·`List`·`ListItem`, 입·퇴장 live region은 그대로. 첫 JS 청크 gzip 251.5KB(R16, 수정 화면 지연 로딩은 운영자 결정 대기). 로컬 E2E 42개·단위 377 통과.
- [x] T105 `src/client/room/ChatPanel.tsx`·`room3d/TouchControls.tsx`: 3D 위 겹침. 마지막에, 가장 작게 — 완료. 채팅 제목은 `Heading`, 입력은 `TextInput`(라벨 숨김, 끌 때는 aria-disabled + readOnly로 포커스는 남는다). 보내기는 네이티브 버튼으로 둔다: Astryx `Button`은 안에 빈 `role="status"` live region을 늘 그려서 "읽어 주는 영역은 메시지 목록뿐"(판례 2026-11-09-chat-panel)과 E2E의 status 확인이 깨진다. `TouchControls`는 ecctrl 조이스틱·점프 버튼이라 바꿀 Astryx 컴포넌트가 없어 그대로 둔다. PR #36 리뷰 제안대로 삭제된 방 모달의 이름 연결(`aria-labelledby`·`id`) 단언을 추가했다. 첫 JS 청크 gzip 251.5KB. 로컬 E2E 42개·단위 377 통과.
- [x] T106 [P] `tests/client/room-header.test.tsx`·`room2d.test.tsx`: HTML 정규식 대신 역할·문구로 확인(Astryx 마크업이 바뀌어도 깨지지 않게). 바꾸는 화면과 같은 PR에서 — 완료(T104 PR). 태그를 걷어 낸 문구와, 역할 속성·여는 태그 뒤의 문구로 확인한다. DOM 라이브러리는 package.json을 바꿔 운영자 머지가 되므로 들이지 않았다.

---

## Phase 10: Polish & Cross-Cutting

- [x] T093 [P] `tests/worker/privacy-audit.test.ts`: Q14 — 전체 시나리오 실행 후 D1 모든 테이블 덤프에 이메일·전화번호·IPv4/IPv6 형식 문자열과 UUID 형식 기기 키가 없음(헌법 원칙 II) — 완료. 방 만들기 → 입장·채팅 → 방·메시지 신고(IPv4·IPv6) → 수정 → `online_count` alarm → 관리자 처리·삭제 뒤 모든 테이블(`rooms`, `reports`)을 검사한다. 이미 있는 동작을 확인하는 테스트라 빨간 단계는 없고, 대신 패턴마다 표본을 잡는지 같이 확인한다.
- [x] T094 [P] screens.md S6 — 404 "없는 방", 410 "삭제된 방" + 목록으로 — 완료. 화면은 T044·T104에서 `RoomPage`의 `Notice`로 이미 있어 `NotFound.tsx`는 만들지 않았다. E2E: 404는 `smoke.spec.ts`(문구·목록으로 버튼), 410은 `us7-report.spec.ts`, 서버 HTML 상태 코드는 `seo-html.test.ts`. 이미 있는 동작이라 빨간 단계는 없다.
- [x] T095 [P] `tests/e2e/a11y.spec.ts`: 2D 화면 핵심 행동(입장, 참가자 확인, 채팅, 신고)을 키보드만으로 완료(SC-007) — 완료. 대상마다 Tab으로 닿는지 확인한다. 데스크톱에서 신고를 보내면 포커스된 보내기 버튼이 결과 문구로 바뀌며 사라져 포커스가 `body`로 빠지고 Escape가 대화상자를 닫지 못했다(테스트가 고치기 전 커밋에서 실패). `ReportDialog`가 결과 문구(`role="status"`, `tabIndex=-1`)로 포커스를 옮긴다. 결과가 바뀔 때 한 번만 옮긴다(PR #42 리뷰: 콜백 ref는 방이 다시 그릴 때마다 포커스를 되가져왔다. 다른 참가자의 채팅 뒤에도 닫기 버튼에 포커스가 남는지 E2E로 본다). 모바일 에뮬레이션에서는 Tab으로 지나간 대화상자 닫기 버튼의 Astryx 툴팁이 열린 채 남을 때가 있어, 첫 Escape는 툴팁을 닫는다(맨 위 레이어부터, WCAG 1.4.13). 테스트는 툴팁이 있으면 한 번 더 누른다. 스크린 리더로 듣는 쪽은 자동화하지 않았다(역할·이름은 각 화면 테스트가 본다).
- [x] T096 [P] `tests/e2e/perf.spec.ts`: 모바일 프로젝트·4G 스로틀로 목록 → 방 입장 → 첫 이동까지 10초 이내(SC-001), 3D 첫 로딩 에셋 ≤ 5MB — 완료. 4G는 Chrome Fast 4G, 프로덕션 빌드를 `vite preview` + gzip 프록시로 잰다(판례 2026-11-09-perf-4g). 로컬 약 4.8초, 3D 에셋(models·hdri·characters) 약 1.8MB. 압축 없이 재면 8~9초였다. 데스크톱 프로젝트는 건너뛴다(SC-001은 휴대폰 기준).
- [x] T097 `.github/workflows/preview.yml`, `.github/workflows/preview-cleanup.yml`: research R3 — PR마다 D1 `roomboard-pr-<번호>` 생성·마이그레이션, `wrangler deploy --name roomboard-pr-<번호>`, 비밀값 주입, URL을 PR 댓글로; 닫히면 Worker·D1 삭제. `CLOUDFLARE_API_TOKEN`이 없으면 건너뜀 — 머지됨(#43), 첫 실행 성공(#45). 이 체크아웃의 `wrangler.jsonc`에서 Worker·D1 이름과 `database_id`를 PR 것으로 바꾼 뒤 빌드한다(Vite 플러그인이 이 파일로 배포 설정을 만들기 때문에 `--name`만으로는 D1이 바뀌지 않는다). 비밀값은 `wrangler deploy --secrets-file`로 넣는다. 비밀값은 Environment `preview`에 두고, 배포마다 운영자 승인(required reviewers)으로 막는다(워크플로 파일도 PR 것이 돌고, 수정 에이전트는 `claude/*` 브랜치에도 push할 수 있어 브랜치 이름만으로는 못 막는다. PR #43 리뷰, 헌법 VII). 이 저장소의 `claude/*` 브랜치가 아닌 PR(포크·`agent/`·사람 브랜치)은 job 조건으로 건너뛴다(운영자 승인 대기열에 쌓이지 않도록). 미리보기의 레이트 리밋 `namespace_id`는 운영과 섞이지 않게 +1000(`tests/scripts/preview-workflow.test.ts`). PR #43 머지 뒤 운영자가 Environment `preview`(required reviewers)와 Secrets 6개를 등록했다(2026-11-10). 첫 실행(PR #45, run 42832270194): 처음에는 배포 브랜치 규칙 `claude/*` 때문에 job이 러너 배정 전에 거절됐다. 규칙을 "No restriction"으로 바꾼 뒤(판례 2026-11-10-preview-no-branch-rule) 승인 → 배포 성공(job 약 70초). 확인한 것: `d1 list --json`의 `name`·`uuid`로 D1을 찾고 없으면 만든다, 원격 마이그레이션 확인 질문은 CI에서 자동으로 yes, 바인딩은 `roomboard-pr-45` D1·DO·레이트 리밋 4개·비밀값 3개, URL 댓글이 달린다. 운영자 휴대폰 확인: Turnstile 위젯 통과 후 방 만들기 성공, Q3(조이스틱)·Q8(채팅) 동작. 정리: PR #45를 닫은 뒤 run 42925740045(승인 후)에서 Worker·D1 `roomboard-pr-45` 삭제 성공(DO가 있는 Worker도 `wrangler delete`로 지워짐, Containers 권한 경고는 무시). Q1 두 기기 확인은 T099에 남긴다.
- [x] T098 `README.md`: 개발·테스트 명령(quickstart 링크), 필요한 Secrets 목록, 로컬 설치 금지 원칙 — 완료.
- [x] T099 quickstart.md Q1~Q15 전체를 클라우드 세션에서 실행해 결과를 PR에 기록 — 완료(PR #42 본문, Q1은 PR #52). 로컬 단위 407·E2E 66, #42 CI E2E 67 통과(SC-001 CI 4.7초). 미리보기(PR #45)에서 Q3·Q8 휴대폰 확인 완료. Q1 두 기기 확인: 2026-11-11 운영자가 미리보기(PR #52)에서 확인.
- [x] T107 버그: 이동할 때마다 화면 전체(머리글 포함)가 흰색으로 깜빡인다(운영자 휴대폰, Claude 모바일 앱 인앱 브라우저, 2026-11-11 보고). 클라우드 세션 Chromium(데스크톱·Pixel 7 에뮬레이션)에서 이동 중 화면 프레임 192장을 받아 밝기를 쟀는데 흰 프레임 없음(재현 안 됨). 다음: 같은 휴대폰의 일반 브라우저(Safari/Chrome)에서도 깜빡이는지, 2D 보기에서도 깜빡이는지 운영자 확인으로 원인 범위를 좁힌 뒤, 재현하는 테스트를 먼저 쓴다(헌법 III). 2026-11-11 운영자 확인(미리보기 PR #52): 같은 휴대폰의 일반 브라우저에서는 깜빡이지 않고, Claude 앱 인앱 브라우저에서만 깜빡인다. 2D 보기 결과는 아직 받지 못했다. 운영자 관찰: 앱 안에서는 조이스틱을 움직이면 화면이 끌리는 것 같다. 클라우드 측정(Pixel 7 에뮬레이션): ecctrl 조이스틱은 `touch-action: none`·`overscroll-behavior: none`이지만 터치를 pointer 이벤트로만 받아(`preventDefault`가 스크롤을 못 막음) CSS에만 기댄다. 3D 캔버스·`html`·`body`는 `touch-action: auto`, 바탕은 투명(흰색). 다음: 방 화면에서만 캔버스 `touch-action: none`, 조이스틱·캔버스에 비수동 `touchmove` `preventDefault`, 바탕을 하늘색으로. 마지막 확인은 운영자 휴대폰의 Claude 앱 안에서 한다. 운영자 추가 관찰: 인앱 브라우저는 앱의 바텀시트 위에 그려지고, 조이스틱을 움직이면 그 바텀시트가 끌린다. 페이지가 `touchmove`를 취소해도 앱이 시트 끌기를 먼저 가져가면 페이지 쪽에서는 막을 수 없다. 그 경우 알려진 한계로 스펙에 적는다. 수정(PR #53): 3D 방에서 조이스틱·점프 버튼·캔버스 위 `touchmove`를 비수동 리스너로 취소, 캔버스 `touch-action: none`, 페이지 바탕을 테마 하늘색으로. 2026-11-11 운영자가 미리보기(https://roomboard-pr-53.2eejehoon.workers.dev)를 Claude 앱 안에서 확인: 조이스틱·시점 끌기 모두 정상(시트 끌림·흰색 깜빡임 없음). 남은 약속(PR #53 리뷰 답글): 다음 코드 PR에서 `tests/e2e/us1-move.spec.ts`의 T107 테스트에 점프 버튼(`#ecctrl-virtual-button`) 끌기도 넣는다. 넣음(002 T036 (a) PR, 점프 버튼 취소를 빼면 실패함을 확인).
- [x] T108 `.github/workflows/deploy.yml`, `tests/scripts/deploy-workflow.test.ts`: research R3 운영 배포 — main에서 손으로 실행(`workflow_dispatch`), Environment `production`(운영자 승인, 배포 브랜치 `main`)의 Secrets로 Worker·D1 `roomboard`에 마이그레이션·빌드·`check:bundle`·배포, URL은 job 요약에. 레이트 리밋 namespace는 운영 값 그대로(1001~1004). 머지됨(#54). 첫 실행: run 43146966601은 `TURNSTILE_SITEKEY` 이름이 틀려 확인 단계에서 멈춤(마이그레이션·배포 전, 운영 영향 없음). 이름을 고친 뒤 run 43147701356 성공 — 원격 D1 `roomboard`(f582c867…)에 `0001_init.sql` 적용(빌드 뒤 재지정된 설정 `dist/roomboard/wrangler.json`에서 `migrations/`를 찾음), 바인딩 DO·D1·레이트 리밋 4개(3·5·10·5/60s)·비밀값 3개, URL https://roomboard.2eejehoon.workers.dev. 운영자 확인(2026-11-12): 휴대폰으로 운영 URL에서 방 만들기(Turnstile)·3D 방 모두 정상(판례 2026-11-12-roadmap-after-v1).

---

## Dependencies & Execution Order

- **Setup (T001~T010)** → **Foundational (T011~T034)** → 스토리.
- **US1** → **US2**(같은 `room-store`·`RoomPage`를 씀). US1+US2가 P1 MVP.
- **US3**: Foundational 후 US1과 독립(목록·생성은 소켓 불필요). US1 E2E는 시드 방(T014)을 쓰므로 US3을 기다리지 않는다.
- **US4**: US1 이후(`RoomSession`, `room-socket`).
- **US5**: US1 이후. 코드 변경은 작고 대부분 검증.
- **US6**: US3 이후(비밀번호·방 CRUD), DO RPC는 US1 이후.
- **US7**: US4 이후(메시지 서명), 관리자 방 삭제는 US6의 DO `roomDeleted` 재사용.
- **Polish**: 모든 스토리 후. T097은 사용자 Secrets 등록 후 언제든.

```text
Setup → Foundational ─┬─ US1 ─┬─ US2
                      │       ├─ US4 ─┐
                      │       └─ US5  ├─ US7
                      └─ US3 ── US6 ──┘
```

## Parallel Examples

- Foundational 테스트: T015~T022 동시 작성(서로 다른 파일), 이어서 T023~T028 동시 구현.
- US1 테스트: T035, T036, T037, T038 동시. 구현 중 T048(에셋)은 코드와 병렬.
- US3과 US1은 Foundational 뒤 서로 다른 사람·세션이 병렬 진행 가능.
- US7 테스트: T086, T087, T088 동시.

## Implementation Strategy

1. **MVP**: Setup → Foundational → US1 → US2. 시드 방에서 실시간 이동 + 2D 대체 화면 데모. 여기서 PR 하나.
2. **P2 증분**: US3(방 만들기) → US4(채팅) → US5(채널). 스토리마다 PR.
3. **P3 증분**: US6 → US7. 스토리마다 PR.
4. 각 PR: 테스트 먼저 커밋 → 실패 확인 → 구현 → `/ponytail:ponytail-review` → CI 통과 → 미리보기(가능하면) 휴대폰 확인.
