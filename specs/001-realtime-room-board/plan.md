# Implementation Plan: 실시간 3D 방 게시판 v1

**Branch**: `speckit/plan-001` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-realtime-room-board/spec.md`

## Summary

게시글 하나가 실시간 3D 방 하나가 되는 익명 게시판. 프론트는 Vite + React + React Three Fiber(충돌 Rapier, 3인칭 ecctrl),
백엔드는 Cloudflare Worker 하나에 방마다 Durable Object 하나(WebSocket Hibernation), 영구 데이터는 D1. 방 상태 규칙(채널 배정,
이동 검증, 채팅 필터·속도 제한, 닉네임 생성, 프로토콜)은 `src/core`의 순수 TypeScript 모듈로 두고 DO와 클라이언트가 같이 쓴다.
3D와 2D 화면은 같은 클라이언트 상태를 그린다. 근거와 무료 한도는 [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 6.0, Node 22 (빌드·테스트), 브라우저 ES2022, Cloudflare workerd

**Primary Dependencies**: vite 8.3, @cloudflare/vite-plugin 1.67, wrangler 4.158, react 19.3, three 0.187, @react-three/fiber 9.8,
@react-three/drei 10.7, @react-three/rapier 2.2, ecctrl 2.0 (`ecctrl/input` 조이스틱 포함), hono 4.13, zod 4.6 (research R1)

**Storage**: Cloudflare D1 (rooms, reports). 방 DO는 SQLite 백엔드 클래스로 선언하지만(무료 플랜 조건) v1에서는 DO 저장소에
쓰지 않고 메모리·소켓 attachment만 쓴다. 기기 키는 localStorage.

**Testing**: Vitest 4.1 (`core` Node 프로젝트 + `worker` 프로젝트 `@cloudflare/vitest-pool-workers` 0.23), Playwright 1.65

**Target Platform**: 최신 모바일·데스크톱 브라우저(Chrome, Safari, Samsung Internet, Firefox), Cloudflare Workers 무료 플랜으로 시작

**Project Type**: 웹 애플리케이션 (SPA + Worker, 한 저장소 한 패키지)

**Performance Goals**: 같은 채널 이동·채팅 전달 95%가 1초 이내(SC-002), 채널 20명에서도 유지(SC-003), 첫 방 입장까지 4G 10초 이내(SC-001),
3D 화면 중급 휴대폰 30fps 이상

**Constraints**: Workers 요청당 CPU 10ms, DO 요청 무료 100,000/일(들어오는 WS 메시지 20:1), D1 쓰기 100,000행/일, 테마당 첫 로딩 에셋 5MB 이하,
개인정보 저장 금지, 로컬 설치 금지

**Scale/Scope**: 채널당 20명, 무료 한도 기준 하루 약 370 사용자·시간(research R2). 화면: 목록, 방 만들기, 방(3D/2D), 수정·삭제, 관리자

## Constitution Check

*GATE: Phase 0 전에 통과, Phase 1 뒤 재확인.*

| 원칙 | 확인 내용 | Phase 0 전 | Phase 1 후 |
|---|---|---|---|
| I. 클라우드 전용 | 모든 도구가 npm 의존성. 로컬 개발도 workerd를 쓰는 `wrangler`로 세션 안에서 실행. 미리보기는 Actions에서 배포 | ✅ | ✅ quickstart가 세 환경 기준 |
| II. 개인정보 미수집 | 로그인 없음. D1 컬럼에 PII 없음. IP는 rate limit 키로 요청 중에만 사용·미기록. 기기 키는 원문 미저장, 신고에는 pepper 해시만 | ✅ | ✅ data-model 컬럼 검토, Q14 감사 시나리오 |
| III. 테스트 우선 | Vitest(core, worker) + Playwright(컨텍스트 2개 이상). tasks에서 각 스토리마다 테스트 작업이 구현보다 먼저 | ✅ | ✅ quickstart Q1~Q14가 테스트 목록 |
| IV. 렌더링·상태 분리 | `src/core`는 React·three·DOM import 금지(린트 규칙으로 강제). 테스트 훅은 DEV 전용, 번들 검사 | ✅ | ✅ 구조와 websocket.md 테스트 훅 절 |
| V. 2D 대체 화면 | 2D 컴포넌트가 입장·참가자·채팅·신고 전부 지원. WebGL 없으면 자동 2D, 3D 청크 미로딩. SEO용 HTMLRewriter | ✅ | ✅ research R8, Q4·Q5 |
| 제품·품질 제약 | CC0 에셋 + CREDITS.md, i18n `t()`(하드코딩 문자열 린트), PC·모바일 입력, 욕설 필터·신고·속도 제한·관리자 삭제 | ✅ | ✅ |
| 개발 워크플로 | 브랜치 → PR, PR 미리보기 배포(DO 제약으로 PR마다 별도 Worker, research R3) | ✅ | ✅ |

위반 없음. Complexity Tracking 비움.

## Project Structure

### Documentation (this feature)

```text
specs/001-realtime-room-board/
├── spec.md
├── plan.md              # 이 문서
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── openapi.yaml     # HTTP API
│   └── websocket.md     # WebSocket 메시지
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks에서 생성
```

### Source Code (repository root)

```text
src/
├── core/                 # 순수 방 상태 로직. React/three/DOM/Workers API import 금지
│   ├── protocol.ts       # WS 메시지 zod 스키마·타입 (websocket.md의 진실의 원천)
│   ├── api-schemas.ts    # HTTP 요청 zod 스키마 (openapi.yaml과 일치)
│   ├── themes.ts         # 테마 3개, 경계, 기본 오브젝트
│   ├── room-data.ts      # RoomData 생성·테마 변경
│   ├── channels.ts       # assignChannel
│   ├── movement.ts       # 이동 검증(경계, 속도)
│   ├── rate-bucket.ts    # 토큰 버킷
│   ├── chat-filter.ts    # 욕설 필터 + 금칙어 데이터 로딩
│   ├── identity.ts       # nicknameFor / avatarFor (기기 키 → 결정적)
│   └── room-session.ts   # 참가자 집합에 메시지를 적용해 보낼 메시지 목록을 돌려주는 순수 상태 기계
├── worker/
│   ├── index.ts          # Hono 라우터, 정적 에셋, /rooms/:id HTML 주입
│   ├── room-do.ts        # RoomDurableObject: Hibernation 소켓 ↔ room-session 연결
│   ├── rooms.ts          # 방 CRUD (D1)
│   ├── reports.ts        # 신고·관리자
│   ├── password.ts       # PBKDF2
│   ├── turnstile.ts
│   └── rate-limit.ts     # Rate Limiting 바인딩 래핑
├── client/
│   ├── main.tsx
│   ├── i18n/{ko.ts, t.ts}
│   ├── net/room-socket.ts        # 재연결 포함 WS 클라이언트 → 클라이언트 방 상태 스토어
│   ├── state/room-store.ts       # 3D·2D가 같이 읽는 상태 (core 타입 사용)
│   ├── board/                    # 목록, 방 만들기, 수정·삭제
│   ├── room/RoomPage.tsx         # WebGL 감지, 3D/2D 전환
│   ├── room/room2d/              # 2D 화면 (시맨틱 HTML)
│   ├── room/room3d/              # R3F 장면 (동적 import)
│   ├── admin/
│   └── test-hooks.ts             # DEV 전용 window.__roomboard
└── data/profanity-ko.txt
migrations/               # D1 SQL
public/assets/            # CC0 GLB·HDRI + CREDITS.md
tests/
├── core/                 # Vitest Node
├── worker/               # Vitest workerd (D1, DO, API)
└── e2e/                  # Playwright (Q1~Q14)
.github/workflows/        # ci.yml, preview.yml, preview-cleanup.yml
wrangler.jsonc, vite.config.ts, vitest.config.ts, playwright.config.ts
```

**Structure Decision**: 한 패키지 한 Worker. 프론트와 백엔드를 나누지 않고 `@cloudflare/vite-plugin`으로 SPA와 Worker를 같이
빌드·배포한다. 경계는 디렉터리로 지킨다: `src/core`는 아무 런타임에도 기대지 않고, `worker`와 `client`만 `core`를 import한다.
`core`가 다른 계층을 import하지 못하게 린트 규칙(import 제한)으로 막는다(헌법 원칙 IV).

## Complexity Tracking

해당 없음.

## 구현 순서 메모 (tasks 입력)

1. 저장소 기반: package.json, tsconfig, Vite + Cloudflare 플러그인, Vitest 2개 프로젝트, Playwright, CI 워크플로, 린트 규칙.
2. **측정 먼저**: PBKDF2 100,000회의 workerd CPU 시간(research R5), `/rooms/:id` HTML 주입 CPU 시간.
3. `src/core` 테스트 → 구현 (스토리 공통 기반).
4. US1 + US2 (P1) → US3·US4·US5 (P2) → US6·US7 (P3). 각 스토리는 테스트 먼저.
5. 미리보기 배포 워크플로는 Cloudflare Secrets가 준비되면 붙인다.
