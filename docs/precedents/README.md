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
| [2026-11-06-constitution-v1-1](2026-11-06-constitution-v1-1.md) | 헌법 v1.1.0: 재발 방지, 자동화 경계, 판례 제도, 문서 구조 | 일부 대체됨(머지) |
| [2026-11-06-agent-trigger-scope](2026-11-06-agent-trigger-scope.md) | 수정 에이전트는 서비스 봇 이슈에서만 자동 실행 | 유효 |
| [2026-11-06-user-bug-report-review](2026-11-06-user-bug-report-review.md) | 사용자 버그 신고는 운영자 검토 후 이슈화 | 유효 |
| [2026-11-06-recurrence-signal](2026-11-06-recurrence-signal.md) | 재발 판단은 버그 원인 분류 + PR 리뷰 지적 | 유효 |
| [2026-11-06-agent-budget](2026-11-06-agent-budget.md) | 에이전트 실행은 사용량 예산이 남는 만큼 | 유효 |
| [2026-11-06-chat-report-signed-snapshot](2026-11-06-chat-report-signed-snapshot.md) | 채팅 신고 스냅샷은 서버 서명으로 검증 | 유효 |
| [2026-11-06-preview-per-pr-worker](2026-11-06-preview-per-pr-worker.md) | PR 미리보기는 PR마다 별도 Worker·D1 | 유효 |
| [2026-11-06-tooling-version-pins](2026-11-06-tooling-version-pins.md) | Vitest 4.1, TypeScript 6.0 고정 | 일부 대체됨(Vitest) |
| [2026-11-06-agent-runner-action](2026-11-06-agent-runner-action.md) | 수정 에이전트는 GitHub Actions의 claude-code-action | 일부 대체됨(권한) |
| [2026-11-06-issue-token-pat](2026-11-06-issue-token-pat.md) | 자동 이슈 생성은 fine-grained PAT | 유효 |
| [2026-11-06-doc-checks-first](2026-11-06-doc-checks-first.md) | 002는 문서 검사(US5)부터 구현 | 유효 |
| [2026-11-06-doc-structure-table-globs](2026-11-06-doc-structure-table-globs.md) | 문서 구조 표를 경로 패턴으로 다시 씀 (헌법 1.1.1) | 유효 |
| [2026-11-06-independent-pr-review](2026-11-06-independent-pr-review.md) | 모든 PR에 독립 리뷰 에이전트, 모델은 운영자 설정대로 | 일부 대체됨(머지) |
| [2026-11-06-agent-one-run-per-trigger](2026-11-06-agent-one-run-per-trigger.md) | 이슈 하나에 에이전트 실행 하나: opened 제외, 현재 라벨 기준 | 유효 |
| [2026-11-06-agent-pushes-own-branch](2026-11-06-agent-pushes-own-branch.md) | 수정 에이전트가 브랜치를 직접 만들고 이름을 결과로 돌려준다 | 일부 대체됨(PR 토큰) |
| [2026-11-06-agent-pr-token](2026-11-06-agent-pr-token.md) | 에이전트 PR은 PR 전용 토큰으로 연다 | 유효 |
| [2026-11-06-vitest-plugin](2026-11-06-vitest-plugin.md) | Worker 테스트는 @cloudflare/vitest-plugin, Vitest 5.1 | 유효 |
| [2026-11-06-password-hash-in-do](2026-11-06-password-hash-in-do.md) | 글 비밀번호 해시는 방 DO 안에서 계산 | 유효 |
| [2026-11-07-chat-filter-limits](2026-11-07-chat-filter-limits.md) | 욕설 필터는 붙여 쓴 복합어 오탐을 감수 | 유효 |
| [2026-11-07-assets-quaternius](2026-11-07-assets-quaternius.md) | 방·가구 에셋은 Kenney 대신 Quaternius | 유효 |
| [2026-11-07-2d-view-rules](2026-11-07-2d-view-rules.md) | 2D 전환 규칙(WebGL 없으면 2D만, 버튼 눌렀을 때만 저장)과 구역 | 유효 |
| [2026-11-08-create-room-check-order](2026-11-08-create-room-check-order.md) | 방 만들기는 입력 검사 뒤에 Turnstile, 목록 limit 범위 밖은 400 | 유효 |
| [2026-11-08-turnstile-test-keys](2026-11-08-turnstile-test-keys.md) | Turnstile 테스트 비밀 키는 siteverify를 부르지 않는다 | 유효 |
| [2026-11-08-create-form-checks](2026-11-08-create-form-checks.md) | 방 만들기 양식은 서버와 같은 스키마로 먼저 검사한다 | 유효 |
| [2026-11-09-chat-sig-separator](2026-11-09-chat-sig-separator.md) | 채팅 서명 검증은 본문 앞 필드에 구분자가 있으면 거부한다 | 유효 |
| [2026-11-09-chat-panel](2026-11-09-chat-panel.md) | 채팅 패널: 읽어 주는 영역은 메시지 목록, 최근 100개만 둔다 | 일부 대체됨(읽어 주는 영역) |
| [2026-11-09-session-auto-merge](2026-11-09-session-auto-merge.md) | 세션 PR은 독립 리뷰를 포함한 필수 검사를 통과하면 auto-merge | 유효 |
| [2026-11-09-room-gone-check](2026-11-09-room-gone-check.md) | welcome 전에 닫히면 방을 조회, 테마가 바뀌면 서버도 스폰으로 | 유효 |
| [2026-11-09-astryx-prebuilt](2026-11-09-astryx-prebuilt.md) | 화면 컴포넌트는 Astryx, 미리 빌드된 CSS로 | 유효 |
| [2026-11-09-report-list-per-target](2026-11-09-report-list-per-target.md) | 관리자 신고 목록은 대상마다 한 줄, 처리 완료는 대상 단위 | 유효 |
| [2026-11-09-chat-live-text](2026-11-09-chat-live-text.md) | 2D 채팅은 숨긴 목록이 닉네임·내용만 읽어 준다 | 유효 |
| [2026-11-09-perf-4g](2026-11-09-perf-4g.md) | SC-001의 "일반 4G"는 Chrome Fast 4G 프리셋, 측정은 압축한 프로덕션 빌드로 | 유효 |
| [2026-11-10-preview-environment](2026-11-10-preview-environment.md) | 미리보기 비밀값은 Environment `preview`, 배포마다 운영자 승인 | 일부 대체됨(배포 브랜치) |
| [2026-11-10-preview-no-branch-rule](2026-11-10-preview-no-branch-rule.md) | 미리보기 Environment는 배포 브랜치 제한 없이, 승인만으로 | 유효 |
| [2026-11-11-visual-direction](2026-11-11-visual-direction.md) | 003 시각 품질: 3D는 아늑한 로우폴리, 화면은 전체를 고르게 | 유효 |
| [2026-11-11-no-reflection-env](2026-11-11-no-reflection-env.md) | 003 3D 조명: HDRI·반사 환경 없이 해·반구광만, 첫 3D 에셋 상한 3MB | 유효 |
| [2026-11-12-roadmap-after-v1](2026-11-12-roadmap-after-v1.md) | v1 다음 순서: 운영 배포 → 버그 자동 보고 → 상호작용·방꾸미기 | 일부 대체됨(004 범위) |
| [2026-11-12-enhancement-spec](2026-11-12-enhancement-spec.md) | 상호작용·방꾸미기는 고도화 스펙 004 하나로 | 유효 |
| [2026-11-12-bug-report-intake](2026-11-12-bug-report-intake.md) | 오류 리포트 수집: 앱 버전 형식, Worker 재가림, 수집 한도 | 유효 |
| [2026-11-13-bug-intake-worker](2026-11-13-bug-intake-worker.md) | 오류 리포트 수집 Worker: 파일 이름도 가림, manifest가 없으면 닫힌 쪽으로 | 일부 대체됨(파일 이름 가림) |
| [2026-11-13-intake-limit-alert](2026-11-13-intake-limit-alert.md) | 수집 한도 도달은 하루 한 번 알림, 빌드 청크 이름은 가리지 않음 | 일부 대체됨(알림 대상 행) |
| [2026-11-13-intake-build](2026-11-13-intake-build.md) | 오류 수집 빌드 설정: 함수 이름 유지, 패키지별 vendor 청크, IP 한도도 202 | 유효 |

## 판례 쓰는 법

- 파일 이름 `YYYY-MM-DD-<slug>.md`, 40줄 이하.
- 항목: 날짜, 대상, 출처(PR·이슈), 대체한 판례, 결정, 이유, 검토한 대안.
- 머지 후에는 고치지 않는다. 결정이 바뀌면 새 판례를 쓰고 옛 판례 맨 아래에 `대체됨: <파일 이름>` 한 줄만 덧붙이고 이 표의 상태를 바꾼다.
