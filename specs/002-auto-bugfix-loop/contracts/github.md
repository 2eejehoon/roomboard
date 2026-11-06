# GitHub 계약: 라벨, 이슈 형식, 워크플로

## 라벨

| 라벨 | 붙이는 주체 | 뜻 |
|---|---|---|
| `source:service` | Worker | 오류 자동 수집으로 만든 이슈 |
| `source:user-report` | Worker(운영자 이슈화) | 사용자 신고를 운영자가 이슈로 만든 것 |
| `agent:gated` | Worker | FR-015 조건 충족(서버 오류는 생성 시 바로) |
| `agent:run` | 운영자(triage 이상) | 사람이 연 이슈에서 에이전트 실행 허가 |
| `agent:skip` | 운영자 | 어떤 경우에도 실행 안 함 |
| `agent:working` | 에이전트 워크플로 | 실행 중 |
| `agent:queued` | 에이전트 워크플로 | 사용량 예산 소진으로 대기 |
| `agent:attempt-1`, `agent:attempt-2` | 에이전트 워크플로 | 시도 횟수 |
| `agent:needs-human` | 에이전트 워크플로 | 2회 실패 또는 재현 실패 반복, 자동 중단 |
| `regressed` | Worker | 닫힌 지문 재발 |
| `kind:guardrail` | mistake-tally 워크플로 | 재발 방지 장치 이슈 |
| `kind:doc-garden` | doc-garden 워크플로 | 문서 정리 PR |
| `cause:<id>` | 수정 PR 작성자(에이전트 포함) | 원인 분류(`.github/mistake-categories.yml`) |
| `no-precedent` | 운영자 | 판례 존재 검사 건너뜀(형식·불변·길이 검사는 유지) |
| `review:run` | 운영자 | 외부 포크 PR에 독립 리뷰 실행 허가 |

에이전트 실행 조건: `agent:skip` 없음 AND (`agent:run` OR (`source:service` AND `agent:gated`) OR `source:user-report`) AND
`agent:needs-human` 없음.

## 자동 이슈 형식 (`source:service`)

```markdown
제목: [bug] <errorName>: <summary 앞 60자>

<!-- roomboard-fingerprint: 3fa2c1d09b7e4a51 -->
| 항목 | 값 |
|---|---|
| 지문 | `3fa2c1d09b7e4a51` |
| 출처 | client / server |
| 발생 | 37회 (처음 2026-11-07 01:02 UTC, 마지막 2026-11-07 03:40 UTC) |
| 앱 버전 | 0.3.1 ~ 0.3.2 |
| 화면 | 3d 30, 2d 7 |
| 브라우저 | chrome 25, safari 12 |

### 오류 요약 (가림 적용)
`TypeError: Cannot read properties of undefined (reading 'p')`

### 스택 (앱 코드)
- `assets/room3d-8f1c.js` `applyPeerMoved` 1:20431
- ...

이 이슈는 자동으로 만들어졌다. 개인정보·사용자 콘텐츠는 들어가지 않는다.
```

- 발생 횟수·마지막 시각은 Cron 동기화 때 본문 표를 고쳐서 갱신한다(댓글을 쌓지 않음).
- 재발 시: 이슈 재오픈 + `regressed` + 댓글 한 줄 "v<버전>에서 재발".

## 워크플로

| 파일 | 이벤트 | 하는 일 |
|---|---|---|
| `.github/workflows/agent-fix.yml` | `issues: [opened, reopened, labeled]` | 실행 조건 확인 → 소스 위치 해석(비용 0 사전 단계, client만) → claude-code-action 실행 → 결과 댓글·라벨 |
| `.github/workflows/agent-queue.yml` | `schedule: 매시` | 가장 오래된 `agent:queued` 이슈 하나 재실행 |
| `.github/workflows/mistake-tally.yml` | `pull_request: closed(merged)`, `pull_request_review_comment: created` | `cause:`/`[mistake:]` 집계, 2회째면 `kind:guardrail`+`agent:run` 이슈 |
| `.github/workflows/doc-checks.yml` | `pull_request` | `scripts/check-docs.mjs` (contracts/doc-checks.md) |
| `.github/workflows/pr-review.yml` | `pull_request`, `pull_request_target`(labeled `review:run`) | 독립 리뷰, 잡 `ai-review`가 차단 지적 시 실패 (research R10) |
| `.github/workflows/labels-sync.yml` | `workflow_dispatch` | `.github/labels.json`의 라벨을 저장소에 생성·갱신 |
| `.github/workflows/doc-garden.yml` | `schedule: 주 1회` | 사전 검사 → 할 일 있을 때만 에이전트로 정리 PR |

## 에이전트 결과 댓글

- 성공: `PR #<n>을 열었습니다. 재현 테스트: <테스트 이름>. cause:<id>`
- 재현 실패: `재현하지 못해 PR을 열지 않았습니다. 시도: <요약>`
- 예산 소진: `사용량 예산이 바닥나 대기열에 넣었습니다.`
- 중단: `자동 수정이 2회 실패해 사람 확인이 필요합니다.`

## 에이전트 PR 규칙

- 액션이 `agent/` 접두사 브랜치를 push하면, 워크플로가 액션 출력 `github_token`(Claude App 토큰)으로 PR을 만든다(research R2).
- 본문에 `Fixes #<n>`, `cause:<id>` 라벨 필수.
- 커밋 순서: 실패 테스트 커밋이 수정 커밋보다 먼저(FR-021). CI의 별도 검사가 첫 커밋에서 새 테스트가 실패했는지 확인한다.
