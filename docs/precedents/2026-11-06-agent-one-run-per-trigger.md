# 이슈 하나에 에이전트 실행 하나: opened 제외, 현재 라벨 기준

- 날짜: 2026-11-06
- 대상: specs/002-auto-bugfix-loop/contracts/github.md 실행 조건, research R2 트리거
- 출처: PR #8 (첫 실제 리뷰에서 나온 지적 포함)
- 대체한 판례: 없음

## 결정

`agent-fix`는 `issues: [reopened, labeled]`와 대기열용 `workflow_dispatch`만 듣고 `opened`는 듣지 않는다. 이미 시도한 이슈
(`agent:attempt-1`)는 라벨이 더 붙어도 다시 시작하지 않으며, 재시도는 재오픈이나 대기열로만 한다. 실행 조건은 이벤트
payload가 아니라 실행 시점의 현재 이슈 라벨로 판단한다.

## 이유

라벨을 단 채 이슈를 만들면 `opened`와 라벨마다 `labeled`가 따로 와서 에이전트가 여러 번 돌고, 동시 실행 그룹이 뒤
실행을 대기시켜도 그 실행은 옛 payload를 받아 시도 표시를 보지 못했다(독립 리뷰가 찾음).

## 검토한 대안

`opened`만 듣기(나중에 붙인 `agent:run`을 놓침), 동시 실행 그룹만으로 막기(대기한 실행이 옛 payload로 다시 실행됨).
