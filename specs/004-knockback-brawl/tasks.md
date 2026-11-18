# Tasks: 넉백 난투

**Input**: `specs/004-knockback-brawl/` (plan.md, spec.md, research.md R1~R12, data-model.md, contracts/websocket.md·openapi.yaml, quickstart.md)

**Tests**: 헌법 III(테스트 우선)에 따라 각 이야기의 테스트를 먼저 쓰고 실패를 확인한 뒤 구현한다. 실패 확인 결과(어떤 검사가 왜 실패했는지)를 각 항목 끝에 적는다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일, 끝나지 않은 작업에 기대지 않음 → 병렬 가능
- **[Story]**: US1(맨손으로 날려 떨어뜨림), US2(손맛), US3(블록 경기장), US4(떨어뜨리기 한 판), US5(방향 틀기·공중 복귀)

## 모든 작업에 걸리는 규칙

- 수치는 `TUNING`(`src/core/brawl/tuning.ts`) 한 곳, 보이는 모습은 `LOOKS`(`src/client/brawl/looks.ts`) 한 곳(FR-030·FR-030a, R7). core 함수는 `tuning`을 인자로 받는다
  (SC-005: 조정표 사본을 넘긴 테스트로 확인). spec 표·research R12의 초기값(경직 상한 0.3초 등)은 바꾸지 않는다. 조정 후보는 R11에 둔다.
- `src/core/brawl/**`는 순수 모듈(헌법 IV). 판정은 서버만(FR-031), 화면은 core 함수로 `launch`를 재생만 한다.
- 새 화면 문구는 `src/client/i18n/ko.ts` 키(FR-036). E2E용 상태 읽기는 `src/client/test-hooks.ts`의 개발 빌드 전용 훅으로만(헌법 IV).
- 특정 기존 게임의 이름·캐릭터·아트·맵·화면 느낌을 따르지 않고, 코드·문서·에셋 이름에 그런 게임 이름을 쓰지 않는다. 스펙에 없는 기능은 넣지 않는다.
- 새 데이터(피해 %·블록·판·흔들림 설정)는 개인정보가 아니다. 이런 필드를 더하는 PR 본문에 "개인정보 아님"을 적는다(헌법 II).
- 방 DO의 alarm은 하나다(001 R6). 난투 사건(벽·착지·넉아웃 시각), 재시작, 판 제한 시간, 블록 쓰기(2초), 정리(10분)는 모두 `onAlarm`의 다음 시각 계산 하나에
  들어가고 `schedule()`은 가장 이른 시각을 지킨다. 기존 join 마감·`online_count` 테스트(`tests/worker/room-do.test.ts`·`online-count.test.ts`)가 계속 통과해야 한다.

---

## Phase 1: Setup — 조정표 린트 (운영자 머지, 따로 PR)

- [X] T001 `eslint.config.js`: `files: ['src/core/brawl/**']`, `ignores: ['src/core/brawl/tuning.ts']` 블록에 숫자 상수 금지 규칙(R7, SC-005, 헌법 VI). 허용은 0·1·2와 `-1`
  (`-1`은 `1`에 단항 `-`라 따로 허용할 것 없음). 고치는 방법을 알려 주는 문구가 필요하므로 `no-magic-numbers`(문구 지정 불가) 대신 `no-restricted-syntax`의 숫자
  `Literal` 선택자 + `message: "수치는 TUNING(src/core/brawl/tuning.ts)에 항목으로 두고 tuning.<키>로 읽으세요(FR-030, research R7)."`로 한다. 허용 목록은 넓히지 않는다.
  - 실패 확인(헌법 VI): 아직 `src/core/brawl` 코드가 없으므로 수치가 박힌 실제 커밋 코드 `tests/bench/brawl-load/worker.js`를 임시로 `src/core/brawl/probe.js`로 복사해
    `npx eslint src/core/brawl`을 돌린다. probe는 `cloudflare:workers`를 import해 기존 `no-restricted-imports`에도 걸리므로 "lint 실패"만으로는 확인이 아니다.
    새 `no-restricted-syntax` 문구(TUNING 안내)의 오류 수와 import 규칙 오류 수를 나눠 기록하고 지운다. `src/core/brawl/` 밖 파일은 이 규칙에 걸리지 않는 것도 확인한다.
  - 확인 결과(2026-11-18): `src/core/brawl/probe.js`에서 TUNING 문구 53개, `no-restricted-imports` 1개(`cloudflare:workers`). 같은 파일을 `src/core/probe.js`에 두면
    TUNING 문구 0개(import 1개만). 경계: `0, 1, 2, -1`과 문자열·템플릿 `"3"`·`` `4` ``는 통과, `3, 0.5, .5, 1e3, 10`은 오류. 지운 뒤 `npx eslint .` 통과.
  - `eslint.config.js`는 허용 경로 밖이므로 이 작업만 한 PR로 내고 운영자에게 머지를 요청한다(같은 PR에 `src/`를 섞지 않는다). 머지 뒤 main CI의 lint가 통과하는지 확인해 여기에 적는다.
  - 머지 확인(2026-11-19): #82 squash 머지(370872e) 뒤 main CI 실행 44430605261의 `npm run lint` 통과(typecheck·unit·build·check:bundle도 통과).

---

## Phase 2: Foundational (모든 이야기의 전제)

