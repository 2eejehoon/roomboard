# 장치·문서 정리 에이전트는 agent-fix를 같이 쓴다

- 날짜: 2026-11-12
- 대상: specs/002-auto-bugfix-loop US4(FR-030~033)·US6(FR-050~052), research R6, contracts/github.md
- 출처: 002 US4·US6 구현 PR
- 대체한 판례: 없음

## 결정

- mistake-tally와 doc-garden 워크플로는 에이전트를 직접 돌리지 않는다. `kind:guardrail`·`kind:doc-garden` + `agent:run` 이슈를
  만들고 agent-fix를 `workflow_dispatch`로 실행한다. agent-fix는 `kind:` 라벨로 스킬(guardrail, doc-gardening)을 고른다.
- 이 PR에는 `cause:` 대신 `kind:` 라벨을 단다. 장치 PR이 같은 실수의 세 번째 기록으로 세지지 않게 하기 위해서다.
- `.md`만 바꾼 에이전트 PR은 `test-first` 검사를 건너뛴다. 재현할 동작이 없다.
- 집계는 검색 대신 REST 목록으로 한다. 2회 이상이고 그 분류의 장치 이슈(열린 것·닫힌 것)가 없을 때 연다(PR #59 리뷰: 기록 두 개가 동시에
  들어오면 두 실행 모두 3을 센다). 리뷰 태그 `[mistake:<id>]`는 쓰기 권한자와 `claude[bot]`의 것만 센다.

## 이유

- 에이전트 실행과 PR 생성(잡 분리, 브랜치 검사, PR 전용 토큰, 시도 상한, 대기열)은 보안상 민감하다. 한 곳에만 둔다.
- GITHUB_TOKEN으로 만든 이슈는 `labeled` 이벤트를 내지 않으므로 직접 실행해야 한다.
- 검색 색인은 막 머지된 PR을 늦게 넣어 2회째를 1회로 셀 수 있다. 공개 PR 댓글은 누구나 써서 비용을 일으킬 수 있다.

## 검토한 대안

- 워크플로마다 claude-code-action 잡을 둔다: 같은 보안 단계를 세 벌 유지한다. 기각.
- PAT로 이슈를 만들어 `labeled`로 시작: 비밀값을 하나 더 쓴다. 기각.
