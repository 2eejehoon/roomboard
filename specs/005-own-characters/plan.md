# Implementation Plan: 자체 제작 캐릭터

**Branch**: `claude/005-own-characters` | **Date**: 2026-11-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-own-characters/spec.md`

## Summary

외부 팩 캐릭터 8종을 저장소의 생성 스크립트(헤드리스 Blender Python)로 만든 오리지널 캐릭터로 바꾼다. 몸·머리 모양·윗옷 모양을
같은 뼈대(16개)에 붙는 부위 GLB로 만들고, 색은 정점 색 대신 팔레트 번호로 칠해 모습(FR-010)을 런타임에 조합한다. 동작은 모든 모습이
나눠 쓰는 한 벌의 GLB로 따로 받는다. 기술 동작은 선딜·활성·후딜 키 자세를 가진 짧은 클립이고, 재생 길이는 조정표에서 읽는다(FR-014).
스타일 방향은 시안 3종을 실제 방에 넣어 찍은 뒤 운영자가 고른다([research.md](research.md) R1). 성능 예산은 측정 스크립트가 CI에서 확인한다(아래 "성능 측정").

## Technical Context

**Language/Version**: TypeScript 6.0, Node 22 (001과 같음). 생성 스크립트는 Python 3.13 + `bpy==5.2.5`(Blender 5.2 LTS, PyPI 휠)

**Primary Dependencies**: 001·004 그대로(React 19, R3F·drei, three). 새 런타임 의존성 없음. 생성·가공 도구는 `bpy==5.2.5`, `@gltf-transform/cli@4.5.1`(001 `fetch-assets.sh`와 같은 고정 버전)

**Storage**: 없음. 모습 번호는 기기 키에서 계산해 `welcome`·`peer_joined`에 실어 보낸다(001 `avatarId` 자리, R4)

**Testing**: Vitest(모습 계산, 동작 선택·우선순위, 조정표 → 동작 길이), Python 단위 검사(생성 스크립트의 예산 수치), Playwright(기준 화면, 그리기 호출·삼각형, 4G 첫 로드, CPU 4배 프레임)

**Target Platform**: 모바일·데스크톱 브라우저(WebGL 2, 없으면 2D)

**Project Type**: web (Vite SPA + Cloudflare Worker)

**Performance Goals**: spec FR-020~FR-027

**Constraints**: 헌법 에셋 규칙(생성 스크립트 + `CREDITS.md`), 001 SC-001(4G 10초), 003 SC-002(얼굴 밝기), i18n, 2D 대체 화면

**Scale/Scope**: 모습 조합 약 10만(FR-010), 동작 약 25개(004) + 006 자리, 채널 20명

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 판정 | 근거 |
|------|------|------|
| I. 클라우드 전용 | 통과 | `bpy` 휠은 클라우드 세션·CI에서 `pip install`한다. 명령은 `scripts/characters/README.md`와 quickstart |
| II. 개인정보 미수집 | 통과 | 새 필드는 모습 번호(기기 키에서 계산, 사람을 식별하지 않음)와 자세 메시지(경기장 입력 상태). PR에 "개인정보 아님" 명시 |
| III. 테스트 우선 | 통과 | 모습 계산·동작 선택은 단위 테스트 먼저, 예산은 측정 스크립트를 먼저 쓰고 지금 캐릭터로 기준값을 잰다 |
| IV. 렌더링과 방 상태 분리 | 통과 | 모습 계산(`src/core/look.ts`)과 동작 선택(`src/core/brawl/pose.ts`: 사건·상태 → 동작 이름·단계·진행률)은 순수 모듈. 화면은 그 결과로 클립을 재생만 한다 |
| V. 2D 대체 화면 | 통과 | 얼굴 아이콘과 대체 텍스트, 옆 그림 점 색(FR-030~032) |
| VI. 재발 방지는 구조로 | 통과 | 예산은 문서가 아니라 `scripts/characters/budget.json` + CI 검사. 모습·동작 이름은 한 목록에서 타입으로 나온다 |
| VII. 에이전트 안전 경계 | 해당 없음 | 워크플로는 CI에 검사 한 단계를 더할 뿐 |
| 제품 제약(에셋) | 통과 | 모든 캐릭터 파일은 `scripts/characters/`가 만든다. `CREDITS.md`에 스크립트·명령. 지금 Quaternius 캐릭터 행은 지운다(FR-042) |

Phase 1 뒤 다시 봄: 위반 없음. 자세 메시지는 프로토콜 변경이라 `contracts/websocket.md`를 v3로 올리고 `PROTOCOL_VERSION`을 바꾼다(R5).

## 성능 측정

각 예산 값은 `scripts/characters/budget.json` 한 곳에 두고, 아래 측정이 그 파일을 읽는다. 기준값(지금 캐릭터)은 [research.md](research.md) R2.

| 항목(FR) | 상한 | 측정 방법 | 어디서 |
|---|---|---|---|
| 파일 크기(020) | 모습 부위 합 60KB, 동작 한 벌 250KB, 20명 합 1MB | 생성 뒤 meshopt 압축한 파일 바이트. 20명 합은 가장 큰 부위 조합 20개 + 동작 한 벌 | `scripts/characters/check.mjs`, CI |
| 삼각형(021) | LOD0 4,000(외곽선 포함), LOD1 1,200 | glTF-Transform `inspect`의 그리는 삼각형 수를 부위 조합마다 합산 | 같은 스크립트 |
| 텍스처(022) | 없음 또는 팔레트 1장 64×64·8KB | GLB의 이미지 수·크기 | 같은 스크립트 |
| 뼈(023) | 24 | 스킨의 joints 수 | 같은 스크립트 |
| 그리기 호출(024) | 캐릭터당 2(가까이)/1(멀리), 20명 장면 150 | 개발 빌드 테스트 훅이 `renderer.info.render.calls`·`triangles`를 돌려준다. 20명 방(브라우저 1개 + 가짜 참가자 19)에서 잰다 | `tests/e2e/characters-perf.spec.ts`, CI |
| 첫 로드(025) | 001 SC-001 10초 | 기존 `perf.spec.ts`(Fast 4G, gzip 프록시, 판례 perf-4g)에 20명 방을 더한다 | CI(모바일 프로젝트) |
| 프레임(026) 자동 | 캐릭터 갱신 프레임당 4ms | CDP `Emulation.setCPUThrottlingRate(4)` + 모바일 에뮬레이션, 20명 방에서 10초 동안 동작 갱신(믹서·뼈) 구간을 `performance.now()`로 잰 p95 | 같은 E2E |
| 프레임(026) 실기기 | 평균 30fps, 1% 낮은 20fps | 미리보기 배포를 저사양 기준기기(또는 운영자 휴대폰)로 열고, 개발용 쿼리 `?fps=1`이 30초 프레임 시간을 화면에 띄운다(프로덕션에서도 켤 수 있는 읽기 전용 표시) | 미리보기, 사람 |
| LOD(027) | 12m/25m, 저사양 8m | 테스트 훅으로 참가자 거리를 바꿔 LOD 단계와 갱신 주기를 읽는다 | 같은 E2E |

- CI의 WebGL은 SwiftShader(소프트웨어)라 GPU 시간과 fps는 실기기를 대신하지 못한다. 자동 측정은 그리기 호출·삼각형·CPU 쪽 갱신 시간만 판정하고, fps는 미리보기 실기기로 잰다.
- KTX2를 쓰면 Basis 변환기(wasm 약 0.2MB)도 첫 로드에 더해 잰다. 지금 설계는 텍스처가 없거나 팔레트 1장이라 쓰지 않는다(FR-022).

## Project Structure

### Documentation (this feature)

```text
specs/005-own-characters/
├── plan.md
├── research.md        # R1 시안·스타일 선택, R2 기준값, R3 부위·팔레트, R4 모습 전달, R5 자세 메시지, R6 동작 재생
├── style-guide.md     # 확정 스타일(맵 작업도 따른다)
├── data-model.md      # Look, Part, Palette, Clip, Budget
├── contracts/websocket.md  # v3: look 필드, stance 메시지
├── quickstart.md
└── tasks.md           # /speckit-tasks
```

### Source Code (repository root)

```text
scripts/characters/
├── README.md          # 설치(pip install bpy==5.2.5)와 다시 만드는 명령
├── generate.py        # 부위·뼈대·동작 → GLB (스타일 가이드 값을 읽는다)
├── style.json         # 스타일 가이드의 수치(비율·팔레트·외곽선 등), style-guide.md와 같은 값
├── budget.json        # 성능 예산(FR-020~024)
└── check.mjs          # 예산 검사(CI)
public/assets/characters/   # parts/*.glb, clips.glb, icons/*.png (생성 결과)
src/core/look.ts            # 기기 키 → 모습 번호 (identity.ts의 avatarFor를 대체)
src/core/brawl/pose.ts      # 사건·자세 → 동작 이름·단계·진행률 (FR-013~016)
src/core/protocol.ts        # look 필드, stance 메시지 (v3)
src/core/brawl/brawl-session.ts  # stance 알림
src/client/room/room3d/Character.tsx  # 부위 조합·팔레트·LOD·동작 재생 (RemoteAvatar의 Avatar를 대체)
src/client/room/room2d/     # 얼굴 아이콘, 점 색
tests/core/look.test.ts, tests/core/brawl/pose.test.ts
tests/e2e/characters-perf.spec.ts, visual.spec.ts(기준 화면 추가)
```

**Structure Decision**: 001·004 구조를 그대로 쓴다. 판정과 떨어진 "무엇을 보여 줄지"(모습 번호, 동작 단계)는 core 순수 함수, 그리는 일은 room3d.

## Complexity Tracking

없음.