**린트 때문에 tuning.ts로 가야 하는 수치**: 초당 ms(1000), 궤적 간격(`stepMs` = 1000/60), 각도 → 라디안(180), 반올림 자리(점 2·속도 3), 잽 단계 수(3),
경기장 크기(24×12×24), 피해 상한(999). 이 중 data-model "조정표"에 없는 키(`damageMax`, `precision.{p, v}`, `arena.size`, 단위 환산)는 같은 PR에서 data-model 표에 먼저 더한다(스펙 먼저).

### Tests (먼저 작성, 실패 확인)

- [X] T002 [P] `tests/core/protocol.test.ts`: 예시 수집을 문서 경로를 받는 함수로 바꾸고 001과 004 `contracts/websocket.md`를 모두 검사한다(004도 `## 클라이언트 → 서버`·`## 서버 → 클라이언트` 아래 `###` 절이라 같은 파서로 된다).
  004 클라이언트 예시 `t` = `move, hold, skill, guard, roll, air, block, match_start`, 서버 예시 = `welcome, swing, launch, landed, knocked_out, respawned, block, arena_reset, match`가 모두 파싱되고,
  서버 메시지 종류마다 001 또는 004에 예시가 있다. 경계 검사: `skill.nonce` 32자 초과 거부, `move.d` 길이 > 1 거부, `block.h`는 `-1 | 0 | 1`만, `block.kind`는 `place`일 때만(`dirt | stone`),
  2KB 넘는 메시지 거부(기존 `MAX_MESSAGE_BYTES`), `join.v`가 1이면 `unsupported_version`. 지금 코드에서 실패 확인.
  - 실패 확인: 001 welcome 예시(v2로 고침)가 `v: literal(1)`에 걸림, 004 예시 `hold` 등 모든 새 `t`가 스키마에 없음, `move.d` 길이 검사 없음(zod가 `d`를 버려 통과). `block` 거부 경우는 `t`가 없어서 통과했으므로 구현 뒤 다시 본다.
- [X] T003 [P] `specs/001-realtime-room-board/contracts/websocket.md`: `join`(`"v": 1`)과 `welcome`(`"v": 1`) 예시를 `"v": 2`로, welcome 예시에 v2 필수 필드
  `"arena": { "blocks": [], "fighters": [], "match": null }`와 `"at"`을 더하고 "v2 추가 필드는 004 websocket.md" 한 줄로 링크한다(001 예시가 v2 스키마에서도 통과하도록).
- [X] T004 [P] `tests/core/brawl/tuning.test.ts`: `TUNING`의 키가 data-model "조정표"의 키 열과 하나씩 대응하고 값이 초기값과 같다(spec 기술 표, 강펀치 `damage` `[12, 22]`,
  `hitstunMaxMs` 300, `skills.jab1.cooldownMs` 350 등 R12). 잽 다시 쓰기 시간 + `hitstop.minMs` > `hitstunMaxMs`(FR-012, US1-7)를 검사한다. 지금은 파일이 없어 실패.
- [X] T005 [P] `tests/core/brawl/arena.test.ts`: 기본 경기장(`size` 24×12×24, 돌 한 겹 바닥, FR-016), 칸 ↔ 월드 좌표(`origin + cell × block.size`), 차이 적용(`changed`의 null = 부서진 기본 블록),
  `inArena(p)`/평화 구역(R5), `starts`·`exit`, 테마마다 `arenaEntrance`가 테마 범위 안이고 경기장 `bounds`가 모든 테마 범위와 겹치지 않음, `koY` = 바닥 − `koDepth`. 실패 확인.
  - 실패 확인: `src/core/brawl/arena.ts`·`tuning.ts`가 없어 모듈을 찾지 못함(T004·T005 모두).
- [X] T006 [P] `tests/core/movement.test.ts`·`tests/core/room-session.test.ts`에 더함: 이동 검사가 테마 범위 또는 경기장 범위 안이면 통과하고 두 영역 사이의 걷기 이동은 거부,
  입구 칸에 들어선 `move` → 나에게 `correction`(경기장 시작 지점), 남에게 `peer_moved`, 출구 칸 → 방 시작 지점(R5). 날아가는 중·경직 중의 출구 칸은 동작하지 않음(FR-014). 실패 확인.
  - 실패 확인: `validateMove`가 영역 목록을 받지 않아 `TypeError`, room-session은 `arena.ts`가 없어 실패. 날아가는 중·경직 중의 출구 칸은 궤적·경직이 생기는 US1에서 확인한다(T015로 옮김).

### Implementation

- [X] T007 `src/core/brawl/tuning.ts`: `TUNING` 상수(`as const`)와 `Tuning` 타입. data-model 표의 모든 키 + 위 린트 대상 키. T004 통과.
- [X] T008 `src/core/protocol.ts`: `PROTOCOL_VERSION = 2`, 004 websocket.md의 클라이언트·서버 메시지 스키마(제약을 그대로: `nonce` ≤ 32자, `d` 길이 ≤ 1, `h` ∈ `-1 | 0 | 1`,
  `launch.p` 소수 2자리·`v`·`s` 3자리, `rate_limited.scope`에 `block`), welcome의 `arena`·`at`. T002·T003 통과. 클라이언트(`src/client/net/`)는 상수를 쓰므로 그대로 v2를 보낸다.
