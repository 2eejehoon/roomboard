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
- 운영자가 화면을 봐야 하는 PR(화면·손맛)은 `claude/`로 시작하는 브랜치로 연다. PR 미리보기 워크플로가 그 브랜치만 배포한다.
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
- [X] T011 (US1 화면 PR (4)로 옮김: 재생할 `stepFlight`가 T019에서 생긴다) `src/client/brawl/store.ts`(+ `tests/client/brawl-store.test.ts` 먼저): 서버 시계 어림 = 받은 시각 − `at`의 최솟값(R3), `launch`를 core `stepFlight`로 재생해 지금 위치를 내고,
  늦게 받은 궤적은 지금 위치로 짧게 보간(Edge Cases). `src/client/test-hooks.ts`에 난투 상태 읽기(피해 %, 위치, 블록 차이, 판)를 더한다(개발 빌드 전용).
  - 실패 확인: `src/client/brawl/looks.ts`·`store.ts`가 없어 모듈을 찾지 못함. 늦게 받은 궤적을 따라잡는 시간은 `LOOKS.flight.catchUpMs`로 data-model에 먼저 더함.
  - 결과: T011 통과. 상태는 `RoomStore`의 `brawl`에 두고(`applyBrawl`), 화면은 `flightPosition()`으로 그린다. 테스트 훅 `flight(peerId)`. 블록 차이를 궤적에 넣는 것은 US3(T043).

**Checkpoint**: 기존 E2E(us1~us7·a11y·perf) 통과, v1 클라이언트는 4002를 받는다.

