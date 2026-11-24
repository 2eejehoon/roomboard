# roomboard
게시글 하나가 실시간 3D 방이 되는 게시판 (WebGL 메타버스). 방마다 옆에 넉백 난투 경기장이 있다([004 quickstart](specs/004-knockback-brawl/quickstart.md)).

## 작업 환경

로컬 기기에는 아무것도 설치하지 않는다. 개발·테스트·배포는 Claude Code 웹 세션, GitHub Codespaces, GitHub Actions에서만 한다
([헌법 원칙 I](.specify/memory/constitution.md)). Codespaces는 `.devcontainer/devcontainer.json`이 준비한다.

## 명령

준비와 시나리오별 기대 결과는 [quickstart](specs/001-realtime-room-board/quickstart.md)에 있다.

```bash
npm ci
npm run seed:dev       # 로컬 D1 마이그레이션 + 시드 방 seedroom01
npm run dev            # http://localhost:5173
npm run typecheck && npm run lint && npm test
npm run build && npm run check:bundle
npm run test:e2e       # build 뒤에 (perf.spec은 프로덕션 빌드를 잰다)
npm run check:docs
```

의존성을 새로 받을 때는 `npx npm@11 install`을 쓴다([CLAUDE.md](CLAUDE.md)).

## GitHub Secrets

미리보기용 여섯 개는 저장소 Secrets가 아니라 Environment `preview`(배포마다 운영자 승인, 배포 브랜치 제한 없음)의 Secrets에 둔다.
운영 배포(`deploy.yml`, Actions에서 main으로 Run workflow)는 같은 이름의 여섯 개를 Environment `production`(운영자 승인, 배포 브랜치 `main`)에 따로 둔다.
`ADMIN_TOKEN`·`SERVER_SECRET`은 미리보기와 다른 새 값으로, Turnstile 위젯 호스트에는 `roomboard.<계정>.workers.dev`가 들어 있어야 한다.

| 이름 | 쓰는 곳 |
|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | PR 미리보기 배포·정리(`preview.yml`, `preview-cleanup.yml`). 없으면 배포를 건너뛴다 |
| `ADMIN_TOKEN`, `SERVER_SECRET`, `TURNSTILE_SECRET` | 미리보기 Worker 비밀값 |
| `TURNSTILE_SITEKEY` | 미리보기 빌드의 `VITE_TURNSTILE_SITEKEY` |
| `CLAUDE_CODE_OAUTH_TOKEN` | 수정 에이전트·PR 리뷰(`agent-fix.yml`, `pr-review.yml`) |
| `AGENT_PR_TOKEN` | 수정 에이전트가 PR을 여는 토큰(판례 2026-11-06-agent-pr-token) |
| `ISSUES_TOKEN` (Environment `production`) | 오류 자동 이슈용 fine-grained PAT(이 저장소, Issues 읽기·쓰기). Worker 안 이름은 `GITHUB_ISSUES_TOKEN`(GitHub가 `GITHUB_` 접두어 비밀값 이름을 거부함). 만료 30일 전에 `[ops]` 이슈가 열린다 |

## 운영 설정 (자동 버그 수정 루프)

자세한 값과 거는 순서는 [002 quickstart](specs/002-auto-bugfix-loop/quickstart.md) "사용자가 한 번 설정할 것"에 있다.

- **브랜치 Ruleset** 두 개(Settings → Rules → Rulesets)
  - 기본 브랜치: PR 필수(승인 0명), 필수 검사 `ci`·`test-first`·`doc-checks`·`ai-review`·`merge-gate`, force push·삭제 차단, 우회는 Repository admin.
    Settings → General에서 "Allow auto-merge"를 켠다. `merge-gate`가 실패하는 PR(워크플로·스크립트·설정 등 허용 경로 밖)은 운영자가 머지한다.
  - 세션 브랜치(`refs/heads/**`, 기본 브랜치·`agent/**` 제외): 갱신·생성·삭제 제한, 우회는 Repository admin. 수정 에이전트는 `agent/**`에만 push한다.
- **Secrets**: 위 표.
- **라벨 동기화**: `.github/labels.json`을 바꾸면 Actions에서 `labels-sync`를 수동 실행(Run workflow)한다.

결정의 경위는 [판례 목록](docs/precedents/README.md)에 있다.
