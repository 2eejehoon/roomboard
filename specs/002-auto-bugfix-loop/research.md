# Research: 자동 버그 수정·재발 방지 루프

조사일: 2026-11-06. 스택은 001과 같다(Node 22, TypeScript 6.0, Vitest 4.1, Cloudflare Workers + D1). 001 research의 버전 고정을
그대로 따른다(판례 2026-11-06-tooling-version-pins).

## R1. 구성 요소 배치

| 스토리 | 어디서 돈다 | 이유 |
|---|---|---|
| US1 오류 수집·이슈 | 서비스 Worker(수집·집계, D1) + Worker Cron(5분마다 GitHub 동기화) | 리포트마다 GitHub API를 부르면 API 한도·지연 문제. 배치로 묶는다 |
| US2 에이전트 | GitHub Actions + `anthropics/claude-code-action@v1` | 이슈 이벤트로 바로 트리거, 저장소 권한 모델 안에서 동작, 클라우드 전용(헌법 I) |
| US3 사용자 신고 | 서비스 Worker + 001 관리자 화면(S5) 확장 | 관리자 인증(판례 admin-token)을 재사용 |
| US4 재발 방지 | GitHub Actions(PR 머지·리뷰 이벤트) → 장치 이슈 → US2 에이전트(장치용 스킬) | 실수 기록이 GitHub에만 있다(판례 recurrence-signal) |
| US5 문서 검사 | GitHub Actions, 결정적 Node 스크립트 | LLM 불필요, 빠르고 무료. 서비스와 무관하게 먼저 만들 수 있음 |
| US6 문서 정리 | 주 1회 GitHub Actions: 결정적 사전 검사 → 할 일이 있을 때만 에이전트 | 예산 절약(FR-052) |

## R2. 에이전트 실행 방식

- **Decision**: `anthropics/claude-code-action@v1`(v1.0.268, 워크플로에는 커밋 SHA `c0949c50`로 고정).
  인증은 `claude_code_oauth_token`(운영자의 Claude 구독 사용량 = "토큰이 있는 만큼", 판례 agent-budget). 저장소 Secret
  `CLAUDE_CODE_OAUTH_TOKEN`.
- 트리거(`issues: [reopened, labeled]`, 대기열용 `workflow_dispatch`) 조건(`opened`는 라벨 생성 시 `labeled`와 중복이라 제외):
  - `agent:skip` 라벨이 있으면 실행 안 함.
  - `agent:run` 라벨이 있으면 실행(라벨은 triage 이상 권한자만 붙일 수 있어 외부 사용자는 못 붙임).
  - `source:service` 라벨이 있고 `agent:gated` 라벨(Worker가 FR-015 조건 충족 시 붙임)이 있으면 실행.
- 같은 이슈 동시 실행 방지: `concurrency: agent-issue-${{ issue.number }}`. 전체 동시 실행 1개(`concurrency: agent`)로
  예산이 한꺼번에 타지 않게 한다.
- 실행 1회 상한: `timeout-minutes: 45`, `--max-turns 60`. 같은 이슈 재시도 2회(이슈 라벨 `agent:attempt-1`, `-2`로 센다).
- 예산 소진: 액션이 사용량 한도 오류로 끝나면 `agent:queued` 라벨을 붙이고 끝낸다. 매시 도는 `agent-queue.yml`이 가장
  오래된 `agent:queued` 이슈 하나를 다시 실행한다.