**배포 금지(PR #83 리뷰, 2026-11-19 #88 머지로 풀림)**: Phase 2가 머지되면 서버의 입구 칸이 동작하지만 3D 경기장 바닥은 T024에서 생긴다. T024·T026이 머지될 때까지 main을 배포하지 않는다
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
- [X] T016 [P] [US1] `tests/worker/brawl.test.ts`(quickstart 2): 가짜 소켓 2~3개로 평화 구역에서 맞지 않음, 다시 쓰기·닿는 거리 밖 요청은 조용히 무시(FR-034), 다른 채널에 아무것도 가지 않음(FR-018),
  alarm이 착지·넉아웃·재시작을 메시지 없이 제때 보냄, 피해·기력이 attachment에 있어 DO를 다시 만들어도 남음(R6). 실패 확인.
  - 실패 확인: 3개 중 1개 실패. 맞은 사람의 attachment를 쓰지 않아 DO를 다시 만들면 b의 피해 3%가 사라짐. 평화 구역·쿨다운 무시·alarm 착지는 PR 3 코드로 이미 통과.
    다른 채널(FR-018)은 core `members(channel)`로 나뉘어 worker에서 21명을 띄우지 않는다.
- [X] T017 [P] [US1] `tests/e2e/us1-brawl.spec.ts`(브라우저 2개, US1 시나리오 1·3·4): 둘이 입구로 경기장에 들어가 잽 → 상대 % 3, 반복해 넉아웃 → 3초 뒤 0%로 다시 섬(테스트 훅으로 읽음),
  평화 구역에서 기술 버튼이 막힘, 한쪽이 2D 화면(옆 그림·버튼·글 기록)이어도 같다(FR-033). 실패 확인.

### Implementation

  - 실패 확인: `tests/client/room2d-brawl.test.tsx` 4개 모두 실패(2D에 경기장 길·옆 그림·버튼·글 기록이 없음). E2E도 2D "경기장으로 가기" 버튼이 없어 실패한다(CI에서 확인).
- [X] T018 [P] [US1] `src/core/brawl/knockback.ts`: 피해·세기·경직·타격 정지·방어·`launchVector(angleDeg, facing, s, tuning)`(서버만 sin/cos, 반올림, R3). T012 통과.
  - 결과: T012 통과. 방향 틀기는 US5(T052). 넉백 세기는 반올림하지 않고 `launch.s`로 보낼 때 3자리로 반올림한다.
- [X] T019 [P] [US1] `src/core/brawl/flight.ts`: `Launch`·`FlightEnd`(data-model), `stepFlight(launch, grid, tuning)`(덧셈·곱셈만, 3D DDA, 미끄러짐, 착지, 넉아웃). T013 통과.
  - 결과: T013 통과. 함수 이름은 `simulate`(점 목록과 끝)와 `positionAt`. 미끄럼 거리는 v²/(2×6)과 한 간격 이동 이내로 같다.
- [X] T020 [US1] `src/core/brawl/fighter.ts`: `Fighter`(data-model 필드 그대로: `damage` 0~999(메시지에만 정수), `stamina` 0~max + `staminaAt`, `stunUntil`, `invulnUntil`, `cooldownUntil`, `jabStep`·`jabAt`,
  `holdAt`, `guarding`·`guardPressedAt`, `inputDir`, `airJumps`·`airRecovers`, `flight`, `knockedOutAt`) 허용 검사와 상태 전이. T014 통과.
- [X] T021 [US1] `src/core/brawl/brawl-session.ts`: `handle(me, msg, members, now) → Outbox`, `runEvents(now)`(지난 사건 따라잡기, R2), `room-session.ts`가 난투 메시지를 넘김, `hold`·`skill`·`guard`·`roll`·`move.d` 처리, 판정 → `swing`, 사건 목록(착지·넉아웃·재시작), welcome의 `fighters`. T015 통과.
  - 결과: T015 통과. `RoomSession.receive`가 메시지마다 지난 사건을 먼저 보내고, `move`는 날아가는 중·경직 중·넉아웃 중에 `d`만 받는다. 입구로 들어가면 `fighter`가 생기고 출구로 나가면 없어진다.
    맞은 사람의 attachment 쓰기와 alarm 사건의 attachment 갱신은 T022(PR 4). `npx vitest run` 651개, typecheck·lint 통과.
- [X] T022 [US1] `src/worker/room-do.ts`: `Fighter`를 attachment에 쓰기(보낸 사람·맞은 사람), alarm 사건 처리. T016 통과.
  - 결과: T016 통과. 메시지·alarm 결과가 이름을 부르는 사람(`swing.hits`, `landed`·`knocked_out`·`respawned`)의 attachment를 다시 쓴다.
- [X] T023 [P] [US1] `src/client/brawl/input.ts`: PC 키(잽·강펀치 누름/뗌·던지기·방어·구르기)와 `move.d`, 다시 쓰기 시간 중 누른 잽을 들고 있다가 어림한 서버 시계로 `readyAt`이 지난 뒤
  보냄(R2), 경직으로 거부되면 버림. 때린 사람 화면은 서버를 기다리지 않고 이펙트를 먼저 보여 주고 `nonce`로 `swing`과 맞춰 보정(FR-032).
  - 실패 확인: `src/client/brawl/input.ts`가 없어 모듈을 찾지 못함(`tests/client/brawl-input.test.ts`).
  - 결과: 테스트 통과. 키는 J 잽·K 강펀치(누름/뗌)·L 던지기·I 방어·U 구르기, 휴대폰은 같은 id의 버튼. `move.d`는 몸이 움직이는 방향(반올림하지 않음, 길이 1 검사).
- [X] T024 [US1] `src/client/room/room3d/`: 경기장 섬(기본 블록, instanced mesh + Rapier 고정 콜라이더), 입구·출구·경계 표시(FR-014, 색은 `LOOKS.arena`), 날아가는 아바타를 store 궤적으로 그림,
  머리 위 % 숫자, `TouchControls.tsx`에 기술·방어·구르기 버튼(44×44px 이상, FR-035).
  - 결과: `Arena.tsx`(블록 instanced mesh + 블록마다 고정 콜라이더, 출구·가장자리 표시), 방의 입구 칸 표시, 날아가는 나·남을 `flightPosition`으로 그림, 머리 위 %, 경기장에서만 기술 버튼(56px).
    확인: 로컬 Playwright(데스크톱)로 두 브라우저가 입구로 들어가 J 키 잽 → 상대 % 3, 경기장 화면 캡처. us1-move의 T046 라벨 검사는 이 컨테이너의 소프트웨어 렌더링에서 main 그대로도 실패해 CI로 본다.
- [X] T025 [US1] `src/client/brawl/looks.ts`: `LOOKS`의 `blocks`·`arena` 항목(US2가 나머지를 채움). 화면 코드는 색·모델 경로를 `LOOKS`로만 읽는다.
  - 결과: `blocks`·`arena`와 `flight.catchUpMs`·`swing`(내 화면 먼저 보이는 이펙트, data-model에 먼저 더함). 나머지는 US2.
- [X] T026 [US1] `src/client/room/room2d/Room2D.tsx`(+ 새 컴포넌트 파일): 옆 그림 SVG(블록 칸, 참가자 점, 궤적 선, 내 깊이 줄은 진하게·다른 줄은 흐리게 + 깊이 차이 숫자),
  앞·뒤 깊이 줄 버튼, 보는 방향 좌·우·앞·뒤(`r` = 0, ±π/2, π), 기술·방어·구르기 버튼, `aria-live` 글 기록(누가 누구를 쳤는지, %, 넉아웃)(FR-033, R8). 문구는 i18n. T017 통과, a11y.spec 통과.
  - 결과: `ArenaSide.tsx`(옆 그림·이동·줄·기술 버튼, 강펀치·방어는 누름/뗌, 키보드도), 평화 구역에서는 "경기장으로 가기"만, 참가자 목록에 경기장 사람의 %, `aria-live` 글 기록(`brawl.log`).
    확인: `room2d-brawl.test.tsx` 통과, 로컬 Playwright `us1-brawl.spec.ts`·`a11y.spec.ts` 데스크톱·모바일 통과.

**Checkpoint**: US1만으로 놀이가 된다. 이 단계에서 미리보기를 띄워 운영자가 휴대폰으로 볼 수 있다.

---

## Phase 4: User Story 2 — 때리는 손맛이 느껴진다 (P1)

**Goal**: 타격 정지, 꼬리, % 숫자 색, 화면 흔들림(끌 수 있음), 효과음. 판정은 바뀌지 않는다(FR-024). US1의 `swing`·`launch`에 기댄다.

**Independent Test**: `npx vitest run tests/core/brawl/feel.test.ts tests/client/shake.test.ts`, `npx playwright test tests/e2e/us2-brawl-feel.spec.ts`, 운영자가 미리보기로 판정(quickstart 5).

### Tests (먼저 작성, 실패 확인)

- [X] T027 [P] [US2] `tests/core/brawl/feel.test.ts`: `damageColor(damage, tuning)` → 0~49 white, 50~99 yellow, 100~ red(FR-022, 기준은 `TUNING.damageColor`),
  타격 정지 구간에 때린 사람·맞은 사람이 멈춤(US2-1 약 0.03초, US2-2 마무리 0.15초를 `swing.hitstopMs`로 확인).
  - 실패 확인: `src/core/brawl/feel.ts`가 없어 모듈을 찾지 못함. 잽 1타는 공식대로 35ms(30 + 1.3 × 4), 잽 3타 150ms, 맞은 사람은 `launch.t`까지 `launch.p`.
- [X] T028 [P] [US2] `tests/client/device.test.ts`(기존 localStorage 테스트 옆)·`tests/client/brawl-store.test.ts`: 흔들림 설정은 localStorage `roomboard.shake = "off"`로 기기에 남고, 꺼져 있으면 강한 타격에도 흔들지 않음(타격 정지·꼬리는 남음, US2-5). 접근이 막힌 localStorage에서도 오류 없음.
  - 실패 확인: `readShake`·`saveShake`·`stopped`·`feel`·`shakeOffset`이 없어 5개 실패(`is not a function`). 흔들림은 `(세기, 켜짐)`만 보고, 멈춤·꼬리는 설정을 읽지 않는다.
- [X] T029 [P] [US2] `tests/e2e/us2-brawl-feel.spec.ts`(브라우저 2개): 잽을 맞힌 뒤 테스트 훅으로 두 화면의 타격 정지 시간·꼬리 표시 여부·숫자 색이 같음(FR-024), 흔들림 끄기 버튼 뒤 새로고침해도 꺼져 있음.
  - (PR #88 리뷰에서 넘김) 2D 방어 버튼을 누른 채 버튼 밖에서 떼면 방어가 끝나는지 E2E(그 뒤 정면 잽이 줄지 않음). 강펀치 경로는 us1-brawl이 확인한다.
  - 실패 확인: E2E는 구현과 함께 썼다(훅 `feel`·흔들림 버튼이 main에 없어 첫 테스트는 main에서 실패). 방어 테스트는 `onLostPointerCapture`를 비우면 3% 대신 1%로 실패함을 확인.
    잽은 0%에서 약 5cm만 미끄러져 꼬리를 읽기 전에 끝나므로 0.3초 모은 강펀치(15%, 세기 24)로 본다. 로컬 데스크톱·모바일 통과.

### Implementation

- [X] T030 [US2] `src/core/brawl/feel.ts`(`damageColor`) + `src/client/brawl/looks.ts`의 `trail`·`damageText`·`shake`·`sfx`. T027 통과.
- [X] T031 [US2] `src/client/room/room3d/`: 타격 정지 동안 두 아바타 멈춤, 꼬리(`LOOKS.trail`), 숫자 색, 화면 흔들림(설정 존중), 효과음. 2D는 글 기록과 숫자 색으로 같은 정보(FR-033). T028·T029 통과.
  - (PR #88 리뷰에서 넘김) 2D: 동·서쪽 가장자리 밖으로 떨어지거나 넉아웃된 사람(나 포함)도 옆 그림·참가자 목록에서 "싸우는 중"으로 보이게(Room2D의 판정을 같이 쓰고 점을 viewBox 안으로).
    "경기장으로 가기" 걷기 타이머: 기다리는 동안 버튼을 끄고 unmount 때 지운다.
  - 참고(#88): us1-move T046이 #87 뒤 main CI에서 가끔 실패해 Arena를 `memo`로 감쌌다. 3D에 무거운 것을 더하면 Scene 리렌더에 딸려 가지 않게 한다.
    원인(#93): 검사가 "store가 바뀐 다음 프레임 = 미끄러짐 시작"으로 가정했으나 React는 store 변경을 별도 작업에서 반영해 느린 프레임에서는 늦는다. 라벨이 움직이기 시작한 것을 보고 긴 프레임을 넣게 고쳤다(소프트웨어 렌더링에서도 통과, 우선순위 버그는 여전히 잡음).
  - 결과: 때린 사람은 `swing.at + hitstopMs`, 맞은 사람은 `launch.t`까지 멈춤(store `stopUntil`, `stopped()`). 꼬리는 drei `Line`에 궤적 점을 넣고 프레임마다 `instanceCount`만 바꿈(모든 화면 같은 점).
    흔들림은 세기 `LOOKS.shake.strengthFrom`(20) 이상, 머리 영역 "화면 흔들림 끄기/켜기" 버튼(3D에서만). 2D는 옆 그림 점 위에 색 있는 %. 넘긴 2D 항목: `fighting()` 하나를 옆 그림·목록·조작이 같이 쓰고 점은 viewBox 안으로,
    걷기 타이머 동안 버튼을 끄고 unmount 때 지움. 테스트 훅 `feel(peerId)`. (PR #90 리뷰) 날아가는 중에 나간 사람은 `peer_left`에서 store의 fighter를 지워 꼬리가 남지 않게(실패 확인 뒤 고침). 확인: `npx vitest run` 통과, us1-brawl·us2-brawl-feel·us2-fallback·a11y 로컬 데스크톱·모바일 통과, `check:bundle` 통과.
- [X] T032 [P] [US2] 효과음·그림이 필요하면 CC0만 `public/assets/`에 두고 `public/assets/CREDITS.md`·`scripts/assets.sha256`에 출처를 적는다(FR-038, 판례 2026-11-07-assets-quaternius).
  `scripts/`를 바꾸면 운영자 머지다. 첫 3D 에셋 상한 3MB(perf.spec)와 `check:bundle`을 넘지 않는다. 필요 없으면 이 항목에 "에셋 없음"이라 적고 닫는다.
  - 에셋 없음. 효과음은 spec의 FR·US2 시나리오에 없고(FR-030a는 모습을 둘 곳만 정함) 넣으면 `scripts/assets.sha256`을 바꿔 운영자 머지가 된다. data-model LOOKS에서 `sfx`를 빼고 T060 판정에서 필요하면 더한다고 적었다.

---

## Phase 5: User Story 3 — 블록으로 경기장을 짓고 부순다 (P2)

**Goal**: 흙·돌 블록 놓기·부수기, 벽 충돌(튕김·추가 피해·뚫림·낙법), 지은 경기장을 채널이 빌 때까지 DO 저장소에 두기, 관리자 되돌리기.

**Independent Test**: `npx vitest run tests/core/brawl tests/worker/brawl-arena.test.ts tests/worker/admin.test.ts`, `npx playwright test tests/e2e/us3-brawl-blocks.spec.ts`.

### Tests (먼저 작성, 실패 확인)

- [X] T033 [P] [US3] `tests/core/brawl/arena.test.ts`에 더함(FR-015·015a·017): `targetCell(pose, h)` = `r`를 네 방향으로 반올림한 바로 앞 칸, `h` ∈ `-1 | 0 | 1`(앞쪽 아래·발·눈 높이),
  내 몸 칸·내 바로 아래 칸은 대상 아님, 놓기는 경기장 안·시작 지점과 출구 아님·빈 칸(블록도 참가자 몸도 없음)만, 부수기는 블록이 있는 칸만, 한 번에 `hp − 1`(흙 1, 돌 4, 0이면 없어짐), 기본 돌 블록도 부서짐(FR-016).
  - 실패 확인: `targetCell`·`canPlace`·`placeBlock`·`hitBlock`이 없어 3개 실패. 몸은 발 칸과 그 위 칸을 차지한다. 부서진 놓은 블록은 차이에서 빠지고 기본 블록만 null로 남는다.
- [X] T034 [P] [US3] `tests/core/brawl/flight.test.ts`에 더함(FR-019, US3 시나리오 3~5): 옆면·아랫면 충돌만 벽, 반사 방향 × `s × 0.5`로 튕김 + 추가 피해 `s × 0.5`%, 흙 3·돌 10 이상이면 블록이 부서지고
  그대로 날아감, 충돌 전 200ms 안의 방어 누름이면 낙법(추가 피해 없이 멈추고 경직 끝), 뚫림 기준 이상이면 낙법보다 뚫림이 먼저, 세기는 궤적의 시작 세기. R11 (a): 0% 강펀치 20.4는 돌 벽을 뚫는다.
  - 실패 확인: `hitWall`이 없고 벽 끝에 면(`axis`)·속도(`v`)가 없어 5개 실패. 튕김 방향은 부딪힌 속도의 그 면 성분만 뒤집어 세기 × 0.5 속력으로 맞춘다.
- [X] T035 [P] [US3] `tests/worker/brawl-arena.test.ts`(R6, R9): `block` 요청 → 같은 채널 전원에게 `block`, 초당 4개를 넘으면 `rate_limited {scope: "block"}`, 블록 차이를 2초에 한 번 `arena:<채널>`에 씀,
  DO를 다시 만들어도(잠들었다 깸) 지은 블록이 남음, 채널의 마지막 사람이 나가면 키 삭제, 깨어날 때 사람 없는 채널의 키 삭제,
  **close 이벤트 없이 소켓이 사라진 경우**(`webSocketClose`를 부르지 않고 DO를 다시 만들어 소켓 0개): `arena:*` 키가 있는 동안 정리 alarm(`now + 10분`, 쓸 때마다 다시 검)이 있고,
  그 alarm이 소켓 없는 채널의 키를 지우고 남은 키가 없으면 다시 걸지 않음. 날아가는 경로의 블록이 바뀌면 그 시각부터 다시 계산한 `launch`(`cause: "block"`). 실패 확인.
  - 실패 확인: 저장소 쓰기·삭제·정리 alarm이 없어 3개 실패(요청 제한은 core에서 이미 통과). 저장 값은 `{ blocks }`(판은 US4에서 더함).
    소켓이 close 없이 사라진 경우는 소켓 없는 DO에 키를 넣고 alarm을 돌려 본다. 날아가는 경로의 블록 변경(`cause: block`)은 core `brawl-session.test`에서 본다.
- [X] T036 [P] [US3] `tests/worker/admin.test.ts`에 더함(FR-040, contracts/openapi.yaml): `POST /api/admin/rooms/{roomId}/arena-reset` 토큰 없음·틀림 401, 없는 방 404, 삭제된 방 410,
  토큰 실패 횟수 제한 429(001과 같음), 성공 204(사람 없어도 204) → 모든 채널의 `arena:*` 삭제, 경기장 사람에게 `arena_reset` 뒤 `respawned`(시작 지점, 피해 0%), 평화 구역 사람은 그대로, 신고 상태는 그대로.
  - 실패 확인: 라우트가 없어 2개 실패. 판 취소(`cancelled`)는 US4(T045).
- [X] T037 [P] [US3] `tests/e2e/us3-brawl-blocks.spec.ts`(브라우저 2개, US3-1·2): 한쪽이 흙 블록을 놓으면 다른 쪽 같은 칸에 보이고, 2D 화면 버튼(놓기·부수기·종류·높이)으로 놓아도 같다,
  흙은 한 번·돌은 네 번 쳐서 부서짐. `tests/e2e/us7-admin-states.spec.ts` 또는 새 파일: 관리자 화면에서 신고된 방의 "경기장 되돌리기" → 다른 브라우저의 지은 블록이 사라짐. 실패 확인.
  - 실패 확인: 2D "놓기" 버튼·3D F 키·관리자 "경기장 되돌리기"가 없어 main에서 실패(새 화면이라 구현과 함께 썼다). 테스트는 2D 버튼으로 흙 놓기·한 번에 부수기, 돌 놓기·네 번에 부수기를
    3D 화면 상태로 확인하고, 3D F 키로 놓은 블록이 2D에 보이는지, 신고된 방의 관리자 되돌리기 뒤 두 화면의 블록이 비는지 본다. 로컬 데스크톱·모바일 통과.

### Implementation

- [X] T038 [US3] `src/core/brawl/arena.ts`: `targetCell`, 놓기·부수기 허용, 차이 적용. T033 통과.
  - 결과: T033 통과. `removeBlock`은 벽 뚫림과 같이 쓴다.
- [X] T039 [US3] `src/core/brawl/flight.ts`: 벽 충돌(튕김·뚫림·낙법)을 `FlightEnd` `wall`로, 세션이 새 `launch {cause: "wall"}`·`landed {end: "tech"}`를 낸다. T034 통과.
  - 결과: T034 통과. `hitWall(launch, end, kind, guardPressedAt, damage)` → `bounce | break | tech`. `simulate`가 점마다 속도(`vels`)를 내고, `crosses()`가 남은 경로가 칸을 지나는지 본다.
    `launch.wall.damage`는 벽 뒤 누적 피해(정수)로 contracts에 먼저 적었다.
- [X] T040 [US3] `src/core/brawl/brawl-session.ts`: `block` 처리(경기장 안에 있는 사람만, FR-034), `BLOCK_RATE`(초당 4개) 토큰 버킷(`src/core/rate-bucket.ts`의 `RateRule`로), 경로 블록 변경 시 다시 계산.
  - 결과: 놓기·부수기는 경기장 안·넉아웃 아님·앞 칸만, 놓기는 빈 칸(경기장 사람 몸 제외)만. 블록이 생기거나 없어진 칸을 남은 경로가 지나면 지금 위치·속도에서 `launch {cause: block}`.
    내구만 줄면 다시 계산하지 않는다. `BLOCK_RATE`는 `TUNING.blockRate`에서. core 테스트 8개 더함(실패 확인: 8개 모두 실패).
- [X] T041 [US3] `src/worker/room-do.ts`: `arena:<채널>` 2초 묶어 쓰기, 비면 삭제, 깨어날 때 정리, 10분 정리 alarm(모두 alarm 하나로), `resetArenas()` RPC(R10). T035 통과.
  - 결과: T035 통과. 쓰기 예정 시각은 메모리(`arenaDue`), 정리 alarm은 alarm마다 키 목록을 보고 다시 건다. 채널의 마지막 사람이 나가면 core가 그 채널 경기장을 버리고 DO가 키를 지운다.
    (PR #91 리뷰) 쓰기 전에 방이 삭제돼 세션이 없으면 지난 `arenaDue`가 alarm을 끝없이 다시 울렸다. 세션이 없어도 기한이 지나면 지운다(테스트 먼저 실패 확인). 정리 alarm의 '사람 있는 채널'은 세션이 아니라 소켓 attachment로 본다(D1이 실패해도 지은 블록을 지우지 않음, 테스트 먼저 실패 확인).
    저장된 경기장을 읽다 실패해도 `loading`을 비워 다음에 다시 만든다.
- [X] T042 [US3] `src/worker/admin.ts`·`src/worker/index.ts`: `app.post('/admin/rooms/:roomId/arena-reset', ...)`(기존 `adminAuth`와 `adminDeleteRoom`의 방 조회·410 처리를 그대로), DO `resetArenas()` 호출. T036 통과.
  - 결과: T036 통과. `adminResetArena`(`requireRoom`의 404·410 그대로). `npx vitest run` 711개, typecheck·lint 통과.
- [X] T043 [US3] `src/client/`: 블록 그리기(`LOOKS.blocks`, instanced mesh + 걷기용 콜라이더 갱신), PC 키·휴대폰 버튼(놓기·부수기·종류·높이 `-1|0|1`, 44px), 2D 옆 그림의 블록 칸과 같은 버튼,
  `src/client/admin/AdminPage.tsx` 신고된 방 줄에 "경기장 되돌리기" 버튼(확인 뒤 호출, 문구 i18n). T037 통과.
  - (6a 리뷰에서 넘김) store: `block`·`arena_reset`을 `blocks`에 적용하고 `flightOf`에 채널 블록을 넘김(shortcut 해소), `launch.wall.damage`로 피해 % 갱신.
  - 결과: store가 `block`·`arena_reset`을 차이에 적용하고 `launch.wall.damage`로 %를 갱신, `flightOf(launch, blocks)`가 채널 블록으로 궤적을 다시 냄(shortcut 해소, 실패 확인 2개).
    키 F 놓기·R 부수기·T 종류·G 높이, 휴대폰은 같은 id 버튼 4개(56px, 채팅 막대 위 줄), PC는 오른쪽 아래에 고른 종류·높이. 2D는 같은 네 버튼(종류·높이는 지금 값을 이름에).
    관리자 화면의 신고 줄마다 확인 뒤 `arena-reset`. 블록 그리기·걷기 콜라이더는 T024의 `Arena`가 차이로 이미 갱신한다. 확인: `npx vitest run` 729개, us3·us1·us2·a11y·us7-admin 로컬 데스크톱·모바일 32개 통과, 휴대폰 화면 캡처로 버튼이 채팅 막대·머리 영역과 겹치지 않음을 봄.

---

## Phase 6: User Story 4 — "떨어뜨리기" 한 판을 한다 (P2)

**Goal**: 경기장의 2명 이상이 판을 시작해 목숨 3개, 탈락, 제한 시간 5분, 같은 순위 결과를 모든 화면에 보인다. US1의 넉아웃에 기댄다.

**Independent Test**: `npx vitest run tests/core/brawl/match.test.ts tests/worker/brawl-match.test.ts`, `npx playwright test tests/e2e/us4-brawl-match.spec.ts`(브라우저 3개).

### Tests (먼저 작성, 실패 확인)

- [X] T044 [P] [US4] `tests/core/brawl/match.test.ts`(FR-025~027): 시작은 경기장에 2명 이상·요청자가 경기장에 있고 판이 없을 때만, 그 순간 경기장 사람이 players(피해 0%), 넉아웃마다 `stocks − 1`,
  0이면 탈락(`out` 순서 번호, 같은 서버 판정의 동시 탈락은 같은 번호), 출구로 나감·연결 끊김 = 탈락, 진행 중 비참가자 입구 차단, 남은 사람 ≤ 1이면 끝, `endsAt`(5분)이면 목숨 많은 순 → 피해 낮은 순 → 같은 순위,
  탈락자는 그 아래 `out` 역순, 모두 함께 탈락하면 공동 1위, 끝나면 피해 0%.
  - (PR #87 리뷰) 경기장 사람은 섬 밖 공중에서 koY까지 자유롭게 떨어질 수 있어, 조작된 클라이언트가 섬 옆 공중(경기장 상자 밖, koY 위)에 머물면 맞지도 넉아웃되지도 않는다(R4 shortcut).
    목숨이 걸리는 이 판에서 "상자 밖에 일정 시간 넘게 머물면 넉아웃" 같은 서버 규칙을 스펙·조정표부터 정하고 테스트한다.
    → FR-005·조정표 `fallMaxMs` 3초(R12 계산)·Fighter `outsideAt`·판례 2026-11-19-arena-hover-ko. 판 밖에서도 같다. 상자 안 바닥 아래는 shortcut(R4).
  - 실패 확인: `ranks`만 있는 빈 `match.ts`로 8개 실패(`match` 메시지 없음, 목숨이 줄지 않음, 출구·끊김이 탈락 아님, 입구가 열림, 시간 제한 사건 없음, `fallMaxMs` 사건 없음).
    "같은 서버 판정" = 같은 ms의 사건으로 정하고(data-model) 마지막 두 명이 같은 ms에 넉아웃되면 공동 1위인지 본다.
- [X] T045 [P] [US4] `tests/worker/brawl-match.test.ts`: 판 시작·탈락·끝을 `arena:<채널>`의 `match`에 바로 씀, DO를 다시 만들어도 판이 이어짐, 제한 시간 alarm으로 끝남, 결과를 보낸 뒤 `match` 삭제(FR-027),
  관리자 되돌리기 중 판이 있으면 `match {state: "cancelled"}`가 `arena_reset`보다 먼저(T036의 판 부분). 실패 확인.
  - 실패 확인: `match` 메시지가 오지 않아 3개 모두 시간 초과. 제한 시간은 저장된 `endsAt`을 지금으로 바꾸고 DO를 다시 만든 뒤 alarm을 돌려 본다.
- [X] T046 [P] [US4] `tests/e2e/us4-brawl-match.spec.ts`(브라우저 3개, US4-1·2): 판 시작 → 세 화면에 같은 시작 신호, 넉아웃을 만들어 끝까지 → 세 화면에 같은 순위, 피해 0%. 평화 구역에서는 시작 버튼이 막힘. 실패 확인.
  - 실패 확인: 판 시작 버튼·`match.start` 문구가 없어 평화 구역 검사부터 실패. 화면 상태 단위 테스트(`brawl-store`·`room-header`)도 먼저 써 8개 실패(`match`·`result` 없음, 넉아웃이 목숨을 줄이지 않음, 탈락자가 경기장에 남음).
    새로 만든 방에서(판 중 입구가 닫혀 다른 E2E 방을 막지 않게) 3D 1개·2D 2개. 이긴 사람(a)을 판 중에 잽 3%로 만들어 끝의 0%가 의미 있게 하고, c는 koY 아래로 세 번 떨어져 탈락(목숨 2가 a 화면 머리 줄에 보임, 방 시작 지점으로),
    b는 출구 칸으로 나가 탈락 → 세 화면 순위 a 1·b 2·c 3, a 0%. 같은 move를 두 번 보내면 소켓이 버리므로 떨어지는 깊이를 매번 바꾼다. 로컬 데스크톱·모바일 통과.

### Implementation

- [X] T047 [US4] `src/core/brawl/match.ts`: `Match`(data-model)와 시작·탈락·순위. T044 통과.
  - 결과: `startMatch`·`playing`·`isOver`·`ranks`. `out`은 탈락 시각(ms). 순위는 앞선 사람 수 + 1, 피해 비교는 보이는 정수 %.
- [X] T048 [US4] `src/core/brawl/brawl-session.ts`·`src/worker/room-do.ts`: `match_start`, 넉아웃의 `stocks`·`out`, 제한 시간 사건, 저장·삭제, `resetArenas()`의 cancelled. T045 통과.
  - 결과: `runEvents`는 같은 ms 사건을 모두 처리한 뒤 판 끝을 한 번 본다(`judged`). 탈락자는 fighter를 지우고 방 시작 지점(`BrawlSession`이 테마 spawn을 함수로 받음).
    출구·끊김(`RoomSession.leave(peerId, now)`)은 `match running`(그 사람 stocks 0) 뒤 필요하면 `ended`. 입구는 판 중 닫힘(`open`). 방 테마 변경은 `cancelled`(data-model).
    (PR #95 리뷰) `outsideAt`은 받아들인 move로만 바꾸고(`walked`) 맞으면 지운다. 거부된 move로 시각을 켜고 끄던 것을 테스트 먼저 실패 확인.
    저장 값은 `{ blocks, match? }` 하나를 블록 2초 묶음과 판 변경 즉시 쓰기가 같이 쓰고(`saveArenas`), 둘 다 없으면 지운다. 확인: `npx vitest run` 741개, typecheck·lint 통과.
- [X] T049 [US4] `src/client/`: 판 시작 버튼(경기장에서만), 남은 목숨·남은 시간, 결과 순위 화면(3D·2D, 글 기록에도), 문구 i18n. T046 통과.
  - 결과: store `brawl.match`(running의 `endsAt`·`players`)와 `brawl.result`(끝난 판 순위, 다음 시작까지). 시작은 참가자 0%, 판 중 running(출구·끊김)은 목숨만, `knocked_out.stocks`로 목숨,
    `out`이면 fighter를 지우고 방 시작 지점에 둠(RoomStore), `ended`는 순위·참가자 0%, `cancelled`는 결과 없음. 머리 줄(3D·2D 공통)에 시작 버튼(경기장 안·2명 이상), 남은 시간·목숨, 결과 순위(나간 사람은 "나간 사람").
    2D 글 기록에 시작·끝(순위)·취소 줄. 판 중 2D "경기장으로 가기"는 막음. 확인: `npx vitest run` 통과, us1·us2·us3·us4·a11y 로컬 데스크톱·모바일 통과.

---

## Phase 7: User Story 5 — 날아가는 중에 버티고 돌아온다 (P3)

**Goal**: 방향 틀기(최대 15°, 날아가기 시작할 때 한 번), 공중 점프·복귀기 각 1번.

**Independent Test**: `npx vitest run tests/core/brawl/steer.test.ts`, `npx playwright test tests/e2e/us5-brawl-air.spec.ts`.

### Tests (먼저 작성, 실패 확인)

- [X] T050 [P] [US5] `tests/core/brawl/steer.test.ts`(FR-028·029, US5-1·2): 판정 순간의 마지막 `d`로 궤도가 최대 15° 꺾임(방향 틀기 없이/있이 각도 차이 ≤ 15°), 땅에서 0°로 시작한 궤적은 수평으로만 꺾임(R3),
  - 실패 확인: `steer`가 없고 `air`를 처리하지 않아 5개 실패(경직 중·걷는 중 거부 검사는 처리가 없어도 통과해 구현 뒤 다시 봄). 꺾기 기하(u·w 평면, 같거나 정반대면 그대로)와
    공중 동작 궤적 모양(지금 수평 속도 유지, 위로 jumpSpeed·recoverSpeed, 날아가는 중에만)은 data-model에 먼저 적었다.
    더한 검사: `d` 없는 move가 잡고 있던 방향을 놓음(지난 걷기 방향이 방향 틀기·던지기 방향으로 남지 않게). 구현 전 실패 확인.
  날아가는 도중 `d`가 바뀌어도 궤적 그대로, 공중 점프(위로 8 m/s)·복귀기(위로 12 m/s)는 각각 땅에 닿기 전 한 번만이고 새 `launch {cause: "air" | "recover"}`, 착지하면 다시 참, 경직 중 거부.
- [X] T051 [P] [US5] `tests/e2e/us5-brawl-air.spec.ts`(브라우저 2개): 맞고 날아가는 중 점프를 두 번 누르면 상대 화면에서도 한 번만 뜀(테스트 훅으로 `launch` 수). 실패 확인.
  - 실패 확인: 2D "공중 점프" 버튼이 없어 실패(b가 날아가는 것까지는 통과). 테스트 훅을 더하지 않고 a 소켓이 받은 `launch`를 원인별로 센다.

### Implementation

- [X] T052 [US5] `src/core/brawl/knockback.ts`(방향 틀기)·`fighter.ts`·`brawl-session.ts`(`air`). T050 통과.
  - 결과: `steer(v, d, tuning)`(knockback.ts), 세션 `air()`·착지(`stand`) 때 횟수 채움, 블록 다시 계산과 같이 쓰는 `here()`. room-session은 `move.d ?? null`. T050 통과.
- [X] T053 [US5] `src/client/brawl/input.ts`·`TouchControls.tsx`·2D 버튼: 공중 점프·복귀기 입력(44px). T051 통과.
  - 결과: 2D 기술 줄에 "공중 점프"·"복귀기", 3D는 날아가는 중 점프 키(Space·점프 버튼)가 공중 점프, E 키·휴대폰 "복귀기" 버튼(56px)이 복귀기. T051 통과.

- [X] T061 [US5] 2D 방향 틀기(FR-028·FR-033, PR #98 리뷰): 2D `move`는 `d`를 보내지 않아 2D 참가자는 방향 틀기를 못 한다(공중 점프·복귀기는 됨).
  2D에서 "잡고 있는 방향"을 보내는 방식(예: 좌·우·앞·뒤 버튼을 누르고 있는 동안 `d`를 싣는 move, 또는 방향 고르기 버튼)을 spec·data-model에 먼저 정하고,
  `tests/client` 또는 E2E로 2D가 `d`를 보내 꺾이는지 실패 확인 뒤 구현한다. 서버는 그대로(`move.d ?? null`).
  - 결과: "방향 잡기" 순환 버튼(없음·왼쪽·오른쪽·앞 줄·뒤 줄, FR-033, 판례 2026-11-24-2d-held-direction). 바꿀 때 제자리 `move`에 `d`, 칸 이동도 `d`를 싣는다.
    `tests/e2e/us5-brawl-steer-2d.spec.ts` 먼저 실패 확인(버튼 없음) 뒤 통과: 앞 줄을 잡은 b가 옆으로 맞으면 두 화면 모두 `launch.v`에 -z 성분, 꺾임 ≤ 15°.

---

## Phase 8: Polish — 측정과 확인

- [X] T054 `tests/bench/brawl-load/real.mjs`: 실제 서버 프로토콜(v2 `join`, 기기 키마다 랜덤 UUID, 입구 칸으로 경기장 입장)로 R1과 같은 시나리오(모임·`SPREAD=1` 흩어짐, `move` 초당 10, 기술 초당 3, 처음 3초 버림)를
  재는 가짜 클라이언트 N명. 인자: 기준 URL·방 id·N·초. 방은 로컬에서는 `tests/e2e/helpers.ts` `createRoom`처럼 Turnstile 테스트 토큰으로 만들고, 미리보기에서는 운영자가 브라우저로 만든 방 id를 받는다
  (미리보기는 실제 Turnstile 비밀 키). WebSocket 입장에는 엣지 요청 제한이 없지만(`wrangler.jsonc` `ratelimits`는 방 만들기·비밀번호·신고만) 입장은 100ms 간격으로 나눈다. 같은 결과 형식(p50·p95·p99, 메시지/초, KB/초).
  - 결과: 경로는 `/api/rooms/<id>/ws`, 채널은 서버가 정하므로 두 채널은 같은 방에 프로세스 2개. 상대 도착은 `swing`의 (때린 사람, `at`)으로 맞춘다(nonce는 때린 사람 것에만).
    경기장에 못 들어간 클라이언트가 있거나 돌아온 `swing`이 0이면 exit 1(자체 검사), `corrections` 수도 찍는다. 미리 돌려 봄(로컬 `vite preview` 프로덕션 빌드, 20초 1회): 흩어짐 N=20 상대 p95 38.6·p99 45.3ms, 15.6KB/s.
- [ ] T055 R1 다시 재기(quickstart 4, 새 스크립트라 머지 뒤 한 번 실제로 돌려 결과를 여기와 PR에 남긴다): (1) 로컬 `npm run build` 뒤 `vite preview`의 실제 Worker(개발 서버는 모듈을 풀어 보내 느리다: 같은 배치 p95 55ms), (2) PR 미리보기 배포(배포마다 운영자 승인, 판례 2026-11-10-preview-environment), 각각 N = 2·4·8·12·20 모임과 12·20 흩어짐, 20초 × 3회.
  기준: 마지막 상대 도착 p95 ≤ 50ms, p99 ≤ 100ms, 클라이언트당 ≤ 50KB/s. 넘으면 새 판례(`docs/precedents/`)로 상한을 낮추고 spec SC-006·research R1을 고치며, 경기장 입장 제한 규칙을 스펙부터 더한다.
  미리보기에서 한 방 두 채널 20명씩도 재고, 넘으면 채널마다 DO로 나누는 방안(001 R6 변경)을 PushNotification으로 운영자에게 묻는다.
- [X] T056 SC-002 측정 `tests/bench/perf-brawl/perf-brawl.spec.ts`(따로 실행: `npx playwright test -c tests/bench/perf-brawl --project mobile --trace off`, `T056_FAKES=0`이면 기준선):
  Playwright 모바일 페이지 1개(Fast 4G 프리셋, 판례 2026-11-09-perf-4g) + T054 가짜 클라이언트 19명(같은 채널, 흩어짐)에서 잽 키 → 내 3D 화면 번쩍임(개발 빌드 훅 `swingsShown`)을 24회 재 p95 ≤ 100ms.
  - 결과: 소프트웨어 WebGL(컨테이너·CI)은 아무도 없어도 휴대폰 화면 한 프레임이 약 135ms라 0.1초를 판정할 수 없어 PR마다 도는 `tests/e2e` 밖에 두었다. SC-002 판정은 T060 실제 휴대폰.
    기준선(0명): 24회 모두 보임, p50 142.8·p95 176.8ms(한 프레임). 19명: 프레임 약 180ms, 페이지 응답이 몇 초씩 밀려 7분 안에 24회를 못 끝냄(같은 4코어에 workerd·가짜 클라이언트).
  - 찾은 결함: 번쩍임은 누른 뒤 120ms 동안만 켜져 프레임이 120ms보다 길면 안 보였고, 같은 프레임 안에서 누른 시각이 프레임 시각과 같아 놓쳤다(24회 중 6~9회만 보임).
    `flashTimer`(input.ts)로 "다음 프레임에 한 번은 켬". `tests/client/brawl-input.test.ts` 먼저 실패 확인(`flashTimer` 없음) 뒤 통과.
- [ ] T057 [P] 기존 E2E 전체·a11y.spec·perf.spec(SC-007: 4G 10초, 첫 3D 에셋 3MB)·`check:bundle`·문서 검사(`tasks.md` 등 400줄) 통과 확인, 결과를 여기에 적는다.
- [ ] T058 [P] quickstart 1~4 실행 기록, README에 난투 한 줄(필요하면). `rm -rf tests/bench/brawl-load/.wrangler`.
- [ ] T059 `/ponytail:ponytail-review`로 과잉 구현을 걷어낸 뒤 커밋(사용자 규칙). 스펙에 없는 기능이 들어갔으면 지운다.
- [ ] T060 운영자 판정(quickstart 5, US2 손맛·SC-001, SC-002: 경기장에 여러 명 있을 때 잽 → 번쩍임이 바로인지): 미리보기를 휴대폰·PC로 보고 R11 조정 후보를 함께 본다. 값을 바꾸면 조정표·스펙·판례를 함께 고친다. 판정이 끝날 때까지 그 PR은 머지하지 않는다.

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
- PR 단위: (1) T001(린트, 운영자 머지), (2) T002~T010, (3) US1 core(T012~T015·T018~T021), (4a) US1 DO·화면 상태(T011·T016·T022), (4b) 3D·입력·모습(T023~T025), (4c) 2D·E2E(T017·T026), (5) US2, (6a) US3 core·DO·관리자(T033~T036·T038~T042), (6b) US3 화면·E2E(T037·T043),
  (7a) US4 core·DO(T044·T045·T047·T048, 영역 밖 머무름 규칙 포함), (7b) US4 화면·E2E(T046·T049, `claude/`), (8) US5, (9) T054~T058, (10) T059~T060. `scripts/`·설정을 바꾸는 PR은 운영자 머지다.
- 각 PR은 테스트 실패 확인 → 구현 → 통과를 항목 끝에 적고, 머지되면 이 파일의 체크를 갱신한다.
