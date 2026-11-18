# 리뷰 실수 태그는 댓글 끝의 것만 센다, 대기열 실행은 봇 허용

- 날짜: 2026-11-18
- 대상: specs/002-auto-bugfix-loop US4(FR-030), research R6, `.github/workflows/agent-fix.yml`
- 출처: mistake-tally·agent-fix 첫 실제 실행(이슈 #71, PR #64 머지 직후)
- 대체한 판례: 없음

## 결정

- `[mistake:<id>]` 리뷰 태그는 댓글 맨 끝(뒤 공백 허용)에 있고 백틱 안이 아닐 때만 기록으로 센다. 한 댓글에 하나.
- agent-fix의 `claude-code-action`에 `allowed_bots: github-actions`를 준다. agent-queue는 GITHUB_TOKEN으로 실행을 넣는다.

## 이유

- 첫 실행이 `skip-test` 장치 이슈 #71을 열었는데, 근거 두 건이 모두 태그 문법을 예시로 인용한 리뷰 댓글이었다(실수 기록 아님).
  pr-review 스킬은 이미 태그를 댓글 끝에 붙이라고 한다.
- 액션은 사람이 아닌 실행자가 시작한 실행을 기본으로 거부한다. 장치·문서 정리 이슈는 모두 대기열로 시작하므로(판례
  2026-11-12-guardrail-via-agent-fix) 이 설정이 없으면 한 번도 돌 수 없다. 대기열 dispatch는 우리 워크플로만 할 수 있다.

## 검토한 대안

- 백틱 안의 태그만 제외: 백틱 없이 인용하면 다시 오탐. 기각.
- 대기열을 PAT로 dispatch: 비밀값이 하나 늘고 봇 허용과 효과가 같다. 기각.
