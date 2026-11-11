# Tasks: 시각 품질 개선 (3D 그래픽·화면 디자인)

**Input**: `specs/003-visual-quality/` (plan.md, spec.md, research.md, data-model.md, contracts/visual-baseline.md, quickstart.md)

**Tests**: 헌법 III(테스트 우선)에 따라 각 이야기의 테스트를 먼저 쓰고 실패를 확인한 뒤 구현한다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일, 끝나지 않은 작업에 기대지 않음 → 병렬 가능
- **[Story]**: US1(3D 공간), US2(화면 디자인), US3(로딩·빈 상태)

---

## Phase 1: Setup

- [x] T001 `tests/e2e/visual.spec.ts` 뼈대와 `tests/e2e/helpers.ts`의 스크린샷 도우미 `shot(page, name)`: [contracts/visual-baseline.md](contracts/visual-baseline.md)의 이름 규칙(`<화면>-<크기>.png`, `desktop` 1280×720, `phone` 412×839)으로 `test-results/visual/`에 저장. 아직 검사 없음.
- [x] T002 `.github/workflows/ci.yml`: E2E 뒤 `if: always()`로 `test-results/visual/`을 결과물 `visual`(보관 7일)로 올린다. 허용 경로 밖이라 운영자 머지(CLAUDE.md 머지 규칙). — 머지됨(#48, 운영자 머지). 첫 실행 확인은 #49 CI(visual.spec가 처음 들어간 실행)에서.

---

## Phase 2: Foundational

- [x] T003 [P] `tests/core/themes.test.ts`(먼저, 실패 확인): 테마 3개 모두 `look`이 있고 data-model 규칙을 지킨다 — "`look.kind` `indoor` | `outdoor`", "색은 `#rrggbb`", "indoor는 `wall`, outdoor는 `fog`(시작 < 끝, 끝은 경계 대각선 이상)", "`sun` 세기 0 초과, 방향 y < 0", "`ambient` 세기 0 초과", 테마끼리 `sun` 또는 `ambient` 색이 다르다.
- [x] T004 `src/core/themes.ts`: `Theme.look` 타입과 테마 3개의 값(카페: 따뜻한 실내, 도서관: 차분한 실내, 정원: 밝은 실외). T003 통과.
- [x] T005 [P] `tests/e2e/helpers.ts`: 3D 장면 스크린샷에서 영역 평균 밝기를 재는 `brightness(page, box, rgb)`(브라우저가 PNG를 디코드). R7 측정에 쓴다. 단위 검사는 흰·검정 단색 영역으로 `tests/e2e/visual.spec.ts` 첫 테스트에서 — 완료.

---

## Phase 3: User Story 1 — 방에 들어가면 공간이 완성된 장소로 보인다 (P1) 🎯 MVP

**Goal**: 테마별 벽·하늘, 직접 조명과 그림자, 피부색이 보이는 아바타. HDRI 제거.

**Independent Test**: `npx playwright test visual -g room3d` — 테마별 3D 첫 화면 자동 검사 통과, 운영자가 `room3d-<테마>-phone.png`와 미리보기 배포로 판정.

### Tests (먼저 작성, 실패 확인)

- [x] T006 [P] [US1] `tests/e2e/visual.spec.ts` `room3d-<테마>`: 스폰 위치 첫 화면. (a) 화면 위쪽 20% 띠가 `look.sky`/`look.wall`과 다른 단일 배경색 `#d9cbb8`이 아니다(FR-001), (b) 내 아바타 머리 영역 평균 밝기 ≥ 화면 평균의 절반(SC-002), (c) 가구 바로 아래 바닥 영역이 그 옆 바닥보다 어둡다(FR-002). 지금 코드에서 (b)·(c) 실패 확인. — 완료: (a)·(b)만 자동화. 001 코드에서 (a) 배경 단색 비율 0.56~0.87(기준 < 0.2), (b) 머리/화면 밝기 비 휴대폰 0.34~0.47(기준 ≥ 0.5)로 실패, 003 코드 0.65~0.87로 통과. 데스크톱은 아바타가 작아 001도 0.59~0.69로 통과한다(휴대폰 크기에서만 가려진다). 아바타는 기기 키를 고정해 `char-01`로 정한다(옷·머리가 검지 않음). (c) 그림자는 위치가 테마·해 방향마다 달라 자동 검사를 두지 않고 스크린샷 판정으로 남긴다.
- [x] T007 [P] [US1] `tests/e2e/perf.spec.ts`: 첫 3D 에셋 합계 상한을 5MB에서 3MB로 낮춘다(HDRI 제거 뒤 약 1.3MB 예상, research R1). 지금 코드에서 실패 확인. — 완료: 로컬 SC-001 3.9초, 첫 3D 에셋 약 207KB(001 약 1.8MB).

### Implementation

- [x] T008 [US1] `src/client/room/room3d/Scene.tsx`: `Environment files=…hdr` 제거, `look.sun`(방향광, 그림자 켬, 그림자 카메라를 `bounds`에 맞춤, 지도 크기 `(pointer: coarse)`면 1024 아니면 2048), `look.ambient`(반구광). 반사 환경은 두지 않는다(research R1 측정). — 완료. 반구광 세기는 반사 환경이 빠진 만큼 2~2.2로 올렸다. Canvas `shadows`.
- [x] T009 [US1] `src/client/room/room3d/Scene.tsx`: `Floor`가 `look.floor` 색·그림자 받기, indoor면 경계 4면에 안쪽만 그리는 벽(`look.wall`, 높이 `bounds` y), outdoor면 `look.sky` 배경과 `look.fog` 안개(research R3). `<color attach="background">`는 `look.sky`.
- [x] T010 [US1] `src/client/room/room3d/Scene.tsx` `Furniture`: 복제한 모델의 메시가 그림자를 드리우고 받는다.
- [x] T011 [US1] `src/client/room/room3d/RemoteAvatar.tsx` `Avatar`: 메시 그림자 드리움, `Skin` 재질을 복제해 아바타별 피부색 표(data-model "Avatar 피부색 표", `char-01`~`char-08`)로 칠한다(research R4). 표는 `src/core/themes.ts` 옆이 아니라 아바타 코드(`src/core/identity.ts`의 아바타 목록 옆)에 둔다.
- [x] T012 [US1] `public/assets/hdri/` 삭제, `public/assets/CREDITS.md`(HDRI 절·용량 절)·`scripts/assets.sha256`·`scripts/fetch-assets.sh`에서 HDRI 제거. T006·T007 통과.
- [x] T013 [US1] `scripts/theme-previews.ts` 실행해 `public/assets/previews/*.jpg` 다시 찍기(HDRI 대기 문구 정리). 기존 3D E2E(us1·us4·us5) 통과 확인. — 완료: 로컬 E2E 전체 77개 통과(5.2분). 앞선 전체 실행 한 번에서 모바일 T046 '긴 프레임 뒤 라벨'이 실패(206→315)했으나 단독 4회·us1 파일 3회·전체 재실행에서 재현 안 됨. CI에서 다시 나오면 원인을 본다.

---

## Phase 4: User Story 2 — 화면들이 한 디자인으로 정돈돼 보인다 (P2)

**Goal**: Astryx 토큰·컴포넌트 기준으로 모든 화면 정리(research R5).

**Independent Test**: `npx playwright test visual -g "list|create|room2d|admin"` — 대비·터치 크기·가로 스크롤 검사 통과, 운영자가 스크린샷 판정.

### Tests (먼저 작성, 실패 확인)

- [x] T014 [P] [US2] `tests/e2e/visual.spec.ts` `list`·`create`·`room2d`·`admin`(데스크톱·휴대폰): 본문 글자 대비 ≥ 4.5:1(SC-003, 계산된 글자색·배경색으로 WCAG 상대 휘도), 휴대폰에서 버튼·입력칸·링크 ≥ 44×44px(SC-003), `scrollWidth <= clientWidth`(SC-005). 지금 코드에서 실패 항목을 기록한다. — 완료: 대비는 반투명 배경을 아래와 섞어 WCAG 비로 잰다. 터치 크기는 클릭을 받는 가장 가까운 상자(입력칸 틀, 라디오 카드)로 잰다. 고치기 전 휴대폰 4화면 실패: Astryx 컨트롤 최대 36px(입력칸 틀 32px, 버튼 32px, 링크 24px), 데스크톱 대비는 모두 통과.
- [x] T015 [P] [US2] `tests/e2e/visual.spec.ts` `room3d-cafe`(휴대폰): 머리글·채팅이 가리는 높이 합이 화면 높이의 절반 이하(FR-006), 머리글 글자 대비 ≥ 4.5:1(반투명 면 위). — 완료: 고치기 전 머리글 배경 불투명도 0(실내 하늘 #3b2f28 위 검은 글자), 휴대폰 점프 버튼 글자 대비 1.43으로 실패.

### Implementation

- [x] T016 [US2] `src/client/board/BoardPage.tsx`: 방 항목을 Astryx Card로(테마 그림 `/assets/previews/<테마>.jpg` + 제목 + 테마 이름 + 인원), 휴대폰 한 줄 한 장(FR-007). `contracts/screens.md`(001) S1 갱신. — 완료: Card 대신 `ListItem`에 테마 그림(`startContent`)과 왼쪽 정렬. 기존 E2E가 목록 항목·링크 구조에 기대고 있어 구조는 유지했다. 검사: 방마다 미리보기 그림.
- [x] T017 [P] [US2] `src/client/board/CreateRoomPage.tsx`·`EditRoomPage.tsx`(`RoomFields`는 `CreateRoomPage.tsx`에 있음): 인라인 크기·간격을 토큰으로, 테마 선택 그림 유지(FR-008), 터치 크기. — 완료(변경 없음): T014 검사(대비·터치·가로 스크롤)가 통과해 고칠 것이 없었다. 남은 인라인 스타일은 위치·겹침용이라 토큰으로 바꾸지 않았다.
- [x] T018 [P] [US2] `src/client/room/RoomPage.tsx`·`ChatPanel.tsx`: 3D 위 머리글·채팅을 반투명 면(토큰 색) 위에, 휴대폰 높이 절반 이하(FR-006). `RemoteAvatar.tsx` 이름표 인라인 스타일을 토큰 값으로. — 완료: 머리글에 채팅과 같은 반투명 흰 면(`rgb(255 255 255 / 0.85)`), 점프 버튼 글자색 `#1f1f1f`(`TouchControls.tsx`). 휴대폰 터치 크기는 `src/client/touch.css`(`pointer: coarse`에서 컨트롤·입력칸 틀·단독 링크 `min-height: 44px`; `min-height`가 컴포넌트의 `height`를 이겨 Astryx 클래스와 우선순위 싸움이 없다). 이름표 인라인 스타일은 그대로.
- [x] T019 [P] [US2] `src/client/room/room2d/Room2D.tsx`·`src/client/admin/AdminPage.tsx`: 같은 기준(FR-005, FR-012). T014·T015 통과, a11y.spec 통과. — 완료(변경 없음): 2D·관리자 화면은 touch.css만으로 T014 통과. a11y.spec 통과. 로컬 E2E 전체 87개 통과(5.8분), SC-001 4.0초, 첫 3D 에셋 약 199KB.

---

## Phase 5: User Story 3 — 로딩과 빈 상태도 디자인돼 있다 (P3)

**Independent Test**: `npx playwright test visual -g "loading|empty|gone"`.

- [ ] T020 [P] [US3] `tests/e2e/visual.spec.ts`(먼저): `room3d-loading`(3D 에셋 응답을 `page.route`로 잡아 둠 → 진행률 보임), `list-empty`(`/api/rooms` 응답을 빈 목록으로 → 방 만들기 링크 보임), `gone`(삭제된 방 → 목록 링크). 실패 확인.
- [ ] T021 [US3] `src/client/room/room3d/Scene.tsx` `Progress`, `src/client/Status.tsx` `Loading`·`NetworkError`, `src/client/board/BoardPage.tsx` 빈 상태: Astryx 컴포넌트로, 새 문구는 `src/client/i18n/ko.ts` 키(FR-009, FR-011). T020 통과.

---

## Phase 6: Polish

- [ ] T022 quickstart V1~V3 실행, 결과(SC-001 시간, 3D 에셋 바이트, 실패했다 고친 검사)를 이 파일과 PR에 기록. README의 에셋 용량 문장 갱신.
- [ ] T023 운영자 판정(SC-001, quickstart V4): 미리보기 배포를 휴대폰으로 확인. "아쉽다"면 무엇이 아쉬운지 받아 스펙부터 고친다.

---

## Dependencies & Execution Order

- Setup(T001~T002) → Foundational(T003~T005) → US1 → US2 → US3 → Polish. T002는 운영자 머지라 따로 PR로 먼저 낸다.
- US2·US3은 US1과 파일이 거의 겹치지 않아 Foundational 뒤 병렬 가능(겹치는 곳: `RemoteAvatar.tsx` T011·T018, `Scene.tsx` T008~T010·T021 — 순서대로).
- 각 이야기 안에서는 테스트 → 구현.

## Parallel Example: User Story 1

```text
T006 visual.spec room3d 검사  ∥  T007 perf.spec 상한
→ T008 → T009 → T010 (Scene.tsx, 순서대로)  ∥  T011 RemoteAvatar.tsx
→ T012 → T013
```

## Implementation Strategy

- MVP는 US1(3D). 운영자가 가장 먼저 꼽았고, HDRI 제거로 첫 로딩도 가벼워진다. US1만 머지해 미리보기로 판정을 받은 뒤 US2·US3으로 간다.
- PR 단위: (1) T002(운영자 머지), (2) T001·T003~T013, (3) T014~T019, (4) T020~T023.
