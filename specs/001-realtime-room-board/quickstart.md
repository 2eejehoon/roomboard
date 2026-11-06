# Quickstart: 실시간 3D 방 게시판 v1 검증 가이드

모든 명령은 Claude Code 웹 세션, Codespaces, GitHub Actions에서만 실행한다(헌법 원칙 I). 로컬 Mac에서 실행하지 않는다.
Codespaces는 `.devcontainer/devcontainer.json`이 Node 22와 Playwright Chromium을 준비한다.

## 준비

- Node 22, npm (세 환경 모두 기본 제공)
- Playwright Chromium (클라우드 세션은 미리 설치됨, Actions는 `npx playwright install --with-deps chromium`)
- 로컬 개발에는 Cloudflare 계정이 필요 없다. `wrangler`가 workerd로 Worker·DO·D1을 흉내 낸다.
- `.dev.vars`(커밋 금지, `.dev.vars.example` 복사):
  - `ADMIN_TOKEN=dev-admin-token`
  - `SERVER_SECRET=dev-server-secret` (신고자 해시, 채팅 서명)
  - `TURNSTILE_SECRET=1x0000000000000000000000000000000AA` (Cloudflare 공식 "항상 통과" 테스트 키)
  - 클라이언트 `VITE_TURNSTILE_SITEKEY=1x00000000000000000000AA`

```bash
npm ci
npm run seed:dev     # 로컬 D1 마이그레이션 적용 + 시드 방 seedroom01(비밀번호 seed-pass)
npm run dev          # Vite + Cloudflare 플러그인, http://localhost:5173
```

## 자동 검증

```bash
npm run typecheck
npm test             # Vitest: core(Node) + worker(workerd) 프로젝트
npm run test:e2e     # Playwright: 개발 서버를 띄워 브라우저 컨텍스트 2개 이상으로 검증
npm run build && npm run check:bundle   # 프로덕션 번들에 테스트 훅(__roomboard)이 없는지 확인
```

## 시나리오별 기대 결과

각 시나리오는 스펙의 사용자 스토리와 짝이다. E2E 테스트 이름도 같은 번호를 쓴다.

| # | 스토리 | 절차 | 기대 결과 |
|---|---|---|---|
| Q1 | US1 | 컨텍스트 A, B가 같은 방에 입장 → A가 이동 | B의 2D 참가자 목록과 테스트 훅 `peers`에 A의 새 위치가 1초 안에 반영 |
| Q2 | US1 | A가 탭을 닫음 | B의 참가자 목록에서 A가 사라짐 |
| Q3 | US1 | 모바일 뷰포트(터치)로 입장 | 조이스틱이 보이고 끌면 `move` 전송 |
| Q4 | US2 | WebGL을 끈 컨텍스트로 입장 | 2D 화면이 자동으로 뜨고 오류 없음, 3D 청크를 내려받지 않음 |
| Q5 | US2 | 스크립트 없이 `/rooms/{id}` 요청(`curl`) | HTML에 방 제목·설명이 있음 |
| Q6 | US3 | 양식 작성 → 제출 | 201, 목록 맨 위에 새 방, 만든 사람은 방으로 이동 |
| Q7 | US3 | 제목 비우고 제출 / Turnstile "항상 실패" 키 | 400 validation / 403, 방 생성 안 됨 |
| Q8 | US4 | A가 채팅 전송 | B에게 1초 안에 표시, 금칙어는 가려짐 |
| Q9 | US4 | A가 10초 안에 6개 전송 | 6번째는 전달 안 되고 A에게 기다리라는 안내 |
| Q10 | US5 | (Worker 테스트) WebSocket 21개 접속 | 21번째는 채널 2, 채널 1 참가자는 21번째를 못 봄 |
| Q11 | US6 | 틀린 비밀번호로 수정 / 맞는 비밀번호로 삭제 | 403 / 204, 방 안 참가자는 안내 후 목록으로 |
| Q12 | US7 | 방 신고 2번(같은 기기) → 관리자 토큰으로 목록 조회 → 방 삭제 | 두 번째는 duplicate=true, 목록에 1건, 삭제 후 방 주소 410 |
| Q13 | US7 | 토큰 없이 `/api/admin/reports` | 401 |
| Q14 | 원칙 II | 테스트 실행 후 로컬 D1 전체 덤프 검사 | 이메일·전화번호·IP 형식 문자열 없음 |
| Q15 | US7 | 받은 채팅을 신고 / `text`를 바꿔 신고 | 201, 관리자 목록에 스냅샷 / 400(서명 불일치) |

## 미리보기 배포 확인 (PR)

- PR을 열면 Actions가 `roomboard-pr-<번호>` Worker를 배포하고 URL을 PR 댓글로 남긴다(research R3).
- 실제 휴대폰으로 그 URL을 열어 Q1, Q3, Q8을 사람이 확인한다.
- PR을 닫으면 그 Worker는 지워진다.
- 필요한 저장소 Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Worker 비밀값(`ADMIN_TOKEN`, `SERVER_SECRET`,
  `TURNSTILE_SECRET`)은 배포 워크플로가 저장소 Secrets에서 넣는다.

## 참고

- API: [contracts/openapi.yaml](contracts/openapi.yaml)
- WebSocket: [contracts/websocket.md](contracts/websocket.md)
- 데이터: [data-model.md](data-model.md)
