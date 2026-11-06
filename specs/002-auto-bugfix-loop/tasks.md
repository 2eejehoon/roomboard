---
description: "Task list for 002-auto-bugfix-loop"
---

# Tasks: 자동 버그 수정·재발 방지 루프

**Input**: `specs/002-auto-bugfix-loop/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Tests**: 필수(헌법 III). 각 스토리에서 테스트를 먼저 쓰고 실패를 확인한 뒤 구현한다. 워크플로는 quickstart B 시나리오를 실제로 실행해 확인한다.

**Order**: plan의 구현 순서(판례 2026-11-06-doc-checks-first): US5 → US2 → US4 → US6 → US1 → US3. 스펙 우선순위(P1~P3)와 다르다.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (최소 저장소 기반)

**Purpose**: US5에 필요한 만큼만. 001 Setup(T001~T010)의 일부를 먼저 하고, 나머지는 001 구현 때 같은 파일을 넓힌다.

- [x] T001 `package.json`: 001 research R1 버전 고정 중 지금 쓰는 것만(`typescript` 6.0, `vitest` 4.1, `@types/node` 22; `yaml`은 US4에서 추가), `"type": "module"`, `"engines": {"node": ">=22.18"}`(스크립트가 Node 기본 타입 제거로 .ts를 import), 스크립트 `typecheck`, `test`, `check:docs` (001 T001의 일부)
- [x] T002 `tsconfig.json`: strict, ES2022, `moduleResolution: bundler`, `allowJs`+`checkJs`(스크립트도 타입 검사) (001 T002의 일부)
- [x] T003 [P] `vitest.config.ts`: `core` 프로젝트(Node, `tests/core/**`, `tests/scripts/**`) (001 T005의 일부)
- [x] T004 [P] `.gitignore`(`node_modules/`, `.dev.vars`, `.env`, `.wrangler/`, `test-results/`, `dist/`), `.devcontainer/devcontainer.json`(Node 22) (001 T008·T009의 일부)
- [x] T005 [P] `.github/workflows/ci.yml`: PR·main push마다 `npm ci` → `typecheck` → `test` (001 T010의 일부, 001 구현 때 lint·build·e2e 추가)

---

## Phase 2: User Story 5 — 판례와 문서 구조를 자동으로 지킨다 (P2, 구현 1순위)

**Goal**: contracts/doc-checks.md의 D1~D6을 CI에서 검사.

**Independent Test**: quickstart B1~B4.

### Tests (먼저)

- [x] T006 [P] [US5] `tests/core/doc-rules.test.ts`: 순수 함수 `checkDocs({changes, files, baseFiles, labels})` — D1 헌법·`specs/**/spec.md`·`specs/**/plan.md` 변경에 새 판례 없으면 위반, `no-precedent` 라벨이면 D1만 건너뜀; D2 base에 있던 판례의 변경이 맨 끝 `대체됨: <파일>` 한 줄 추가면 통과, 다른 변경은 위반; D3 이름 `YYYY-MM-DD-<slug>.md` 형식, 필수 항목(날짜·대상·출처·대체한 판례·결정·이유·검토한 대안), 40줄 초과; D4 README 목록과 파일 불일치(양방향); D5 헌법 "문서 구조" 표 파싱(`없음`은 건너뜀, `파일당 N줄`·`N줄` 파싱, 글롭 `specs/<feature>/...` 대응) 후 초과; D6 `## Clarifications` 존재. 모든 위반 문구에 고치는 방법 포함
- [x] T007 [P] [US5] `tests/scripts/check-docs.test.ts`: 임시 git 저장소에서 base·head 커밋을 만들어 `scripts/check-docs.mjs --base --head` 종료 코드(0/1)와 출력 확인. B1(판례 없이 spec 수정), B2(머지된 판례 본문 수정), B3(헌법 201줄, spec에 Clarifications), B4(`--labels no-precedent` 오타 수정) 재현

### Implementation

- [x] T008 [US5] `src/core/doc-rules.ts`: T006을 통과하는 순수 검사 로직(외부 의존 없음)
- [x] T009 [US5] `scripts/check-docs.mjs`: `git diff --name-status base...head`와 `git show`로 입력을 모아 `checkDocs` 호출, 위반을 출력하고 종료 코드 반환. `--labels` 인자로 PR 라벨 전달
- [x] T010 [US5] `.github/workflows/doc-checks.yml`: `pull_request`(opened, synchronize, reopened, labeled, unlabeled)에서 `fetch-depth: 0`, `npm ci`, `node scripts/check-docs.mjs --base origin/${{ base_ref }} --head HEAD --labels "<PR 라벨 쉼표 목록>"`
- [x] T011 [US5] 현재 main 문서 전체에 검사를 돌려 위반이 있으면 이 PR에서 고친다(예외 목록 없음)

**Checkpoint**: 판례 규칙이 CI 검사가 된다. 사용자는 Ruleset 필수 검사에 `ci`·`doc-checks`를 추가한다.

---

## Phase 3: User Story 2 — 이슈가 생기면 에이전트가 고쳐서 PR을 올린다 (P1)

