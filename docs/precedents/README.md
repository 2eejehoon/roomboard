# 판례 목록

헌법·스펙 본문은 항상 최신 내용만 둔다. 결정의 경위는 여기에 판례로 남긴다(헌법 Governance).

| 파일 | 제목 | 상태 |
|---|---|---|
| [2026-11-06-constitution-v1](2026-11-06-constitution-v1.md) | 헌법 v1.0.0 제정 | 유효 |
| [2026-11-06-admin-token](2026-11-06-admin-token.md) | 관리자 인증은 비밀 토큰 | 유효 |
| [2026-11-06-chat-report-snapshot](2026-11-06-chat-report-snapshot.md) | 채팅은 저장하지 않고 신고된 메시지만 스냅샷 | 유효 |
| [2026-11-06-report-dedupe-hash](2026-11-06-report-dedupe-hash.md) | 중복 신고는 기기 키 해시로 판별 | 유효 |
| [2026-11-06-room-no-expiry](2026-11-06-room-no-expiry.md) | 방은 삭제 전까지 영구 | 유효 |
| [2026-11-06-list-newest](2026-11-06-list-newest.md) | 목록은 최신순만 | 유효 |
| [2026-11-06-constitution-v1-1](2026-11-06-constitution-v1-1.md) | 헌법 v1.1.0: 재발 방지, 자동화 경계, 판례 제도, 문서 구조 | 유효 |
| [2026-11-06-agent-trigger-scope](2026-11-06-agent-trigger-scope.md) | 수정 에이전트는 서비스 봇 이슈에서만 자동 실행 | 유효 |
| [2026-11-06-user-bug-report-review](2026-11-06-user-bug-report-review.md) | 사용자 버그 신고는 운영자 검토 후 이슈화 | 유효 |
| [2026-11-06-recurrence-signal](2026-11-06-recurrence-signal.md) | 재발 판단은 버그 원인 분류 + PR 리뷰 지적 | 유효 |
| [2026-11-06-agent-budget](2026-11-06-agent-budget.md) | 에이전트 실행은 사용량 예산이 남는 만큼 | 유효 |
| [2026-11-06-chat-report-signed-snapshot](2026-11-06-chat-report-signed-snapshot.md) | 채팅 신고 스냅샷은 서버 서명으로 검증 | 유효 |
| [2026-11-06-preview-per-pr-worker](2026-11-06-preview-per-pr-worker.md) | PR 미리보기는 PR마다 별도 Worker·D1 | 유효 |
| [2026-11-06-tooling-version-pins](2026-11-06-tooling-version-pins.md) | Vitest 4.1, TypeScript 6.0 고정 | 유효 |
| [2026-11-06-agent-runner-action](2026-11-06-agent-runner-action.md) | 수정 에이전트는 GitHub Actions의 claude-code-action | 유효 |
| [2026-11-06-issue-token-pat](2026-11-06-issue-token-pat.md) | 자동 이슈 생성은 fine-grained PAT | 유효 |
| [2026-11-06-doc-checks-first](2026-11-06-doc-checks-first.md) | 002는 문서 검사(US5)부터 구현 | 유효 |
| [2026-11-06-doc-structure-table-globs](2026-11-06-doc-structure-table-globs.md) | 문서 구조 표를 경로 패턴으로 다시 씀 (헌법 1.1.1) | 유효 |
| [2026-11-06-independent-pr-review](2026-11-06-independent-pr-review.md) | 모든 PR에 독립 리뷰 에이전트, 모델은 운영자 설정대로 | 유효 |
| [2026-11-06-agent-one-run-per-trigger](2026-11-06-agent-one-run-per-trigger.md) | 이슈 하나에 에이전트 실행 하나: opened 제외, 현재 라벨 기준 | 유효 |
| [2026-11-06-agent-pushes-own-branch](2026-11-06-agent-pushes-own-branch.md) | 수정 에이전트가 브랜치를 직접 만들고 이름을 결과로 돌려준다 | 유효 |

## 판례 쓰는 법

- 파일 이름 `YYYY-MM-DD-<slug>.md`, 40줄 이하.
- 항목: 날짜, 대상, 출처(PR·이슈), 대체한 판례, 결정, 이유, 검토한 대안.
- 머지 후에는 고치지 않는다. 결정이 바뀌면 새 판례를 쓰고 옛 판례 맨 아래에 `대체됨: <파일 이름>` 한 줄만 덧붙이고 이 표의 상태를 바꾼다.
