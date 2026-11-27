# Implementation Plan: 넉백 난투

**Branch**: `claude/004-knockback-brawl-plan` | **Date**: 2026-11-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-knockback-brawl/spec.md`

## Summary

방 옆에 블록 섬 경기장을 두고, 맨손 기술로 서로를 날려 떨어뜨리는 놀이를 001의 방 DO 위에 더한다. 판정은 방 DO 하나가 하고
(FR-031), 넉백은 시작점·속도·세기만 보내 서버와 모든 화면이 같은 순수 함수로 궤적을 계산한다(research R3). 서버는 tick 없이
메시지를 받을 때 판정하고, 궤적의 다음 사건 시각에 alarm을 건다(R2). 가짜 클라이언트 측정(R1)에서 20명이 한 채널에서 계속
기술을 써도(가장 무거운 배치) 서버가 더하는 지연 p95 약 40ms라 한 판의 상한은 채널 정원과 같은 20명이다. 모든 수치는 `TUNING` 한 곳, 보이는 모습은
`LOOKS` 한 곳에서 읽는다(R7).

## Technical Context

**Language/Version**: TypeScript 6.0, Node 22 (001과 같음)

**Primary Dependencies**: 001 그대로(React 19, R3F·drei·Rapier·ecctrl, Hono, zod, Astryx). 새 의존성 없음. 넉백 궤적은 Rapier가 아니라
`src/core/brawl/flight.ts`(R3). 블록은 instanced mesh와 Rapier 고정 콜라이더(걷기용).

**Storage**: D1 변경 없음. DO 저장소 키 `arena:<채널>`(지은 블록 차이·진행 중인 판, 채널이 비면 지움, R6), 소켓 attachment에 경기 참가자 상태.

**Testing**: Vitest(core 판정·궤적·판, worker 방 DO), Playwright(브라우저 2~3개 E2E, 2D), 부하 측정 `tests/bench/brawl-load`(R1)

**Target Platform**: 모바일·데스크톱 브라우저(WebGL 2, 없으면 2D), Cloudflare Workers + Durable Objects

**Project Type**: web (Vite SPA + Cloudflare Worker)

**Performance Goals**: SC-002(입력 → 내 화면 이펙트 0.1초, 미리 보이기로, 20명 방의 휴대폰에서 따로 잼), 서버 몫 지연 p95 ≤ 50ms·p99 ≤ 100ms(N=20, R1), 클라이언트당 내려받기 ≤ 50KB/s

**Constraints**: 001 SC-001(4G 10초) 유지(SC-007), 경기장 그림은 헌법 에셋 규칙(CC0 또는 자체 제작)·첫 로딩 에셋 상한 안, 메시지 2KB(클라이언트 → 서버), i18n 키, 2D 대체 화면

**Scale/Scope**: 채널당 최대 20명이 한 경기장(SC-006 = 20), 기술 4종(잽 3연타·강펀치·던지기 + 방어·구르기), 블록 2종, 판 1모드

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 판정 | 근거 |
|------|------|------|
| I. 클라우드 전용 | 통과 | 측정·테스트 모두 클라우드 세션과 CI에서 돈다. 측정 절차는 `tests/bench/brawl-load`와 quickstart 4에 있다 |
| II. 개인정보 미수집 | 통과 | 새 데이터는 피해 %·블록·판뿐이고 사람이 있는 동안만 DO에 있다(R6). 신원은 `peerId`·랜덤 닉네임. 흔들림 끄기 localStorage는 개인정보 아님 |
| III. 테스트 우선 | 통과 | 공식·궤적·판은 core 단위 테스트 먼저, 방 DO는 worker 테스트, 멀티플레이는 브라우저 2~3개 E2E |
| IV. 렌더링과 방 상태 분리 | 통과 | 판정·궤적·경기장·판은 `src/core/brawl/`의 순수 모듈. 화면은 `launch`를 core 함수로 재생할 뿐 판정하지 않는다(FR-031) |
| V. 2D 대체 화면 | 통과 | 2D 옆 그림 + 버튼 + 글 기록으로 같은 놀이(FR-033, R8) |
| VI. 재발 방지는 구조로 | 통과 | 수치는 `TUNING` 하나, `src/core/brawl/**` 숫자 상수 린트(R7). 메시지 예시는 스키마 테스트 |
| VII. 에이전트 안전 경계 | 해당 없음 | 워크플로 변경 없음. 린트 설정을 바꾸는 PR도 세션이 머지(판례 2026-11-27-operator-delegation) |
| 제품 제약 | 통과 | 스택 변경 없음. 경기장은 사용자 콘텐츠라 방 신고 + 관리자 되돌리기 + 블록 요청 제한(FR-040, R9·R10). 욕설 필터는 블록에 맞지 않아 두지 않음(spec 판례) |

Phase 1 뒤 다시 봄: 위반 없음. DO 저장소는 채널이 비면 지우는 잠들기 대비 메모리다(FR-037을 이 PR에서 그렇게 고침, R6).

## Project Structure

### Documentation (this feature)

```text
specs/004-knockback-brawl/
├── plan.md
├── research.md            # R1 부하 측정, 시간 모델, 같은 궤적, 조정 후보
├── data-model.md          # 조정표, 경기장, Fighter, Launch, Match, 모습 목록
├── quickstart.md
├── contracts/websocket.md # v2 추가 메시지
├── contracts/openapi.yaml # 관리자 경기장 되돌리기
└── tasks.md               # /speckit-tasks
```

### Source Code (repository root)

```text
src/core/brawl/tuning.ts     # TUNING (FR-030)
src/core/brawl/knockback.ts  # 피해·넉백 세기·경직·타격 정지·방어·방향 틀기 (FR-002·003·010·020·028)
src/core/brawl/flight.ts     # Launch → 궤적, 착지·벽·넉아웃 (FR-019, R3)
src/core/brawl/arena.ts      # 기본 경기장, 칸 차이, 앞 칸 규칙, 입구·출구, 평화 구역 (FR-013~018)
src/core/brawl/fighter.ts    # 기술·방어·구르기·공중 동작 허용과 상태 (FR-007~012, 029, 034)
src/core/brawl/match.ts      # 떨어뜨리기 시작·탈락·순위 (FR-025~027)
src/core/brawl/brawl-session.ts  # 채널 하나의 난투: 메시지 → Outbox, 사건 시각 목록
src/core/protocol.ts         # v2 메시지 (contracts/websocket.md). 001 websocket.md의 welcome 예시(v: 1)도 같은 PR에서 고친다
src/core/room-session.ts     # 난투 메시지를 채널의 BrawlSession으로, move에 입구·출구·날아가는 중 처리
src/core/movement.ts         # 테마 범위 또는 경기장 범위
src/core/themes.ts           # 테마마다 경기장 입구 칸
src/worker/room-do.ts        # alarm 사건 처리, arena:<채널> 저장·삭제, resetArenas() RPC
src/worker/admin.ts, index.ts    # POST /admin/rooms/:roomId/arena-reset
src/client/brawl/looks.ts    # LOOKS (FR-030a)
src/client/brawl/            # 미리 보이기·궤적 재생·서버 시계 어림(store), 키·버튼 입력, 흔들림 설정
src/client/room/room3d/      # 경기장 블록, 꼬리, 머리 위 %, 기술 버튼(TouchControls)
src/client/room/room2d/      # 옆 그림(SVG), 깊이 줄, 기술·블록 버튼, 글 기록
src/client/admin/            # 신고된 방의 "경기장 되돌리기" 버튼
src/client/i18n/ko.ts        # 새 문구 키
public/assets/               # 블록·효과음(있으면, CC0 또는 자체 제작), CREDITS.md
tests/core/brawl/            # 공식·궤적·경기장·Fighter·판 단위 테스트
tests/worker/brawl*.test.ts  # 방 DO 난투·되돌리기
tests/e2e/us*-brawl*.spec.ts # 브라우저 2~3개
tests/bench/brawl-load/      # 부하 측정(R1). 구현 뒤 실제 서버용 시나리오와 모바일 SC-002 측정을 더한다
```

**Structure Decision**: 001 구조를 그대로 쓴다. 난투 규칙은 `src/core/brawl/`에 모으고, `RoomSession`이 채널마다 `BrawlSession`을 갖는다.
방 DO는 소켓·alarm·저장소만 맡는다(001과 같은 역할 분담).

## Complexity Tracking

없음.