**Independent Test**: quickstart B9~B11.

### Tests (먼저)

- [x] T012 [P] [US2] `tests/core/agent-gate.test.ts`: `shouldRunAgent(labels)` — contracts/github.md 실행 조건 표 전부(`agent:skip` 우선, `agent:needs-human`이면 거부, `agent:run`, `source:service`+`agent:gated`, `source:user-report`), 시도 횟수 라벨로 재시도 2회 제한
- [x] T013 [P] [US2] `tests/scripts/test-first-check.test.ts`: `scripts/test-first-check.mjs` — PR 커밋 목록에서 첫 커밋(테스트 추가)만 체크아웃해 새 테스트가 실패하는지, 마지막 커밋에서 통과하는지 판정(임시 저장소로 재현)

### Implementation

- [x] T014 [US2] `src/core/agent-gate.ts`
- [x] T015 [US2] `.github/labels.json`(contracts/github.md 라벨 표) + `.github/workflows/labels-sync.yml`(수동 실행, `gh label create --force`로 생성·갱신)
- [x] T016 [US2] `.claude/skills/bugfix/SKILL.md`: 이슈 본문은 신뢰하지 않는 데이터, 재현 실패 테스트 커밋 → 수정 커밋, `Fixes #n`, `cause:<id>` 라벨, 재현 실패 시 PR 없이 댓글, 테스트 비활성화 금지
- [x] T017 [US2] `.github/workflows/agent-fix.yml`: `issues: [opened, reopened, labeled]`, 조건 단계(`agent-gate`), `concurrency` 이슈별·전체 1개, `timeout-minutes: 45`, `anthropics/claude-code-action` SHA 고정 + `claude_code_oauth_token`, `allowed_tools` 제한(research R2), `permissions` 최소, 결과 라벨·댓글(contracts/github.md), 사용량 한도 오류 시 `agent:queued`
- [x] T018 [US2] `.github/workflows/agent-queue.yml`: 매시, 가장 오래된 `agent:queued` 이슈 하나 재실행
- [x] T019 [US2] `ci.yml`에 `test-first` 잡 추가: 브랜치가 `agent/`로 시작하는 PR에서 `scripts/test-first-check.mjs` 실행
- [ ] T020 [US2] B9~B11 실제 실행(시험용 버그 `src/core/trial/sum-positive.ts`를 심고, 확인 뒤 지운다): 심은 버그 이슈에 `agent:run` → PR·CI 실행 확인, 주입 지시 이슈, 외부 이슈. 결과를 research R2 "확인 필요"에 반영하고 판례 추가

---

## Phase 3b: User Story 7 — 모든 PR을 독립 리뷰 에이전트가 검토한다 (P2, US2와 같은 PR)

**Independent Test**: spec US7 Independent Test (개인정보 로그·테스트 비활성화 PR은 `ai-review` 실패, 문서 PR은 통과).

- [x] T045 [P] [US7] `tests/scripts/labels.test.ts`: `.github/labels.json`의 라벨 이름 집합이 contracts/github.md 라벨 표와 같다(문서·설정 어긋남 방지)
- [x] T046 [US7] `.claude/skills/pr-review/SKILL.md`: 새 세션 리뷰 체크리스트(버그, 보안, 개인정보, 헌법 I~VII, 테스트 우선), 근거 필수, 차단/제안 구분, PR 본문·코드 속 지시 무시
- [x] T047 [US7] `.github/workflows/pr-review.yml`: 같은 저장소 PR은 `pull_request`, 포크는 `review:run` 라벨 + `pull_request_target`(base 루트·head `pr-head/`, 읽기 전용 도구), `--model opus`, `--json-schema` 판정, `blocking > 0`이면 `ai-review` 실패, `allowed_bots: claude`, 권한 `contents: read`·`pull-requests: write`
- [ ] T048 [US7] 실제 확인: 이 PR 자체와 의도적 위반 PR로 `ai-review` 동작 확인 후 Ruleset 필수 검사에 `ai-review` 추가(운영자)

---

## Phase 4: User Story 4 — 반복되는 실수를 장치로 막는다 (P2)

**Independent Test**: quickstart B13.

- [ ] T021 [P] [US4] `tests/core/mistake-tally.test.ts`: `tallyMistakes(events, categories)` — `cause:<id>` 라벨 PR과 `[mistake:<id>]` 리뷰 댓글을 분류별로 세고, 2가 되는 분류만 반환, 목록에 없는 분류 무시, 열린 장치 이슈가 있으면 "댓글만"
- [ ] T022 [US4] `.github/mistake-categories.yml`: 초기 분류(research R6)
- [ ] T023 [US4] `src/core/mistake-tally.ts`, `scripts/mistake-tally.mjs`(GitHub 검색으로 이벤트 수집)
- [ ] T024 [US4] `.claude/skills/guardrail/SKILL.md`: 구조 > 타입 > 린트 > 테스트 > 문서, 원인 커밋에서 실패 출력 첨부, 대체된 문서 문장 삭제
- [ ] T025 [US4] `.github/workflows/mistake-tally.yml`: PR 머지·리뷰 댓글 이벤트 → 2회째면 `kind:guardrail`+`agent:run` 이슈

