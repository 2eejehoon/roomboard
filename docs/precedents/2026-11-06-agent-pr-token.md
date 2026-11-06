# 에이전트 PR은 PR 전용 토큰으로 연다

- 날짜: 2026-11-06
- 대상: specs/002-auto-bugfix-loop/contracts/github.md 에이전트 PR 규칙, research R2
- 출처: T020 3차 시험(이슈 #9), 이 수정 PR
- 대체한 판례: 2026-11-06-agent-pushes-own-branch.md (PR을 여는 토큰 부분)

## 결정

워크플로는 운영자가 만든 fine-grained 토큰 `AGENT_PR_TOKEN`(이 저장소, Pull requests·Issues 쓰기, Contents 읽기)으로
에이전트 브랜치의 PR을 연다. 토큰은 PR 단계에만 주고 에이전트 단계에는 주지 않는다. 브랜치 검사는
`scripts/agent-branch-check.mjs`(테스트 포함)로 옮겼다. 에이전트가 브랜치를 만들어 이름을 돌려주는 방식은 그대로다.

## 이유

Claude App 토큰은 액션이 끝날 때 폐기되어 다음 단계에서 401이 났고, `GITHUB_TOKEN`으로 연 PR에서는 CI·리뷰가 돌지 않는다.
Contents 쓰기가 없어 이 토큰으로는 push·머지를 할 수 없다.

## 검토한 대안

기본 토큰으로 PR을 열고 검사 워크플로를 수동 실행(워크플로 3개 수정, 구조 복잡), PR은 사람이 열기(자동 루프에 사람 단계 추가).
