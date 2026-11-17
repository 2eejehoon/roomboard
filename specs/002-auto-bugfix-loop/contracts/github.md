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
| `agent:needs-human` | 에이전트 워크플로 | 2회 실패, 또는 수정했지만 PR을 만들지 못함. 자동 중단 |
| `regressed` | Worker | 닫힌 지문 재발 |
| `kind:guardrail` | mistake-tally 워크플로 | 재발 방지 장치 이슈 |
| `kind:doc-garden` | doc-garden 워크플로 | 문서 정리 PR |
| `cause:<id>` | 수정 PR 작성자(에이전트 포함) | 원인 분류(`.github/mistake-categories.yml`) |
| `no-precedent` | 운영자 | 판례 존재 검사 건너뜀(형식·불변·길이 검사는 유지) |
| `review:run` | 운영자 | 외부 포크 PR에 독립 리뷰 실행 허가 |

에이전트 실행 조건: `agent:skip` 없음 AND (`agent:run` OR (`source:service` AND `agent:gated`) OR `source:user-report`) AND
`agent:needs-human` 없음. 라벨을 단 채 이슈를 만들면 `labeled` 이벤트도 오므로 `opened`는 듣지 않는다. 이미 시도한 이슈(`agent:attempt-1`)는
라벨 추가로 다시 시작하지 않고, 재시도는 재오픈이나 대기열(`workflow_dispatch`)로만 한다.

## 자동 이슈 형식 (`source:service`)

```markdown
제목: [bug] <errorName>: <summary 앞 60자>

<!-- roomboard-fingerprint: 3fa2c1d09b7e4a51 -->
| 항목 | 값 |
|---|---|
| 지문 | `3fa2c1d09b7e4a51` |
| 출처 | client / server |
| 발생 | 37회 (처음 2026-11-07 01:02 UTC, 마지막 2026-11-07 03:40 UTC) |
| 앱 버전 | 202611070102-1a2b3c4 ~ 202611070340-5d6e7f8 |
| 화면 | 3d 30, 2d 7 |
| 브라우저 | chrome 25, safari 12 |

### 오류 요약 (가림 적용)
`TypeError: Cannot read properties of undefined (reading 'p')`

### 스택 (앱 코드)
- `room3d-8f1c.js` `applyPeerMoved` 1:20431
- ...

이 이슈는 자동으로 만들어졌다. 개인정보·사용자 콘텐츠는 들어가지 않는다.
```

- 발생 횟수·마지막 시각은 Cron 동기화 때 본문 표를 고쳐서 갱신한다(댓글을 쌓지 않음).
- 재발 시: 이슈 재오픈 + `regressed` + 댓글 한 줄 "<버전>에서 재발"(버전 형식은 research R4).
- 클라이언트 지문은 처음 이슈를 만들 때(1건) 대개 `agent:gated`가 없다. 나중에 `gated`가 되면 다음 동기화가 기존 이슈에 `agent:gated`를 더한다
  (`labeled` 이벤트로 에이전트가 시작한다, FR-015).
- 닫힘 판단: 동기화가 `source:service` 열린 이슈 목록을 한 번 읽어(열린 이슈 상한 20도 이 목록으로 센다) 목록에 없는 `open` 지문을 `closed`로,
  `fixed_version`을 그때의 배포 버전으로 둔다. 재발은 `app_version_max`가 `fixed_version`보다 뒤일 때다.
- DB에서 온 문자열(오류 이름·요약·함수·파일 이름)은 모두 코드 스팬 안에 넣고, 백틱은 `'`로, 줄바꿈은 공백으로 바꾼다(위조한 이름이 코드 스팬을 깨고
  멘션·마크다운을 넣지 못하게). 제목은 줄바꿈만 바꾼다.

## 사용자 신고 이슈 형식 (`source:user-report`)

제목은 운영자 제목, 본문은 운영자 요약 다음에 "사용자 신고를 운영자가 요약한 이슈다. 신고 원문은 공개하지 않는다." 한 줄. 둘 다 서버가 식별자를 가린다
(research R9). 신고 원문·`context`는 넣지 않는다.

## 운영자 알림 이슈 (`[ops]`)

라벨 없음(에이전트가 실행되지 않음), FR-013 상한에 세지 않음. 본문은 아래 값만.

| 알림 | 제목 | 본문 | 한 번만 |
|---|---|---|---|
| 하루 수집 한도(research R5) | `[ops] 오류 리포트 하루 한도 도달 <day>` | 날짜, 받은 건수 | `github_sync_state.limit_alerted` |
| PAT 만료 30일 전(research R3) | `[ops] 이슈 토큰 만료 임박 <만료일>` | 만료일, 새 PAT를 Environment `production`의 `ISSUES_TOKEN`에 넣고 배포하라는 안내 | `token_alerts.expires` |

만료일은 GitHub 응답 헤더 `github-authentication-token-expiration`에서 읽는다(운영자가 따로 넣는 값 없음). 헤더가 없거나 읽지 못하면 알리지 않는다.

## 워크플로

| 파일 | 이벤트 | 하는 일 |
|---|---|---|
| `.github/workflows/agent-fix.yml` | `issues: [reopened, labeled]`, `workflow_dispatch` | 잡 `fix`: 실행 조건 확인 → 소스 위치 해석(비용 0 사전 단계, client만) → claude-code-action 실행. 잡 `finish`(새 실행기): 브랜치 검사 → PR → 결과 댓글·라벨 |
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
- PR 생성 실패: `수정은 했지만 PR을 만들지 못했습니다(브랜치: <이름>). 워크플로 로그를 확인하세요.`

## 에이전트 PR 규칙

- 에이전트가 `agent/issue-<n>-<slug>` 브랜치를 직접 만들어 push하고 결과의 `branch`에 이름을 담는다. 워크플로는 브랜치가 `agent/issue-<이 이슈 번호>-`로
  시작하고 원격 SHA가 에이전트 실행 전과 달라졌는지(`scripts/agent-branch-check.mjs`, 별도 잡에서 API로 조회) 확인한 뒤 PR 전용 토큰 `AGENT_PR_TOKEN`으로
  PR을 만든다(research R2). 액션의 `branch_name` 출력은 이 방식에서 비어 있고, 액션 토큰은 이 단계 전에 폐기된다.
- 본문에 `Fixes #<n>`, `cause:<id>` 라벨 필수.
- 커밋 순서: 실패 테스트 커밋이 수정 커밋보다 먼저(FR-021). CI의 별도 검사가 첫 커밋에서 새 테스트가 실패했는지 확인한다.
