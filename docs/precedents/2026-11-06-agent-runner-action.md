# 수정 에이전트는 GitHub Actions의 claude-code-action

- 날짜: 2026-11-06
- 대상: specs/002-auto-bugfix-loop/plan.md, research.md R2, contracts/github.md
- 출처: 002 plan
- 대체한 판례: 없음

## 결정

에이전트는 `anthropics/claude-code-action@v1`(SHA 고정)로 이슈 이벤트에서 실행하고, 운영자의 Claude 구독 토큰(`CLAUDE_CODE_OAUTH_TOKEN`)으로 인증한다. 도구는 편집·git·npm 검사 명령으로 제한하고 워크플로 권한은 contents·pull-requests·issues 쓰기만 준다. 머지 차단은 기본 브랜치 보호로 보장한다.

## 이유

이슈 이벤트와 바로 이어지고 권한 경계가 저장소 안에 있다. 구독 토큰이라 '토큰이 있는 만큼' 결정(판례 2026-11-06-agent-budget)과 맞는다.

## 검토한 대안

claude.ai 클라우드 세션 트리거(GitHub 이벤트 연결·권한 경계가 저장소 밖), 자체 러너(범위 초과).
