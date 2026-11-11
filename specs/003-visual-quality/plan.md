# Implementation Plan: 시각 품질 개선 (3D 그래픽·화면 디자인)

**Branch**: `claude/002-visual-quality` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-visual-quality/spec.md`

## Summary

001의 화면과 3D 장면을 기능 변경 없이 다듬는다. 3D는 아늑한 로우폴리 방향(Clarifications)으로, 테마마다 정한
"보이는 모습"(벽·하늘·바닥 색, 해·주변광, 안개)을 코드 데이터로 두고 직접 조명과 그림자를 넣는다. 지금 조명을
맡는 HDRI(테마당 1.6~1.8MB, 첫 로딩 에셋의 절반 이상)는 받지 않는 조명 환경으로 바꿔 SC-001 여유를 늘린다.
아바타 얼굴이 검게 보이는 것은 조명보다 에셋(캐릭터 8개 모두 피부색 0.013, 원본 그대로)이 원인이라 불러올 때 피부색을 바꾼다.
화면은 이미 쓰는 Astryx 토큰·컴포넌트로 기준을 맞추고, 기준 화면 스크린샷을 E2E로 만들어 CI 결과물로 남긴다.

## Technical Context

**Language/Version**: TypeScript 6.0, Node 22 (001과 같음)

**Primary Dependencies**: React 19, React Three Fiber·drei·Rapier·ecctrl(3D), Astryx 0.7.11 + StyleX(화면). 새 의존성 없음.

**Storage**: 없음(방 데이터·스키마 변경 없음)

**Testing**: Vitest(테마 모습 데이터, 색 대비 계산), Playwright E2E(기준 화면 스크린샷, 가로 스크롤·터치 크기, 3D 밝기 측정), 기존 perf.spec(SC-001)

**Target Platform**: 모바일 브라우저(인앱 브라우저 포함)와 데스크톱 브라우저, WebGL 2

**Project Type**: web (Vite SPA + Cloudflare Worker)

**Performance Goals**: 001 SC-001(4G 10초) 유지. 그림자를 넣어도 CI 소프트웨어 렌더링에서 기존 3D E2E가 통과하는 수준.

**Constraints**: 테마당 첫 로딩 에셋 5MB 이하(줄이는 방향), CC0만, i18n 키, 2D 대체 화면과 키보드 접근 유지(헌법 V)

**Scale/Scope**: 테마 3개, 화면 6종(목록, 방 만들기·수정, 방 3D, 방 2D, 관리자, 상태 화면), 아바타 8종

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 판정 | 근거 |
|------|------|------|
| I. 클라우드 전용 | 통과 | 스크린샷·측정 모두 CI와 클라우드 세션에서 돈다 |
| II. 개인정보 미수집 | 해당 없음 | 데이터 변경 없음 |
| III. 테스트 우선 | 통과 | 테마 모습 데이터·대비 계산은 단위 테스트 먼저, 3D 밝기·그림자·가로 스크롤은 E2E를 먼저 쓰고 실패를 본다 |
| IV. 렌더링과 방 상태 분리 | 통과 | 테마 모습은 `src/core/themes.ts`의 순수 데이터, 렌더링만 `room3d`가 읽는다 |
| V. 2D 대체 화면 필수 | 통과 | 2D 화면도 같은 디자인 기준(FR-012), a11y.spec 유지 |
| VI. 재발 방지는 구조로 | 통과 | 에셋 용량은 `check:bundle`에, 대비·터치 크기는 E2E에 넣는다 |
| VII. 에이전트 안전 경계 | 해당 없음 | 워크플로 변경 없음 |
| 제품 제약(CC0, i18n, 입력) | 통과 | 새 에셋 없음(HDRI 제거, 색 조정만). 새 문구는 ko.ts 키 |

## Project Structure

### Documentation (this feature)

```text
specs/003-visual-quality/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/visual-baseline.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/core/themes.ts                 # Theme에 look(보이는 모습) 추가
src/client/room/room3d/Scene.tsx   # 조명·그림자·벽·하늘·안개, HDRI 제거
src/client/room/room3d/RemoteAvatar.tsx  # Avatar 그림자, 피부 재질 색(R4)
src/client/board/*, room/*, admin/*      # Astryx 기준 정리
public/assets/hdri/                # 삭제(R1), CREDITS.md·assets.sha256 갱신
scripts/theme-previews.ts          # 새 모습으로 미리보기 다시 찍기
tests/core/themes.test.ts          # look 검사
tests/e2e/visual.spec.ts           # 기준 화면, 3D 밝기·그림자, 가로 스크롤·터치 크기
.github/workflows/ci.yml           # 기준 화면을 항상 결과물로 올림(운영자 머지 경로)
```

**Structure Decision**: 001의 구조를 그대로 쓴다. 새 모듈 없이 테마 데이터에 `look`을 더하고 장면이 읽는다.

## Complexity Tracking

없음.