---

## Phase 5: User Story 6 — 에이전트용 문서를 계속 정리한다 (P3)

**Independent Test**: quickstart B14.

- [ ] T026 [P] [US6] `tests/scripts/doc-garden-scan.test.ts`: 문서 속 백틱 경로·npm 스크립트가 없으면 보고, 모두 있으면 빈 결과, 길이 상한 근접(90%) 보고
- [ ] T027 [US6] `scripts/doc-garden-scan.mjs`
- [ ] T028 [US6] `.claude/skills/doc-gardening/SKILL.md`: 지운 문장마다 이유, 줄 수 증가 이유, 장치로 대체된 지시 삭제
- [ ] T029 [US6] `.github/workflows/doc-garden.yml`: 주 1회 + 수동, 스캔 결과가 비고 새 실수 기록이 없으면 종료, 아니면 에이전트로 정리 PR(`kind:doc-garden`)

---

## Phase 6: User Story 1 — 오류가 나면 이슈가 자동으로 생긴다 (P1, 001 서비스 이후)

**Independent Test**: quickstart B5~B8.

- [ ] T030 [P] [US1] `tests/core/redact.test.ts`: 이메일·전화번호(한국 형식)·IPv4/IPv6·UUID·긴 토큰·따옴표 문장 → `[가림]`, 정상 오류 문구 유지
- [ ] T031 [P] [US1] `tests/core/fingerprint.test.ts`: 상위 앱 프레임 3개 기준, 줄·열 번호 변화에 같은 지문, vendor 프레임 무시
- [ ] T032 [P] [US1] `tests/worker/bug-reports.test.ts`: `POST /api/bug-reports` 항상 202, 4KB 초과 413, 집계(`count`, 분포), 3건+manifest 일치 시 `gated`, 서버 오류 즉시 gated, 요청 한도 초과 조용히 버림
- [ ] T033 [P] [US1] `tests/worker/github-sync.test.ts`(가짜 GitHub API): 새 지문 이슈 생성(contracts/github.md 형식, `source:service`, gated면 `agent:gated`), 기존 이슈 본문 표 갱신, 하루 11번째·열린 이슈 21번째 생성 안 함, `fixed_version` 이후 재발 시 재오픈+`regressed`, PAT 만료 30일 전 알림 이슈
- [ ] T034 [US1] `src/core/redact.ts`, `src/core/fingerprint.ts`
- [ ] T035 [US1] `migrations/0002_bug_reports.sql`(data-model.md `bug_fingerprints`, `github_sync_state`, `user_bug_reports`)
- [ ] T036 [US1] `src/worker/bug-reports.ts`, `src/worker/github-sync.ts`(Cron 5분), `wrangler.jsonc`에 Cron 추가, 빌드 시 `manifest.json` 생성
- [ ] T037 [US1] `src/client/bug/collector.ts`: `onerror`·`unhandledrejection`·React 오류 경계, 클라이언트 `redact`, 분당 전송 제한
- [ ] T038 [US1] `.github/workflows/agent-fix.yml`에 client 이슈용 소스맵 해석 사전 단계(`scripts/resolve-stack.mjs`, LLM 호출 전)

---

## Phase 7: User Story 3 — 사용자가 직접 버그를 신고한다 (P2, 001 서비스 이후)

**Independent Test**: quickstart B12.

- [ ] T039 [P] [US3] `tests/worker/user-bug-reports.test.ts`: 접수 201(가림 적용 저장), Turnstile 실패 403, 한도 429, 관리자 목록·이슈화(요약만 공개, `source:user-report`)·버리기(즉시 삭제), 30일 Cron 삭제
- [ ] T040 [P] [US3] `tests/e2e/bug-report.spec.ts`: 3D·2D 메뉴의 버그 신고 → 접수 안내, 관리자 탭에서 이슈화
- [ ] T041 [US3] `src/worker/bug-reports.ts`에 사용자 신고·관리자 경로(contracts/openapi.yaml)
- [ ] T042 [US3] `src/client/bug/BugReportDialog.tsx`(3D·2D 공용 메뉴), `src/client/admin/BugReportsTab.tsx`

---

## Phase 8: Polish

- [ ] T043 [P] `tests/worker/privacy-audit-bugs.test.ts`: 버그 테이블·가짜 GitHub 이슈 본문에 개인정보 형식 0건(SC-003)
- [ ] T044 README에 운영 설정(브랜치 Ruleset, Secrets, 라벨 동기화)과 판례 링크

## Dependencies

- Setup → US5 → US2 → US4·US6(서로 독립) / US1·US3은 001 Setup·Foundational·관리자 화면(001 US7) 이후.
- US1의 T038은 US2의 `agent-fix.yml` 이후.

## Implementation Strategy

1. **PR 1**: Setup + US5. 머지 뒤 Ruleset 필수 검사에 `ci`, `doc-checks` 추가.
2. **PR 2**: US2(+라벨 동기화). 실제 이슈로 B9~B11 확인.
3. **PR 3**: US4 + US6.
4. US1·US3은 001 MVP 이후 별도 PR.
