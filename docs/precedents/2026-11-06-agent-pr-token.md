# 에이전트 PR은 PR 전용 토큰으로 연다

- 날짜: 2026-11-06
- 대상: specs/002-auto-bugfix-loop/contracts/github.md 에이전트 PR 규칙, research R2
- 출처: T020 3차 시험(이슈 #9), 이 수정 PR
- 대체한 판례: 2026-11-06-agent-pushes-own-branch.md (PR 토큰), 2026-11-06-agent-runner-action.md (권한)

## 결정

에이전트 브랜치의 PR은 운영자가 만든 fine-grained 토큰 `AGENT_PR_TOKEN`(이 저장소, Pull requests·Issues 쓰기, Contents 읽기)으로
연다. 에이전트 이후 작업은 모두 별도 잡(`finish`, 새 실행기, 신뢰된 기본 브랜치만 체크아웃)에서 한다. 브랜치 검사는 실행 전후의
원격 SHA(API로 조회)를 비교한다. 워크플로 토큰 권한은 contents 읽기, issues 쓰기로 낮췄다.
에이전트는 push용 App 토큰(실행 중에만 유효)만 가진다. PAT로 연 PR은 운영자가 작성자라 본인 승인이 안 되므로 관리자 우회로 머지한다.

## 이유

Claude App 토큰은 액션이 끝날 때 폐기되어 다음 단계에서 401이 났고, `GITHUB_TOKEN`으로 연 PR에서는 CI·리뷰가 돌지 않는다.
Contents 쓰기가 없어 이 토큰으로는 push·머지를 할 수 없다.

## 검토한 대안

기본 토큰으로 PR을 열고 검사를 수동 실행(구조 복잡), PR은 사람이 열기(사람 단계 추가), 한 잡 안에서 단계만 분리(에이전트가 남긴
git 설정·환경 파일로 뒤 단계를 가로챌 수 있어 기각, 독립 리뷰 지적), 봇 계정 토큰(계정 관리 부담, 필요해지면 전환).