- **위험·대응 (헌법 VII)**:
  - 이슈 본문은 프롬프트에 "신뢰하지 않는 데이터" 블록으로만 넣는다. 액션의 하위 프로세스 환경 정리 기능(v1.0.77+)을 켠다.
  - 에이전트는 자기가 고친 코드로 `npm test`를 돌린다. 이슈 본문이 공개 수집 경로에서 왔을 수 있으므로 액션의 하위 프로세스
    비밀값 제거(`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`)를 켠다. T020 1차 시험에서 `allowed_non_write_users` 없이도 이 설정이 격리 실행을
    켠다는 것을 확인했다(격리 도구 `socat`이 없어 명령이 막힘). 하위 프로세스 환경에서 비밀값이 실제로 지워지는지는 직접 확인하지
    못했다. 남는 위험으로 기록한다.
  - **잡 분리**: 잡 `fix`는 에이전트까지만 실행하고 텍스트 출력만 넘긴다. 잡 `finish`는 새 실행기에서 신뢰된 기본 브랜치만
    체크아웃해 브랜치 검사(실행 전후 원격 SHA를 API로 비교), PR 생성, 결과 댓글을 한다. 같은 잡 안이면 에이전트가 남긴
    `.git/config`(예: `core.sshCommand`)나 `$GITHUB_ENV`·`$GITHUB_PATH`로 뒤 단계를 가로챌 수 있다(PR #12 독립 리뷰 지적).
  - 에이전트 단계에는 워크플로 토큰·PR 토큰을 주지 않는다. 이슈 본문은 `.agent/issue.md`로 전달한다. **남는 위험**: 액션이
    push용 App 토큰(이 저장소 한정, 실행이 끝나면 폐기)을 `.git/config`에 넣으므로 에이전트는 실행 중 이 토큰을 읽을 수 있다.
    main은 Ruleset으로 막혀 있다.
  - PAT로 연 PR은 운영자가 작성자로 표시되어 본인 승인이 안 된다. 머지는 관리자 우회로 하고, 독립 리뷰(`ai-review`)가 작성하지
    않은 쪽의 검토 역할을 한다. 봇 계정 토큰으로 바꾸면 운영자가 승인할 수 있다(지금은 계정 관리 부담으로 보류).
  - `allowed_tools`를 좁힌다: 파일 편집, `git`, `npm ci`, `npm test`, `npm run typecheck`만(`gh` 없음). `curl`·`wget`·임의
    네트워크 금지.
  - 워크플로 `permissions`: 잡별 최소 권한. `fix`는 contents 읽기·issues 쓰기·id-token, `finish`는 contents 읽기·issues 쓰기.
    PR은 `AGENT_PR_TOKEN`으로만 연다.
  - **기본 브랜치 보호(사용자 설정 필요)**: main 대상 Ruleset으로 PR 필수(승인 0명, FR-066), 필수 검사 `ci`·`test-first`·
    `doc-checks`·`ai-review`·`merge-gate`, force push·삭제 차단, 우회 목록에 Repository admin만. `merge-gate`는 `agent/` 브랜치
    PR과 자동 머지 허용 경로(`scripts/merge-gate.mjs`) 밖을 바꾸는 PR에서 실패하므로, 에이전트는 우회 불가라 그런 PR을 머지하지 못한다.
    이게 있어야 FR-022가 워크플로 설정 실수와 무관하게 보장된다. 필수 검사는 GitHub가 최근 실행된 검사만 고를 수 있게 해서
    워크플로가 한 번 돈 뒤 추가한다.
- **PR 생성**: 에이전트가 `agent/issue-<n>-<slug>` 브랜치를 push하고 이름을 결과로 돌려준다. 워크플로가 브랜치를 검사
  (`scripts/agent-branch-check.mjs`)한 뒤 PR 전용 fine-grained 토큰 `AGENT_PR_TOKEN`(이 저장소, Pull requests·Issues 쓰기,
  Contents 읽기)으로 PR을 연다. 액션 출력 `github_token`은 액션이 끝날 때 폐기되어 쓸 수 없었고(T020 3차, 401),
  `GITHUB_TOKEN`으로 만든 PR은 CI·리뷰를 트리거하지 않는다. 이 토큰은 에이전트 단계에 노출되지 않고, Contents 쓰기가 없어
  push·머지를 할 수 없다.
- **모델**: 운영자의 역할별 모델 설정을 따른다. 수정 `opus`, 리뷰 `opus`, 장치 `sonnet`, 문서 정리 `opus`. `claude_args`에
  별칭(`--model opus`)으로 넣어 새 모델이 나와도 따라간다.
- 봇 계정 이벤트는 기본 차단이다. 리뷰 워크플로는 에이전트 PR을 리뷰해야 하므로 `allowed_bots: claude`만 명시한다(`*` 금지).
- **Alternatives**: claude.ai 클라우드 세션 트리거(원격 세션 API) — GitHub 이벤트와 바로 이어지지 않고 권한 경계가 저장소
  밖에 있어서 기각. 자체 에이전트 러너 — 범위 초과.

## R3. 이슈 생성 인증

- **Decision**: Fine-grained PAT(이 저장소만, Issues 읽기·쓰기, Metadata 읽기)를 Worker Secret `GITHUB_ISSUES_TOKEN`으로 둔다.
  만료일(최대 1년)을 README와 판례에 적고, 만료 30일 전 알림 이슈를 Cron이 연다.
- 봇 이슈 구분은 작성자가 아니라 `source:service` 라벨로 한다(외부 사용자는 라벨을 못 붙임).
- **Alternatives**: GitHub App(만료 없음, 봇 계정) — JWT 서명·설치 토큰 교환 코드가 늘어 지금은 과함. PAT 만료 관리가
  귀찮아지면 옮긴다.

## R4. 오류 지문과 개인정보 가림

- 클라이언트: `window.onerror`, `unhandledrejection`, React 오류 경계에서 수집. 서버: Worker·DO의 잡히지 않은 예외.
- 지문 = `SHA-256(오류 이름 + 앱 코드 스택 프레임 상위 3개의 "파일:함수")` 앞 16자. 줄·열 번호는 빼서 작은 변경에 덜
  민감하게 한다. 라이브러리 프레임(`node_modules`, 청크 이름이 vendor)은 뺀다.
  청크 파일 이름의 빌드 해시(`index-BXjaK0XS.js`의 `-BXjaK0XS`)도 뺀다(배포마다 바뀌어 재발 판단이 끊기므로).
  한계: 최소화가 함수 이름을 바꾸면 배포 뒤 같은 오류가 새 지문이 된다. T036에서 빌드 설정(이름 유지)이나 소스맵 해석 중 하나로 정한다.
- 가림(공통 순수 함수 `src/core/redact.ts`, 클라이언트·Worker 양쪽에서 실행): 이메일, 전화번호(한국 형식 포함), IPv4/IPv6,
  UUID, 32자 이상 hex/base64 토큰 형식, 따옴표 안 문자열(사용자 콘텐츠가 오류 메시지에 들어가는 흔한 경로)을 `[가림]`으로 바꾼다.
- 리포트 본문 크기 상한 4KB, 스택 프레임 최대 20개.
- 앱 버전: 빌드 시각 UTC `YYYYMMDDHHmm`과 커밋 짧은 SHA를 이은 `202611120613-1a2b3c4`. 앞 12자리로 순서를 비교한다
  (FR-012 재발 판단에 "이후"가 필요해서. SHA만으로는 순서를 알 수 없다). 빌드가 `manifest.json`에 넣고, 클라이언트는 리포트에, Worker는 서버 오류에 쓴다.
  로컬 개발·테스트는 `dev`. 비교 함수는 `dev`를 따로 다룬다(어떤 버전보다 앞. 문자열 비교로는 `'dev'`가 뒤가 된다).
  Worker는 받은 `appVersion`을 `^(\d{12}-[0-9a-f]{7,12}|dev)$`로 검사하고, 맞지 않거나 앞 12자리가 현재 배포 버전보다 뒤이면 `unknown`으로
  바꾼다(공개 이슈에 들어가는 값이라 개인정보가 실릴 수 없게, 위조 버전으로 닫힌 이슈를 다시 열 수 없게). `unknown`은 재발 판단과 `app_version_min/max` 갱신에서 빼고,
  min/max도 같은 비교 함수로 정한다.
- Worker는 클라이언트의 가림을 믿지 않는다: 받은 `errorName`·`message`·`fn`에 `redact()`를 다시 적용하고 자른다(100·300·100자).
  `frame.file`은 마지막 경로 조각(파일 이름)만 남긴다(출처·앞 경로·쿼리·해시 제거. 앞 경로·쿼리에는 개인정보·토큰이 실릴 수 있고,
  청크 이름 목록과 맞추기에도 파일 이름이면 된다). 지문은 Worker가 계산한다.
- 수집 한도(FR-003): IP당 분당 10건(레이트 리밋 바인딩, IP는 키로만 쓰고 저장하지 않음), 전체 하루 1000건
  (`github_sync_state.reports_received`). 넘으면 202로 조용히 버린다.

## R5. FR-015 게이트 (위조 리포트 방어)

- Worker는 같은 지문 리포트가 3건 이상이고 스택 파일 이름이 현재 배포 빌드의 청크 이름 목록(빌드 때 만든 manifest)에 있을
  때만 `agent:gated`를 붙인다.
- 에이전트 워크플로의 첫 단계(LLM 호출 전, 비용 0)에서 공개된 소스맵으로 스택 위치를 실제 소스 줄로 해석한다. 해석 실패면
  이슈에 "소스 위치 해석 실패"를 남기고 끝낸다. 소스맵은 공개해도 된다(저장소가 공개라 소스가 이미 공개).
- 한계: 공개 번들을 읽은 공격자는 그럴듯한 스택을 만들 수 있다. 그래서 요청 횟수 제한(분당·하루 총량)과 이슈 상한(하루 10개,
  열린 이슈 20개, FR-013)이 최종 방어선이다. 남는 위험은 하루 최대 10회 정도의 헛된 에이전트 실행.

## R6. 재발 방지 신호 (US4)

- 실수 분류 목록: `.github/mistake-categories.yml`(id, 설명). 처음 목록은 001 헌법·plan의 경계 규칙에서 뽑는다(예:
  `core-imports-renderer`, `hardcoded-ui-string`, `pii-in-logs`, `test-hook-in-prod`, `skip-test`).
- 버그 수정 PR: 라벨 `cause:<id>`. 리뷰 지적: 리뷰 댓글에 `[mistake:<id>]` 태그.
- `mistake-tally.yml`(PR 머지, 리뷰 댓글 이벤트): GitHub 검색으로 분류별 횟수를 세고, 2가 되는 순간 `kind:guardrail` +
  `agent:run` 이슈를 연다(같은 분류의 열린 장치 이슈가 있으면 댓글만).
- 에이전트는 장치용 프로젝트 스킬 `.claude/skills/guardrail/SKILL.md`를 따른다: 구조 > 타입 > 린트 > 테스트 > 문서 순으로
  고르고, 원인 커밋을 체크아웃해 장치가 실패하는 출력을 PR에 붙인다.

## R7. 문서 검사 (US5)

- `scripts/check-docs.mjs`: 입력은 PR의 변경 파일 목록(`git diff --name-status base...head`)과 파일 내용. 검사 로직은 순수
  함수로 두고 Vitest로 테스트한다.
- 판례 불변: 머지된 판례(base에 있는 파일)의 diff가 "맨 끝에 `대체됨: <파일>` 한 줄 추가"가 아니면 실패.
- 길이 상한: 헌법 "문서 구조" 표를 스크립트가 직접 파싱한다(상한을 두 곳에 적지 않기 위해).
- "판례 불필요" 라벨 `no-precedent`가 있으면 판례 존재 검사만 건너뛴다(형식·불변·길이 검사는 그대로).
- 의존성: `yaml`(2.9) 하나. Markdown 표는 간단한 줄 파싱으로 충분하다.

## R8. 문서 정리 (US6)

- 결정적 사전 검사 `scripts/doc-garden-scan.mjs`: 문서 안의 백틱 경로·npm 스크립트·파일 이름이 실제로 있는지, 길이, 지난 실행
  이후 새 `cause:`/`[mistake:]` 기록 수. 찾은 것이 없으면 에이전트를 부르지 않고 끝낸다.
- 찾은 것이 있으면 에이전트가 `.claude/skills/doc-gardening/SKILL.md`를 따라 정리 PR을 연다. 지운 문장마다 이유, 줄 수가 늘면
  이유를 PR 본문에 적는다.

## R9. 사용자 버그 신고 보관

- D1 `user_bug_reports`에 가린 원문 저장, Worker Cron(매일)이 30일 지난 행 삭제. 운영자 "버리기"는 즉시 삭제.

## R10. 독립 리뷰 (US7)

- `pr-review.yml`: `pull_request`(opened, synchronize, reopened, ready_for_review)에서 같은 저장소 브랜치 PR만 실행. 외부 포크 PR은
  `review:run` 라벨이 붙으면 `pull_request_target`으로 실행하되, 액션 보안 문서대로 base를 루트에, PR head를 `pr-head/`에
  체크아웃하고 도구는 읽기 전용(`Read`, `Glob`, `Grep`, `gh pr diff/view`, 인라인 댓글)으로만 준다. PR 코드를 실행하지 않는다.
- 새 세션에서 `.claude/skills/pr-review/SKILL.md`(체크리스트: 버그, 보안, 개인정보, 헌법 I~VII, 테스트 우선)를 따른다.
  지적마다 파일·줄과 실패하는 상황을 요구하고, 근거 없는 지적은 버린다.
- `--json-schema`로 `{blocking: 정수, suggestions: 정수, summary: 문자열}`을 받아, `blocking > 0`이면 `ai-review` 잡을 실패시킨다.
  이 잡 이름을 Ruleset 필수 검사에 넣는다.
- 권한: `contents: read`, `pull-requests: write`. push·승인·머지 도구 없음(FR-064).
- 한계: 작성 에이전트와 같은 회사 모델이라 맹점이 겹칠 수 있다. 그래서 근거 필수, 차단 판정은 검사로만. 머지는 FR-066(세션 PR은 검사 통과 시 auto-merge, 나머지는 사람).

## Sources

- claude-code-action 문서(입력·출력·보안): https://raw.githubusercontent.com/anthropics/claude-code-action/main/docs/usage.md ,
  https://raw.githubusercontent.com/anthropics/claude-code-action/main/docs/security.md ,
  https://raw.githubusercontent.com/anthropics/claude-code-action/main/action.yml
- claude-code-action 릴리스(v1.0.149 최신, v1.0.77 하위 프로세스 환경 정리): https://newreleases.io/project/github/anthropics/claude-code-action/release/v1.0.149 ,
  https://newreleases.io/project/github/anthropics/claude-code-action/release/v1.0.77
- npm 레지스트리(`npm view`, 2026-11-06): source-map 0.8.0, yaml 2.9.1
- Cloudflare 한도·Cron: 001 research.md Sources
