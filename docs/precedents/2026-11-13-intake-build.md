# 오류 수집 빌드 설정: 함수 이름 유지, 패키지별 vendor 청크, IP 한도도 202

- 날짜: 2026-11-13
- 대상: specs/002-auto-bugfix-loop research R4·R5, tasks T032·T033·T036, `vite.config.ts`, `wrangler.jsonc`, `deploy.yml`, `preview.yml`
- 출처: T036 PR (b)(세션 판단), PR #57 리뷰(vendor 청크), PR #62 리뷰(한도 알림이 지난날을 놓침)
- 대체한 판례: 2026-11-13-intake-limit-alert(알림 대상 행 고르기만)

## 결정

- 클라이언트 최소화는 `minify.mangle.keepNames`로 함수·클래스 이름을 유지한다.
- 라이브러리는 패키지마다 `vendor-<패키지>` 청크로 나눈다(`codeSplitting.groups`). `fingerprint`의 vendor 제외가 이 이름으로 동작한다.
- 빌드가 `/manifest.json`에 `{version, chunks}`를 쓴다. `chunks`는 클라이언트 JS 청크의 파일 이름, `version`은 `VITE_APP_VERSION`(없으면 `dev`).
  배포 워크플로가 `$(date -u +%Y%m%d%H%M)-<짧은 SHA>`로 넣는다.
- IP당 분당 10건(`RL_BUG_REPORT`)을 넘으면 202로 버린다. 기존 `rateLimit` 미들웨어(429)는 쓰지 않는다.
- Cron(5분)·비밀값 `GITHUB_ISSUES_TOKEN`은 이 PR에 넣고 `scheduled`는 비워 둔다. 미리보기는 Cron과 토큰을 빼고 배포한다.
- 한도 알림은 오늘 행만이 아니라 `reports_received >= 1000 AND limit_alerted = 0`인 모든 행을 본다.

## 이유

- 최소화가 이름을 바꾸면 배포마다 같은 오류가 새 지문이 되어 재발 판단(FR-012)이 끊긴다. 이름 유지는 첫 JS가 gzip 0.2KB 늘 뿐이다.
- vendor 청크를 하나로 묶으면 three·rapier가 첫 로드에 들어온다(gzip 1.4MB). 패키지별이면 첫 로드는 그대로이고 SC-001 측정은 5.1초.
- 429는 보낸 쪽에 버린 것을 알려 준다. 수집은 무엇을 남겼는지 드러내지 않는다(항상 202).
- `wrangler.jsonc`·워크플로는 운영자 머지 경로다. `github-sync.ts`(src)를 자동 머지로 올리려면 설정이 먼저 있어야 한다.
  미리보기 Cron이 실제 저장소에 이슈를 쓰면 안 되고, 미리보기 Environment에 PAT를 둘 이유도 없다.
- 자정 직전에 한도에 닿거나 이슈 생성이 실패하면, 다음 Cron에게 그 행은 이미 "어제"라 알림이 사라진다.

## 검토한 대안

- 소스맵으로 이름 해석(Worker 수집 때): 리포트마다 큰 소스맵을 읽어야 한다. 기각. 에이전트의 소스 위치 해석(T038)은 그대로 한다.
- 식별자를 전혀 줄이지 않기(`mangle: false`): 첫 JS가 keepNames보다 gzip 1.3KB 더 크고 얻는 것이 없다. 기각.
- `manualChunks`로 vendor 하나: 위 이유로 기각. 3D·나머지 두 묶음: 패키지 목록을 손으로 맞춰야 한다. 기각.
