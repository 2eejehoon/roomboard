# 미리보기 비밀값은 Environment `preview`, 배포 브랜치는 `claude/*`만

- 날짜: 2026-11-10
- 대상: 헌법 VII, specs/001-realtime-room-board/research.md R3, tasks.md T097
- 출처: PR #43 리뷰(독립 리뷰 보안 지적), 운영자 선택
- 대체한 판례: 없음

## 결정

- 미리보기 배포·정리에 쓰는 비밀값 여섯 개(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ADMIN_TOKEN`, `SERVER_SECRET`,
  `TURNSTILE_SECRET`, `TURNSTILE_SITEKEY`)는 저장소 Secrets가 아니라 GitHub Environment `preview`에 둔다.
- `preview`의 배포 브랜치 규칙은 `claude/*`(운영자가 시킨 클라우드 세션의 브랜치)만 허용한다. 승인 클릭은 두지 않는다.
- 미리보기 Worker의 레이트 리밋 `namespace_id`는 운영 값에 1000을 더해 카운터를 나눈다.

## 이유

- `pull_request` 이벤트는 PR 안의 워크플로 파일을 실행한다. 파일 안의 `agent/` 건너뛰기 조건은 그 PR이 지울 수 있고,
  `npm ci`·빌드도 PR 코드다. PR 코드가 고칠 수 없는 곳(Settings의 Environment 규칙)에서 막아야 한다.
- 브랜치 규칙이면 세션 PR은 클릭 없이 배포되고, 수정 에이전트(`agent/*`)나 다른 브랜치는 비밀값을 받지 못한다.

## 검토한 대안

- 매번 승인(required reviewers): 가장 안전하지만 PR마다 운영자 클릭이 필요해 기각.
- 파일 안 조건과 고정 버전 wrangler만: PR이 워크플로를 고치면 무력해서 기각.
- 남은 위험: 누군가 `claude/*` 이름으로 브랜치를 올리면 규칙을 통과한다. 에이전트 브랜치 이름은 `agent-branch-check`가 본다.
  `pull_request` 실행에서 브랜치 규칙이 PR의 head 브랜치로 판정되는지는 첫 실행에서 확인한다(미확인).
