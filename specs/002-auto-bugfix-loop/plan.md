# Implementation Plan: 자동 버그 수정·재발 방지 루프

**Branch**: `speckit/plan-002` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-auto-bugfix-loop/spec.md`

## Summary

서비스 Worker가 오류를 가려서 수집·집계하고 5분마다 GitHub 이슈로 동기화한다. 이슈 라벨이 조건을 만족하면 GitHub Actions의
`claude-code-action`이 운영자의 Claude 구독 사용량으로 실행되어 실패 테스트 → 수정 → PR을 만든다. 실수 분류(`cause:`,
`[mistake:]`)가 두 번째로 기록되면 장치 이슈를 열어 같은 에이전트가 장치 PR을 만든다. 판례·문서 구조 규칙은 결정적 스크립트로
CI에서 검사하고, 문서 정리는 주 1회 사전 검사 후 필요할 때만 에이전트를 부른다. 근거는 [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 6.0 / Node 22 (스크립트·Worker), GitHub Actions YAML

**Primary Dependencies**: 001 스택 + `anthropics/claude-code-action@v1`(SHA 고정), `yaml` 2.9(분류 목록 파싱), `source-map` 0.8(Actions 사전 단계 전용)

**Storage**: D1 (`bug_fingerprints`, `github_sync_state`, `user_bug_reports`), GitHub 라벨, 저장소 파일

**Testing**: Vitest 4.1 (순수 로직 Node, Worker는 pool-workers + 가짜 GitHub API), 워크플로는 B9~B14 실제 실행으로 확인

**Target Platform**: Cloudflare Workers(수집·Cron), GitHub Actions(에이전트·검사)

**Project Type**: 001 저장소에 붙는 운영 자동화 (같은 패키지)

**Performance Goals**: 새 오류 → 이슈 5분 이내(SC-001), 재현 가능한 버그 50%가 1시간 내 PR(SC-004)

**Constraints**: 에이전트 비용 = 운영자 구독 사용량 예산, 이슈 하루 10개·열린 이슈 20개, 공개 저장소(개인정보 0), 에이전트는 PR까지만

**Scale/Scope**: 워크플로 7개, 스크립트 6개, 프로젝트 스킬 4개(bugfix, pr-review, guardrail, doc-gardening)

## Constitution Check

*GATE: Phase 0 전에 통과, Phase 1 뒤 재확인.*

| 원칙 | 확인 | 전 | 후 |
|---|---|---|---|
| I. 클라우드 전용 | 에이전트·검사 모두 Actions, 토큰 발급도 클라우드 세션에서 | ✅ | ✅ quickstart 설정표 |
| II. 개인정보 미수집 | 수집·저장·이슈 모두 `redact()`, 사용자 원문 비공개 30일, 브라우저는 계열만 | ✅ | ✅ data-model, B6, B12 |
| III. 테스트 우선 | 순수 로직·Worker 테스트 먼저. 에이전트 PR은 실패 테스트 커밋 선행을 CI가 검사 | ✅ | ✅ contracts/github.md 에이전트 PR 규칙 |
| IV. 렌더링·상태 분리 | `redact`·지문은 `src/core` 순수 함수, 클라이언트 수집기는 얇게 | ✅ | ✅ |
| V. 2D 대체 화면 | 버그 신고 버튼을 3D·2D 공용 메뉴에 둠 | ✅ | ✅ |
| VI. 재발 방지는 구조로 | 문서 규칙을 스크립트 검사로(US5), 실수 분류 집계 → 장치(US4) | ✅ | ✅ |
| VII. 자동화 안전 경계 | 라벨 게이트, FR-015 게이트, 도구 제한, 최소 권한, 브랜치 보호, 예산 대기열, 재시도 2회 | ✅ | ⚠️ 브랜치 보호와 토큰 등록은 사용자 설정 필요. 에이전트 PR에서 CI 실행 여부는 첫 실행에서 확인(research R2) |
| 문서 구조 | 계약은 역할별 3파일, 각 문서 상한 안 | ✅ | ✅ |

## Project Structure

### Documentation (this feature)

```text
specs/002-auto-bugfix-loop/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/
│   ├── openapi.yaml     # 버그 리포트 HTTP (001 API에 추가)
│   ├── github.md        # 라벨, 이슈 형식, 워크플로, 에이전트 PR 규칙
│   └── doc-checks.md    # 문서 검사 D1~D6
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root, 001 구조에 추가)

```text
src/core/redact.ts, src/core/fingerprint.ts, src/core/doc-rules.ts   # 순수 로직
src/client/bug/collector.ts, src/client/bug/BugReportDialog.tsx      # 오류 수집기, 신고 대화상자(3D·2D 공용)
src/client/admin/BugReportsTab.tsx                                    # 관리자 화면 탭
src/worker/bug-reports.ts      # 수집 엔드포인트, 집계, 게이트
src/worker/github-sync.ts      # Cron: 이슈 생성·갱신·재오픈, 30일 삭제, PAT 만료 알림
migrations/0002_bug_reports.sql
scripts/check-docs.mjs, scripts/doc-garden-scan.mjs, scripts/mistake-tally.mjs, scripts/resolve-stack.mjs, scripts/labels-sync.mjs
.github/mistake-categories.yml
.github/workflows/{agent-fix,agent-queue,pr-review,labels-sync,mistake-tally,doc-checks,doc-garden}.yml
.claude/skills/{bugfix,pr-review,guardrail,doc-gardening}/SKILL.md
.github/labels.json
tests/core/{redact,fingerprint,doc-rules}.test.ts, tests/worker/{bug-reports,github-sync}.test.ts, tests/scripts/*.test.ts
```

**Structure Decision**: 001과 같은 패키지. 판단 로직(`doc-rules`, `redact`, `fingerprint`)은 `src/core` 순수 함수로 두고 스크립트·
Worker는 입출력만 맡는다. 에이전트 동작 규칙은 워크플로 프롬프트가 아니라 프로젝트 스킬 파일에 둬서 문서 정리(US6)의 대상이
되게 한다.

## 구현 순서 메모 (tasks 입력)

1. **US5 먼저**: 서비스(001) 없이 만들 수 있고, 만드는 즉시 판례·문서 구조 규칙이 장치가 된다. 001 Setup(T001~T010)의 최소분
   (package.json, tsconfig, vitest)이 필요하므로 그 부분을 함께 하거나 001 Setup 뒤에 한다.
2. US2 에이전트 워크플로 + US7 독립 리뷰(수동 `agent:run` 이슈로 검증 가능, 수집 없이도 동작).
3. US4 실수 집계(US2 위에).
4. US6 문서 정리.
5. US1·US3 수집은 001 서비스(Worker·관리자 화면)가 생긴 뒤.

## Complexity Tracking

해당 없음.
