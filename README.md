# roomboard
게시글 하나가 실시간 3D 방이 되는 게시판 (WebGL 메타버스)

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

| 이름 | 쓰는 곳 |
|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | PR 미리보기 배포·정리(`preview.yml`, `preview-cleanup.yml`). 없으면 배포를 건너뛴다 |
| `ADMIN_TOKEN`, `SERVER_SECRET`, `TURNSTILE_SECRET` | 미리보기 Worker 비밀값 |
| `TURNSTILE_SITEKEY` | 미리보기 빌드의 `VITE_TURNSTILE_SITEKEY` |
| `CLAUDE_CODE_OAUTH_TOKEN` | 수정 에이전트·PR 리뷰(`agent-fix.yml`, `pr-review.yml`) |
| `AGENT_PR_TOKEN` | 수정 에이전트가 PR을 여는 토큰(판례 2026-11-06-agent-pr-token) |
