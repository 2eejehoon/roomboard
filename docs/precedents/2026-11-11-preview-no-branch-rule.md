# 미리보기 Environment는 배포 브랜치 제한 없이, 승인만으로

- 날짜: 2026-11-11
- 대상: specs/001-realtime-room-board/research.md R3, tasks.md T097
- 출처: PR #45(미리보기 첫 실행)
- 대체한 판례: 2026-11-10-preview-environment(배포 브랜치 `claude/*` 부분만)

## 결정

- Environment `preview`의 Deployment branches는 "No restriction"으로 둔다. 보호 장치는 required reviewers(운영자 승인) 하나다.
- `claude/*`가 아닌 브랜치와 포크 PR은 워크플로의 job 조건이 건너뛴다(그대로).

## 이유

- `claude/*` 규칙을 둔 채 PR #45에서 `deploy` job이 러너 배정 전에 거절됐고, 규칙을 풀자 승인 대기로 넘어갔다.
  `pull_request` 실행은 head 브랜치 이름으로 판정되지 않는 것으로 보인다(거절 문구는 직접 보지 못함).
- 브랜치 규칙은 처음부터 보호 장치가 아니었다(수정 에이전트도 `claude/*`에 push 가능, 2026-11-10-preview-environment).

## 검토한 대안

- 규칙 패턴을 `refs/pull/*` 등으로 바꾸기: 보호 효과가 없는 설정을 하나 더 관리할 뿐이라 기각.