- [X] T009 `src/core/brawl/arena.ts`·`src/core/themes.ts`(`arenaEntrance`)·`src/core/movement.ts`·`src/core/room-session.ts`: 경기장 상수·칸 도우미·평화 구역, 두 영역 이동 검사, 입구·출구 순간이동. T005·T006 통과.
- [X] T010 `src/core/brawl/brawl-session.ts` 뼈대: 채널 하나의 블록 차이(`changed`), `nextEventAt()`, `runEvents()`, welcome용 `view()`(차이·경기장 사람·판 null).
  `room-session.ts`가 채널마다 `BrawlSession`을 갖는다(난투 메시지는 아직 무시). `src/worker/room-do.ts` `onAlarm`이 `runEvents` 결과를 보내고 `nextEventAt()`을 다음 시각 계산에 넣으며,
  D1 `online_count`는 값이 바뀔 때만 쓴다. welcome에 `arena`·`at`을 넣는다. 기존 worker·core 테스트 전부 통과.
  `handle(me, msg, members, now)`, 참가자 상태(`Fighter`, 참가자 attachment에), `runEvents(now)`는 T021에서 더한다(PR #83 리뷰).
  - 결과: `nextEventAt()`은 아직 null. `handle`은 처음 쓰는 T021에서 더한다(쓰지 않는 인자 린트). online_count 규칙은 `online-count.test.ts`의 "같은 값이면 쓰지 않음" 테스트가 지킨다(PR #83 리뷰, 매번 쓰는 코드에서 실패 확인: 99 대신 2).
    `npx vitest run` 614개 통과(`room-do`·`online-count` 포함), `npm run typecheck`·`npx eslint .` 통과.
- [ ] T011 (US1 화면 PR (4)로 옮김: 재생할 `stepFlight`가 T019에서 생긴다) `src/client/brawl/store.ts`(+ `tests/client/brawl-store.test.ts` 먼저): 서버 시계 어림 = 받은 시각 − `at`의 최솟값(R3), `launch`를 core `stepFlight`로 재생해 지금 위치를 내고,
  늦게 받은 궤적은 지금 위치로 짧게 보간(Edge Cases). `src/client/test-hooks.ts`에 난투 상태 읽기(피해 %, 위치, 블록 차이, 판)를 더한다(개발 빌드 전용).

**Checkpoint**: 기존 E2E(us1~us7·a11y·perf) 통과, v1 클라이언트는 4002를 받는다.

**배포 금지(PR #83 리뷰)**: Phase 2가 머지되면 서버의 입구 칸이 동작하지만 3D 경기장 바닥은 T024에서 생긴다. T024·T026이 머지될 때까지 main을 배포하지 않는다
(배포는 수동 `deploy.yml`). 급한 수정을 배포해야 하면 그 전에 US1 화면 PR을 먼저 머지하거나 입구 칸을 테마 범위 밖으로 옮기는 임시 PR을 낸다.

---

## Phase 3: User Story 1 — 맨손으로 서로를 날려 떨어뜨린다 (P1) 🎯 MVP

**Goal**: 경기장에서 잽·강펀치·던지기·방어·구르기로 % 쌓기와 넉백, 낙하 넉아웃, 3초 재시작, 평화 구역. 3D·2D 모두.

**Independent Test**: `npx vitest run tests/core/brawl tests/worker/brawl` 통과, `npx playwright test tests/e2e/us1-brawl.spec.ts`(브라우저 2개, 2D 하나 포함).

### Tests (먼저 작성, 실패 확인)

- [X] T012 [P] [US1] `tests/core/brawl/knockback.test.ts`(SC-004): FR-002 넉백 세기, FR-010 방어 순서(피해 × 0.2 → 누적 → 세기 → × 0.2; 0%에서 잽 1.3 → 0.212, US1-5), 피해 상한 999,
  경직 = max(타격 정지, min(300, s × 40))(잽 1타 52ms, 상한 300ms), 타격 정지(최소 30, 최대 150, 4ms/세기, 마무리 = 잽 3타·끝까지 모은 강펀치·세기 ≥ 30이면 150), R11 값 20.4·32.4·126,
  강펀치 피해가 모은 시간에 비례(0ms 12%, 1000ms 이상 22%), 각도 → 속도 벡터를 `precision`대로 반올림. `TUNING` 사본의 값 하나를 바꾸면 결과가 따라 바뀜(SC-005).
  - 실패 확인: `knockback.ts`가 없어 모듈을 찾지 못함. 몸무게 기준 100은 `weightBase`로 조정표에 더함(린트, data-model 먼저). tuning.test는 새 키로 실패.
- [X] T013 [P] [US1] `tests/core/brawl/flight.test.ts`(SC-003·SC-004, R3): 같은 `launch`·블록으로 `stepFlight`를 두 번 돌려 모든 점이 같음, 1/60초 고정 간격·중력 20, 3D DDA로 한 간격에
  1칸 넘게 움직여도 블록을 건너뛰지 않음(s ≥ 100), 윗면에 내려앉으면 `land`(미끄러지지 않음), 땅에서 0°로 시작한 궤적만 `groundFriction`으로 미끄러짐(0% 잽 약 5cm, 100% 약 3.8m, R12) 후 `land`,
  가장자리에서 떨어지기 시작, `koY` 아래면 `ko`. 벽 규칙(튕김·뚫림·낙법)은 US3(T034).
  - 실패 확인: `flight.ts`가 없어 모듈을 찾지 못함. 벽(옆면·아랫면)은 US1에서 `wall` 끝으로 멈추기만 하고 튕김·뚫림·낙법은 T034·T039.
- [X] T014 [P] [US1] `tests/core/brawl/fighter.test.ts`(FR-007·008·009·010·011·012·034): 잽 단계(앞 잽 다시 쓰기 끝부터 0.4초 안이면 다음 타, 늦으면 1타), 다시 쓰기 시간 =
  타격 시각 + 때린 사람 타격 정지(맞은 사람 중 최댓값, 헛스윙 0) + 기술별 시간, 그 전 `skill` 무시, 강펀치 모은 시간 = `hold` 수신 → `skill` 수신(최대 1000ms, R9), 닿는 거리 + `reachSlack`,
  정면 120° 방어, 던지기는 방어 무시·방향은 마지막 `d`, 구르기 기력 15·무적 300ms·기력 모자라면 무시, 기력 회복 초당 10(값과 시각만 저장), 경직 중 기술·방어·구르기 거부(방어 누름은 기록),
  경직이 풀리면 날아가는 중에도 기술·구르기 허용(궤적 중 구르기는 무적만, R2), 평화 구역에서는 공격도 피격도 없음(FR-013).
  - 실패 확인: `fighter.ts`가 없어 모듈을 찾지 못함. 닿는 사람은 보는 방향 앞쪽 반, 다시 쓰기 시간은 기술 셋이 함께 씀(data-model에 먼저 적음).
- [X] T015 [P] [US1] `tests/core/brawl/brawl-session.test.ts`: 가짜 시계로 잽 → `swing`(때린 사람에게만 `nonce`, `hitstopMs`·`readyAt`, `hits[].launch.t` = 타격 시각 + 타격 정지), 날아가는 중
  `move.p` 무시·`d`만 받음(R4), 타격 판정은 궤적의 지금 위치로, `nextEventAt()`이 착지·넉아웃 시각, `runEvents` → `landed`/`knocked_out`(`respawnAt` = +3000, 판 밖이면 `stocks: null`) →
  3초 뒤 `respawned`(피해 0%, 시작 지점), 걸어서 떨어짐은 보낸 높이로 넉아웃(R4 shortcut), US1-7 반격 틈(100%에서 잽 연타 사이에 경직이 0.08초 이상 먼저 풀림).
  - 실패 확인: 11개 중 9개 실패(`swing`이 오지 않음, 날아가는 중 `move`가 그대로 중계됨, `nextEventAt` 없음). 평화 구역 무시·쿨다운 무시처럼 "보내지 않음"을 보는 2개는 지금도 통과.
    날아가는 중의 출구 칸(T006에서 옮김)은 `move.p`를 무시하는 검사로 본다.
- [ ] T016 [P] [US1] `tests/worker/brawl.test.ts`(quickstart 2): 가짜 소켓 2~3개로 평화 구역에서 맞지 않음, 다시 쓰기·닿는 거리 밖 요청은 조용히 무시(FR-034), 다른 채널에 아무것도 가지 않음(FR-018),
  alarm이 착지·넉아웃·재시작을 메시지 없이 제때 보냄, 피해·기력이 attachment에 있어 DO를 다시 만들어도 남음(R6). 실패 확인.
  - 실패 확인: 3개 중 1개 실패. 맞은 사람의 attachment를 쓰지 않아 DO를 다시 만들면 b의 피해 3%가 사라짐. 평화 구역·쿨다운 무시·alarm 착지는 PR 3 코드로 이미 통과.
    다른 채널(FR-018)은 core `members(channel)`로 나뉘어 worker에서 21명을 띄우지 않는다.
- [ ] T017 [P] [US1] `tests/e2e/us1-brawl.spec.ts`(브라우저 2개, US1 시나리오 1·3·4): 둘이 입구로 경기장에 들어가 잽 → 상대 % 3, 반복해 넉아웃 → 3초 뒤 0%로 다시 섬(테스트 훅으로 읽음),
  평화 구역에서 기술 버튼이 막힘, 한쪽이 2D 화면(옆 그림·버튼·글 기록)이어도 같다(FR-033). 실패 확인.

### Implementation

- [X] T018 [P] [US1] `src/core/brawl/knockback.ts`: 피해·세기·경직·타격 정지·방어·`launchVector(angleDeg, facing, s, tuning)`(서버만 sin/cos, 반올림, R3). T012 통과.
  - 결과: T012 통과. 방향 틀기는 US5(T052). 넉백 세기는 반올림하지 않고 `launch.s`로 보낼 때 3자리로 반올림한다.
- [X] T019 [P] [US1] `src/core/brawl/flight.ts`: `Launch`·`FlightEnd`(data-model), `stepFlight(launch, grid, tuning)`(덧셈·곱셈만, 3D DDA, 미끄러짐, 착지, 넉아웃). T013 통과.
  - 결과: T013 통과. 함수 이름은 `simulate`(점 목록과 끝)와 `positionAt`. 미끄럼 거리는 v²/(2×6)과 한 간격 이동 이내로 같다.
- [X] T020 [US1] `src/core/brawl/fighter.ts`: `Fighter`(data-model 필드 그대로: `damage` 0~999(메시지에만 정수), `stamina` 0~max + `staminaAt`, `stunUntil`, `invulnUntil`, `cooldownUntil`, `jabStep`·`jabAt`,
  `holdAt`, `guarding`·`guardPressedAt`, `inputDir`, `airJumps`·`airRecovers`, `flight`, `knockedOutAt`) 허용 검사와 상태 전이. T014 통과.
- [X] T021 [US1] `src/core/brawl/brawl-session.ts`: `handle(me, msg, members, now) → Outbox`, `runEvents(now)`(지난 사건 따라잡기, R2), `room-session.ts`가 난투 메시지를 넘김, `hold`·`skill`·`guard`·`roll`·`move.d` 처리, 판정 → `swing`, 사건 목록(착지·넉아웃·재시작), welcome의 `fighters`. T015 통과.
  - 결과: T015 통과. `RoomSession.receive`가 메시지마다 지난 사건을 먼저 보내고, `move`는 날아가는 중·경직 중·넉아웃 중에 `d`만 받는다. 입구로 들어가면 `fighter`가 생기고 출구로 나가면 없어진다.
    맞은 사람의 attachment 쓰기와 alarm 사건의 attachment 갱신은 T022(PR 4). `npx vitest run` 651개, typecheck·lint 통과.
- [ ] T022 [US1] `src/worker/room-do.ts`: `Fighter`를 attachment에 쓰기(보낸 사람·맞은 사람), alarm 사건 처리. T016 통과.
- [ ] T023 [P] [US1] `src/client/brawl/input.ts`: PC 키(잽·강펀치 누름/뗌·던지기·방어·구르기)와 `move.d`, 다시 쓰기 시간 중 누른 잽을 들고 있다가 어림한 서버 시계로 `readyAt`이 지난 뒤
  보냄(R2), 경직으로 거부되면 버림. 때린 사람 화면은 서버를 기다리지 않고 이펙트를 먼저 보여 주고 `nonce`로 `swing`과 맞춰 보정(FR-032).
- [ ] T024 [US1] `src/client/room/room3d/`: 경기장 섬(기본 블록, instanced mesh + Rapier 고정 콜라이더), 입구·출구·경계 표시(FR-014, 색은 `LOOKS.arena`), 날아가는 아바타를 store 궤적으로 그림,
  머리 위 % 숫자, `TouchControls.tsx`에 기술·방어·구르기 버튼(44×44px 이상, FR-035).
- [ ] T025 [US1] `src/client/brawl/looks.ts`: `LOOKS`의 `blocks`·`arena` 항목(US2가 나머지를 채움). 화면 코드는 색·모델 경로를 `LOOKS`로만 읽는다.
- [ ] T026 [US1] `src/client/room/room2d/Room2D.tsx`(+ 새 컴포넌트 파일): 옆 그림 SVG(블록 칸, 참가자 점, 궤적 선, 내 깊이 줄은 진하게·다른 줄은 흐리게 + 깊이 차이 숫자),
  앞·뒤 깊이 줄 버튼, 보는 방향 좌·우·앞·뒤(`r` = 0, ±π/2, π), 기술·방어·구르기 버튼, `aria-live` 글 기록(누가 누구를 쳤는지, %, 넉아웃)(FR-033, R8). 문구는 i18n. T017 통과, a11y.spec 통과.

**Checkpoint**: US1만으로 놀이가 된다. 이 단계에서 미리보기를 띄워 운영자가 휴대폰으로 볼 수 있다.

---

## Phase 4: User Story 2 — 때리는 손맛이 느껴진다 (P1)

**Goal**: 타격 정지, 꼬리, % 숫자 색, 화면 흔들림(끌 수 있음), 효과음. 판정은 바뀌지 않는다(FR-024). US1의 `swing`·`launch`에 기댄다.

**Independent Test**: `npx vitest run tests/core/brawl/feel.test.ts tests/client/shake.test.ts`, `npx playwright test tests/e2e/us2-brawl-feel.spec.ts`, 운영자가 미리보기로 판정(quickstart 5).

### Tests (먼저 작성, 실패 확인)

- [ ] T027 [P] [US2] `tests/core/brawl/feel.test.ts`: `damageColor(damage, tuning)` → 0~49 white, 50~99 yellow, 100~ red(FR-022, 기준은 `TUNING.damageColor`),
  타격 정지 구간에 때린 사람·맞은 사람이 멈춤(US2-1 약 0.03초, US2-2 마무리 0.15초를 `swing.hitstopMs`로 확인).
- [ ] T028 [P] [US2] `tests/client/shake.test.ts`: 흔들림 설정은 localStorage `roomboard.shake = "off"`로 기기에 남고, 꺼져 있으면 강한 타격에도 흔들지 않음(타격 정지·꼬리는 남음, US2-5). 접근이 막힌 localStorage에서도 오류 없음.
- [ ] T029 [P] [US2] `tests/e2e/us2-brawl-feel.spec.ts`(브라우저 2개): 잽을 맞힌 뒤 테스트 훅으로 두 화면의 타격 정지 시간·꼬리 표시 여부·숫자 색이 같음(FR-024), 흔들림 끄기 버튼 뒤 새로고침해도 꺼져 있음.

### Implementation

- [ ] T030 [US2] `src/core/brawl/feel.ts`(`damageColor`) + `src/client/brawl/looks.ts`의 `trail`·`damageText`·`shake`·`sfx`. T027 통과.
- [ ] T031 [US2] `src/client/room/room3d/`: 타격 정지 동안 두 아바타 멈춤, 꼬리(`LOOKS.trail`), 숫자 색, 화면 흔들림(설정 존중), 효과음. 2D는 글 기록과 숫자 색으로 같은 정보(FR-033). T028·T029 통과.
- [ ] T032 [P] [US2] 효과음·그림이 필요하면 CC0만 `public/assets/`에 두고 `public/assets/CREDITS.md`·`scripts/assets.sha256`에 출처를 적는다(FR-038, 판례 2026-11-07-assets-quaternius).
  `scripts/`를 바꾸면 운영자 머지다. 첫 3D 에셋 상한 3MB(perf.spec)와 `check:bundle`을 넘지 않는다. 필요 없으면 이 항목에 "에셋 없음"이라 적고 닫는다.

---

## Phase 5: User Story 3 — 블록으로 경기장을 짓고 부순다 (P2)

**Goal**: 흙·돌 블록 놓기·부수기, 벽 충돌(튕김·추가 피해·뚫림·낙법), 지은 경기장을 채널이 빌 때까지 DO 저장소에 두기, 관리자 되돌리기.

**Independent Test**: `npx vitest run tests/core/brawl tests/worker/brawl-arena.test.ts tests/worker/admin.test.ts`, `npx playwright test tests/e2e/us3-brawl-blocks.spec.ts`.

### Tests (먼저 작성, 실패 확인)

- [ ] T033 [P] [US3] `tests/core/brawl/arena.test.ts`에 더함(FR-015·015a·017): `targetCell(pose, h)` = `r`를 네 방향으로 반올림한 바로 앞 칸, `h` ∈ `-1 | 0 | 1`(앞쪽 아래·발·눈 높이),
  내 몸 칸·내 바로 아래 칸은 대상 아님, 놓기는 경기장 안·시작 지점과 출구 아님·빈 칸(블록도 참가자 몸도 없음)만, 부수기는 블록이 있는 칸만, 한 번에 `hp − 1`(흙 1, 돌 4, 0이면 없어짐), 기본 돌 블록도 부서짐(FR-016).
- [ ] T034 [P] [US3] `tests/core/brawl/flight.test.ts`에 더함(FR-019, US3 시나리오 3~5): 옆면·아랫면 충돌만 벽, 반사 방향 × `s × 0.5`로 튕김 + 추가 피해 `s × 0.5`%, 흙 3·돌 10 이상이면 블록이 부서지고
  그대로 날아감, 충돌 전 200ms 안의 방어 누름이면 낙법(추가 피해 없이 멈추고 경직 끝), 뚫림 기준 이상이면 낙법보다 뚫림이 먼저, 세기는 궤적의 시작 세기. R11 (a): 0% 강펀치 20.4는 돌 벽을 뚫는다.
- [ ] T035 [P] [US3] `tests/worker/brawl-arena.test.ts`(R6, R9): `block` 요청 → 같은 채널 전원에게 `block`, 초당 4개를 넘으면 `rate_limited {scope: "block"}`, 블록 차이를 2초에 한 번 `arena:<채널>`에 씀,
  DO를 다시 만들어도(잠들었다 깸) 지은 블록이 남음, 채널의 마지막 사람이 나가면 키 삭제, 깨어날 때 사람 없는 채널의 키 삭제,
  **close 이벤트 없이 소켓이 사라진 경우**(`webSocketClose`를 부르지 않고 DO를 다시 만들어 소켓 0개): `arena:*` 키가 있는 동안 정리 alarm(`now + 10분`, 쓸 때마다 다시 검)이 있고,
  그 alarm이 소켓 없는 채널의 키를 지우고 남은 키가 없으면 다시 걸지 않음. 날아가는 경로의 블록이 바뀌면 그 시각부터 다시 계산한 `launch`(`cause: "block"`). 실패 확인.
- [ ] T036 [P] [US3] `tests/worker/admin.test.ts`에 더함(FR-040, contracts/openapi.yaml): `POST /api/admin/rooms/{roomId}/arena-reset` 토큰 없음·틀림 401, 없는 방 404, 삭제된 방 410,
  토큰 실패 횟수 제한 429(001과 같음), 성공 204(사람 없어도 204) → 모든 채널의 `arena:*` 삭제, 경기장 사람에게 `arena_reset` 뒤 `respawned`(시작 지점, 피해 0%), 평화 구역 사람은 그대로, 신고 상태는 그대로.
- [ ] T037 [P] [US3] `tests/e2e/us3-brawl-blocks.spec.ts`(브라우저 2개, US3-1·2): 한쪽이 흙 블록을 놓으면 다른 쪽 같은 칸에 보이고, 2D 화면 버튼(놓기·부수기·종류·높이)으로 놓아도 같다,
  흙은 한 번·돌은 네 번 쳐서 부서짐. `tests/e2e/us7-admin-states.spec.ts` 또는 새 파일: 관리자 화면에서 신고된 방의 "경기장 되돌리기" → 다른 브라우저의 지은 블록이 사라짐. 실패 확인.

### Implementation

- [ ] T038 [US3] `src/core/brawl/arena.ts`: `targetCell`, 놓기·부수기 허용, 차이 적용. T033 통과.
- [ ] T039 [US3] `src/core/brawl/flight.ts`: 벽 충돌(튕김·뚫림·낙법)을 `FlightEnd` `wall`로, 세션이 새 `launch {cause: "wall"}`·`landed {end: "tech"}`를 낸다. T034 통과.
- [ ] T040 [US3] `src/core/brawl/brawl-session.ts`: `block` 처리(경기장 안에 있는 사람만, FR-034), `BLOCK_RATE`(초당 4개) 토큰 버킷(`src/core/rate-bucket.ts`의 `RateRule`로), 경로 블록 변경 시 다시 계산.
- [ ] T041 [US3] `src/worker/room-do.ts`: `arena:<채널>` 2초 묶어 쓰기, 비면 삭제, 깨어날 때 정리, 10분 정리 alarm(모두 alarm 하나로), `resetArenas()` RPC(R10). T035 통과.
- [ ] T042 [US3] `src/worker/admin.ts`·`src/worker/index.ts`: `app.post('/admin/rooms/:roomId/arena-reset', ...)`(기존 `adminAuth`와 `adminDeleteRoom`의 방 조회·410 처리를 그대로), DO `resetArenas()` 호출. T036 통과.
- [ ] T043 [US3] `src/client/`: 블록 그리기(`LOOKS.blocks`, instanced mesh + 걷기용 콜라이더 갱신), PC 키·휴대폰 버튼(놓기·부수기·종류·높이 `-1|0|1`, 44px), 2D 옆 그림의 블록 칸과 같은 버튼,
  `src/client/admin/AdminPage.tsx` 신고된 방 줄에 "경기장 되돌리기" 버튼(확인 뒤 호출, 문구 i18n). T037 통과.

---

## Phase 6: User Story 4 — "떨어뜨리기" 한 판을 한다 (P2)

**Goal**: 경기장의 2명 이상이 판을 시작해 목숨 3개, 탈락, 제한 시간 5분, 같은 순위 결과를 모든 화면에 보인다. US1의 넉아웃에 기댄다.

**Independent Test**: `npx vitest run tests/core/brawl/match.test.ts tests/worker/brawl-match.test.ts`, `npx playwright test tests/e2e/us4-brawl-match.spec.ts`(브라우저 3개).

### Tests (먼저 작성, 실패 확인)

- [ ] T044 [P] [US4] `tests/core/brawl/match.test.ts`(FR-025~027): 시작은 경기장에 2명 이상·요청자가 경기장에 있고 판이 없을 때만, 그 순간 경기장 사람이 players(피해 0%), 넉아웃마다 `stocks − 1`,
  0이면 탈락(`out` 순서 번호, 같은 서버 판정의 동시 탈락은 같은 번호), 출구로 나감·연결 끊김 = 탈락, 진행 중 비참가자 입구 차단, 남은 사람 ≤ 1이면 끝, `endsAt`(5분)이면 목숨 많은 순 → 피해 낮은 순 → 같은 순위,
  탈락자는 그 아래 `out` 역순, 모두 함께 탈락하면 공동 1위, 끝나면 피해 0%.
- [ ] T045 [P] [US4] `tests/worker/brawl-match.test.ts`: 판 시작·탈락·끝을 `arena:<채널>`의 `match`에 바로 씀, DO를 다시 만들어도 판이 이어짐, 제한 시간 alarm으로 끝남, 결과를 보낸 뒤 `match` 삭제(FR-027),
  관리자 되돌리기 중 판이 있으면 `match {state: "cancelled"}`가 `arena_reset`보다 먼저(T036의 판 부분). 실패 확인.
- [ ] T046 [P] [US4] `tests/e2e/us4-brawl-match.spec.ts`(브라우저 3개, US4-1·2): 판 시작 → 세 화면에 같은 시작 신호, 넉아웃을 만들어 끝까지 → 세 화면에 같은 순위, 피해 0%. 평화 구역에서는 시작 버튼이 막힘. 실패 확인.

### Implementation

- [ ] T047 [US4] `src/core/brawl/match.ts`: `Match`(data-model)와 시작·탈락·순위. T044 통과.
- [ ] T048 [US4] `src/core/brawl/brawl-session.ts`·`src/worker/room-do.ts`: `match_start`, 넉아웃의 `stocks`·`out`, 제한 시간 사건, 저장·삭제, `resetArenas()`의 cancelled. T045 통과.
- [ ] T049 [US4] `src/client/`: 판 시작 버튼(경기장에서만), 남은 목숨·남은 시간, 결과 순위 화면(3D·2D, 글 기록에도), 문구 i18n. T046 통과.

---

## Phase 7: User Story 5 — 날아가는 중에 버티고 돌아온다 (P3)

**Goal**: 방향 틀기(최대 15°, 날아가기 시작할 때 한 번), 공중 점프·복귀기 각 1번.

**Independent Test**: `npx vitest run tests/core/brawl/steer.test.ts`, `npx playwright test tests/e2e/us5-brawl-air.spec.ts`.

### Tests (먼저 작성, 실패 확인)

- [ ] T050 [P] [US5] `tests/core/brawl/steer.test.ts`(FR-028·029, US5-1·2): 판정 순간의 마지막 `d`로 궤도가 최대 15° 꺾임(방향 틀기 없이/있이 각도 차이 ≤ 15°), 땅에서 0°로 시작한 궤적은 수평으로만 꺾임(R3),
  날아가는 도중 `d`가 바뀌어도 궤적 그대로, 공중 점프(위로 8 m/s)·복귀기(위로 12 m/s)는 각각 땅에 닿기 전 한 번만이고 새 `launch {cause: "air" | "recover"}`, 착지하면 다시 참, 경직 중 거부.
- [ ] T051 [P] [US5] `tests/e2e/us5-brawl-air.spec.ts`(브라우저 2개): 맞고 날아가는 중 점프를 두 번 누르면 상대 화면에서도 한 번만 뜀(테스트 훅으로 `launch` 수). 실패 확인.

### Implementation

- [ ] T052 [US5] `src/core/brawl/knockback.ts`(방향 틀기)·`fighter.ts`·`brawl-session.ts`(`air`). T050 통과.
- [ ] T053 [US5] `src/client/brawl/input.ts`·`TouchControls.tsx`·2D 버튼: 공중 점프·복귀기 입력(44px). T051 통과.

---

## Phase 8: Polish — 측정과 확인

- [ ] T054 `tests/bench/brawl-load/real.mjs`: 실제 서버 프로토콜(v2 `join`, 기기 키마다 랜덤 UUID, 입구 칸으로 경기장 입장)로 R1과 같은 시나리오(모임·`SPREAD=1` 흩어짐, `move` 초당 10, 기술 초당 3, 처음 3초 버림)를
  재는 가짜 클라이언트 N명. 인자: 기준 URL·방 id·N·초. 방은 로컬에서는 `tests/e2e/helpers.ts` `createRoom`처럼 Turnstile 테스트 토큰으로 만들고, 미리보기에서는 운영자가 브라우저로 만든 방 id를 받는다
  (미리보기는 실제 Turnstile 비밀 키). WebSocket 입장에는 엣지 요청 제한이 없지만(`wrangler.jsonc` `ratelimits`는 방 만들기·비밀번호·신고만) 입장은 100ms 간격으로 나눈다. 같은 결과 형식(p50·p95·p99, 메시지/초, KB/초).
- [ ] T055 R1 다시 재기(quickstart 4, 새 스크립트라 머지 뒤 한 번 실제로 돌려 결과를 여기와 PR에 남긴다): (1) 로컬 `wrangler dev`의 실제 Worker, (2) PR 미리보기 배포(배포마다 운영자 승인, 판례 2026-11-10-preview-environment), 각각 N = 2·4·8·12·20 모임과 12·20 흩어짐, 20초 × 3회.
  기준: 마지막 상대 도착 p95 ≤ 50ms, p99 ≤ 100ms, 클라이언트당 ≤ 50KB/s. 넘으면 새 판례(`docs/precedents/`)로 상한을 낮추고 spec SC-006·research R1을 고치며, 경기장 입장 제한 규칙을 스펙부터 더한다.
  미리보기에서 한 방 두 채널 20명씩도 재고, 넘으면 채널마다 DO로 나누는 방안(001 R6 변경)을 PushNotification으로 운영자에게 묻는다.
- [ ] T056 SC-002 측정 `tests/e2e/perf-brawl.spec.ts`(+ T054 스크립트 재사용): Playwright 모바일 페이지 1개(Fast 4G 프리셋, 판례 2026-11-09-perf-4g) + 가짜 클라이언트 19명(같은 채널, 흩어짐 배치)에서
  잽 입력 → 내 화면 타격 이펙트까지 ≤ 100ms를 20회 이상 재 p95로 확인. 넘으면 원인(렌더링·메시지 처리)을 기록하고 고친다. 새 측정이라 머지 뒤 한 번 돌려 결과를 여기와 PR에 남긴다.
- [ ] T057 [P] 기존 E2E 전체·a11y.spec·perf.spec(SC-007: 4G 10초, 첫 3D 에셋 3MB)·`check:bundle`·문서 검사(`tasks.md` 등 400줄) 통과 확인, 결과를 여기에 적는다.
- [ ] T058 [P] quickstart 1~4 실행 기록, README에 난투 한 줄(필요하면). `rm -rf tests/bench/brawl-load/.wrangler`.
- [ ] T059 `/ponytail:ponytail-review`로 과잉 구현을 걷어낸 뒤 커밋(사용자 규칙). 스펙에 없는 기능이 들어갔으면 지운다.
- [ ] T060 운영자 판정(quickstart 5, US2 손맛·SC-001): 미리보기를 휴대폰·PC로 보고 R11 조정 후보를 함께 본다. 값을 바꾸면 조정표·스펙·판례를 함께 고친다. 판정이 끝날 때까지 그 PR은 머지하지 않는다.

---

## Dependencies & Execution Order

- T001(운영자 머지) → Foundational(T002~T011) → US1(T012~T026) → US2·US3·US4·US5 → Polish.
- US2는 US1의 `swing`·`launch`·아바타 그리기에, US4는 US1의 넉아웃에, US5는 US1의 궤적에 기댄다. US3은 US1의 `flight.ts`에 벽 규칙을 더한다.
  US1 뒤 US2·US3·US4·US5는 서로 다른 파일이 많아 병렬 가능하나 `brawl-session.ts`·`room-do.ts`·`flight.ts`·`Room2D.tsx`는 겹치므로 그 파일 작업은 순서대로(PR 단위로 나눠 충돌을 피한다).
- 관리자 되돌리기의 판 취소(T045·T048)는 US4에, 나머지(T036·T041·T042·T043)는 US3에 있다. US4가 먼저 끝나도 T045의 cancelled 검사는 T042 뒤에 연다.
- T055·T056은 US1~US5가 모두 머지된 뒤(실제 서버 코드로 잰다).

## Parallel Example: User Story 1

```text
T012 knockback.test ∥ T013 flight.test ∥ T014 fighter.test ∥ T015 brawl-session.test ∥ T016 worker brawl.test ∥ T017 e2e us1
→ T018 knockback.ts ∥ T019 flight.ts → T020 fighter.ts → T021 brawl-session.ts → T022 room-do.ts
→ T023 input.ts ∥ T025 looks.ts → T024 3D ∥ T026 2D
```

## Implementation Strategy

- MVP는 US1(+ 같은 P1인 US2). US1만으로 경기장에서 밀어 떨어뜨리는 놀이가 되므로 US1 PR이 머지되면 미리보기로 운영자 확인을 받는다.
- PR 단위: (1) T001(린트, 운영자 머지), (2) T002~T010, (3) US1 core(T012~T015·T018~T021), (4) US1 worker·화면(T011·T016·T017·T022~T026), (5) US2, (6) US3,
  (7) US4, (8) US5, (9) T054~T058, (10) T059~T060. `scripts/`·설정을 바꾸는 PR은 운영자 머지다.
- 각 PR은 테스트 실패 확인 → 구현 → 통과를 항목 끝에 적고, 머지되면 이 파일의 체크를 갱신한다.
