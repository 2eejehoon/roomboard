# 미리보기 비밀값은 Environment `preview`, 배포마다 운영자 승인

- 날짜: 2026-11-10
- 대상: 헌법 VII, specs/001-realtime-room-board/research.md R3, tasks.md T097
- 출처: PR #43 리뷰(독립 리뷰 보안 지적), 운영자 선택
- 대체한 판례: 없음

## 결정

- 미리보기 배포·정리에 쓰는 비밀값 여섯 개(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ADMIN_TOKEN`, `SERVER_SECRET`,
  `TURNSTILE_SECRET`, `TURNSTILE_SITEKEY`)는 저장소 Secrets가 아니라 GitHub Environment `preview`에 둔다.
- `preview`에는 required reviewers(운영자)를 둔다. 미리보기 배포·정리는 운영자가 승인해야 비밀값을 받는다.
- 배포 브랜치 규칙 `claude/*`와 job 조건은 다른 브랜치를 깔끔히 건너뛰게 할 뿐, 보호 장치는 승인이다.
- 미리보기 Worker의 레이트 리밋 `namespace_id`는 운영 값에 1000을 더해 카운터를 나눈다.

## 이유

- `pull_request` 이벤트는 PR 안의 워크플로 파일을 실행한다. 파일 안의 `agent/` 건너뛰기 조건은 그 PR이 지울 수 있고,
  `npm ci`·빌드도 PR 코드다. PR 코드가 고칠 수 없는 곳(Settings의 Environment 규칙)에서 막아야 한다.
- 브랜치 이름만으로는 막지 못한다. 수정 에이전트(`agent-fix.yml`)는 App 토큰과 `Bash(git:*)`로 `claude/*` 브랜치에도 push할 수 있고,
  `agent-branch-check`는 PR을 열지 말지만 정한다(PR #43 리뷰). 사람의 승인은 PR 코드도 에이전트도 대신할 수 없다.

## 검토한 대안

- 브랜치 규칙 `claude/*`만(승인 없음): 처음 고른 안. 위 이유로 에이전트가 우회할 수 있어 기각.
- `claude/*` 생성을 ruleset으로 관리자만: 세션 push가 같은 App을 쓰면 세션도 막혀 확인이 필요해 보류.
- 파일 안 조건과 고정 버전 wrangler만: PR이 워크플로를 고치면 무력해서 기각.
- 남은 위험: 운영자가 무엇을 승인하는지 보지 않고 누르면 뚫린다. 승인 전에 PR의 브랜치와 작성 주체를 본다.
대체됨: 2026-11-11-preview-no-branch-rule.md
