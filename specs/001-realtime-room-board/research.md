# Research: 실시간 3D 방 게시판 v1

조사일: 2026-11-06. 버전은 npm 레지스트리(`npm view`)에서 직접 확인했다. Cloudflare 한도는 이
세션에서 developers.cloudflare.com에 직접 접속할 수 없어 웹 검색 결과로 확인했다. 숫자가 출처마다 다른
항목은 "재확인 필요"로 표시했다. 첫 배포 전에 Cloudflare 대시보드의 사용량 화면에서 다시 확인한다.

## R1. 패키지 버전

| 패키지 | 고정 버전 | 비고 |
|---|---|---|
| vite | 8.3.x | Node `^20.19 \|\| >=22.12` |
| @cloudflare/vite-plugin | 1.67.x | vite `^6 \|\| ^7 \|\| ^8`, wrangler `^4.156.1` 요구 |
| wrangler | 4.158.x | Node `>=22` |
| react / react-dom | 19.3.x | |
| three | 0.187.x | |
| @react-three/fiber | 9.8.x | |
| @react-three/drei | 10.7.x | |
| @react-three/rapier | 2.2.x | |
| ecctrl | 2.0.x | peer: fiber ≥9.4, rapier ≥2.2, three ≥0.184, react ≥19.2.7. `ecctrl/input`에 DOM 조이스틱 포함 |
| hono | 4.13.x | Worker 라우팅 |
| zod | 4.6.x | HTTP·WebSocket 입력 검증 |
| vitest | 5.1.x | |
| @cloudflare/vitest-plugin | 1.6.x | DO·Worker를 workerd 안에서 테스트. `@cloudflare/vitest-pool-workers`의 새 이름(옛 패키지는 지원 종료), vitest `^4.1 \|\| ^5` 지원 |
| eslint / typescript-eslint | 10.14 / 8.72 | typescript-eslint는 TypeScript `<6.1` 지원 |
| @playwright/test | 1.65.x | 클라우드 세션에는 Chromium이 미리 설치됨 |
| typescript | **6.0.x** | 7.0(네이티브 포트)은 나온 지 얼마 안 돼서 도구 호환이 검증될 때까지 6.0 사용 |
| Node | 22 LTS | Actions·Codespaces 공통 |

- **Decision**: 위 버전으로 고정하고 Renovate 같은 자동 업데이트는 v1 범위 밖이다.
- **Alternatives**: `@cloudflare/vitest-pool-workers` 0.23 + vitest 4.1 — 지원 종료 패키지라 기각(001 Setup 때 확인). TypeScript 7 — 기각(위 이유).

## R2. Cloudflare 무료 한도와 그 영향

| 항목 | 무료 한도 | 출처 신뢰도 |
|---|---|---|
| Workers 요청 | 100,000/일 (00:00 UTC 초기화), 분당 1,000 버스트 | 공식 문서 검색 결과 |
| Workers CPU | 요청당 10ms (네트워크 대기 제외) | 공식 |
| Workers 서브요청 | 요청당 50 | 공식 |
| Durable Objects | SQLite 백엔드만 무료(`new_sqlite_classes`) | 공식 changelog(2025-04) |
| DO 요청 | 100,000/일. **들어오는 WebSocket 메시지 20개 = 요청 1개**, 나가는 메시지·프로토콜 ping 무료 | 요청 수: 3자 출처(재확인 필요), 20:1: 공식 |
| DO 실행 시간 | 13,000 GB-s/일 | 3자 출처(재확인 필요) |
| DO 메시지당 CPU | 메시지마다 30초로 초기화 | 공식 |
| DO 저장소 | 객체당 1GB | 공식 FAQ |
| D1 | 읽기 500만 행/일, 쓰기 10만 행/일, 계정 전체 5GB, DB당 500MB, DB 10개, 호출당 쿼리 50개 | 공식. 2026-09-01부터 한도 초과 시 쿼리 실패 |
| Rate Limiting 바인딩 | 추가 비용 없음(오픈 베타), 기간 10초 또는 60초, 위치(PoP)별 집계 | 공식 + 3자 |
| Turnstile | 무료 | 재확인 필요 |
| 정적 에셋 | Workers 정적 에셋 요청은 무료 | 재확인 필요 |

**설계에 주는 영향**

1. **WebSocket Hibernation API 필수**. `accept()` 방식은 연결된 시간 전체가 실행 시간으로 과금된다.
   Hibernation을 쓰면 핸들러가 끝난 뒤 쉬는 시간은 과금되지 않는다. ping은 `setWebSocketAutoResponse`로
   DO를 깨우지 않고 응답한다.
2. **이동 메시지 예산**. 무료 DO 요청 100,000/일 × 20 = 들어오는 메시지 200만 개/일. 이동 중에만 초당
   최대 5회 보내고, 사용자가 30% 시간 동안 움직인다고 보면 1인당 시간당 약 5,400개 = DO 요청 270개.
   **무료 한도로 하루 약 370 사용자·시간**이다. 실제 사용자가 늘면 Workers Paid로 올린다
   (월 고정 요금, 금액은 그때 다시 확인).
3. **Workers CPU 10ms**. 비밀번호 해시(R5)와 HTML 주입(R8)이 이 안에 들어가야 한다. 구현 단계에서
   workerd로 측정하는 작업을 tasks에 넣는다.
4. **D1 쓰기 10만 행/일**. 접속 인원 갱신(R6)을 입장·퇴장마다 쓰되 2초 디바운스한다.

## R3. 미리보기 배포 (PR마다)

- 사실: Durable Object를 구현한 Worker는 Preview/Version URL이 **생성되지 않는다**(공식 문서).
  `wrangler versions upload --preview-alias`는 쓸 수 없다.
- **Decision**: PR마다 GitHub Actions에서 `wrangler deploy --name roomboard-pr-<번호>`로 별도 Worker를
  배포한다(DO 포함, 데이터 격리). D1도 PR마다 `roomboard-pr-<번호>` DB를 만들어 그 PR의
  마이그레이션을 적용한다(PR끼리 스키마가 달라도 충돌 없음, 무료 DB 10개 한도 안에서 열린 PR 8개까지).
  PR이 닫히면 `wrangler delete --name roomboard-pr-<번호>`와 `wrangler d1 delete`로 정리한다. DO 클래스를 가진
  Worker가 `wrangler delete`로 지워지는지는 첫 미리보기 배포 때 확인한다(미확인). 배포 URL은 PR 댓글로 남긴다.
- **Alternatives**: 앞단 Worker + DO 전용 Worker 분리(앞단만 미리보기 URL) — 미리보기가 운영 DO를
  같이 써서 데이터가 섞이므로 기각.
- **사용자 작업 필요**: 저장소 Secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ADMIN_TOKEN`, `SERVER_SECRET`,
  `TURNSTILE_SECRET`, `TURNSTILE_SITEKEY` 등록. 등록 전까지 미리보기 배포 워크플로는 건너뛴다(헌법의 미리보기 MUST는 이 의존성이
  풀릴 때까지 미충족 상태로 추적).

## R4. 이동 동기화 방식

- **Decision**: 클라이언트 권한 이동 + 서버 검증. 충돌(Rapier)과 3인칭 컨트롤(ecctrl)은 클라이언트에서
  처리하고, 클라이언트는 위치·방향·애니메이션 상태를 이동 중에만 초당 최대 5회 보낸다. 서버(DO)는
  방 경계 밖 좌표와 최대 속도를 넘는 순간 이동을 거부하고, 초당 10개를 넘는 메시지는 버린다.
  받는 쪽은 보간해서 부드럽게 그린다.
- **Rationale**: 서버에서 물리를 돌리면 DO CPU·실행 시간이 크게 늘고, 게시판 성격상 공정성 요구가 낮다.
- **Alternatives**: 서버 권한 물리 — 비용·복잡도 때문에 기각.

## R5. 글 비밀번호 해시

- **Decision**: WebCrypto PBKDF2-SHA256, 반복 100,000회(workerd의 PBKDF2 반복 상한으로 알려져 있으나 미확인, 측정 작업에서 같이 확인), 16바이트 랜덤 솔트.
  저장 형식 `pbkdf2-sha256$<반복>$<솔트 b64>$<해시 b64>`라서 나중에 방식을 바꿀 수 있다. 비교는
  상수 시간으로 한다.
- **Risk**: 무료 플랜 CPU 10ms를 넘을 수 있다. 구현 첫 단계에서 workerd로 측정하고, 넘으면 해시 계산을
  방 DO 안(메시지당 CPU 30초)으로 옮긴다.
- **Alternatives**: bcrypt/argon2 WASM — 번들·CPU 부담으로 기각.

## R6. 방 1개 = DO 1개에서 채널 처리

- **Decision**: 방 DO 하나가 그 방의 모든 채널을 관리한다. 입장 시 번호가 가장 작은, 20명 미만 채널에
  배정하고 없으면 새 채널을 연다. 브로드캐스트는 같은 채널 소켓에만 보낸다.
- 소켓별 상태(참가자 id, 닉네임, 아바타, 채널, 마지막 위치)는 `serializeAttachment`에 저장해서
  Hibernation에서 깨어날 때 `getWebSockets()`로 복원한다.
- 접속 인원은 DO가 D1 `rooms.online_count`에 2초 디바운스로 기록한다. 목록 조회 때 DO를 깨우지 않는다.
- 접속 인원 디바운스는 DO **alarm**으로 한다. `setTimeout`은 DO를 깨어 있게 해서 실행 시간이 과금된다.
- 채팅은 저장하지 않는다(서버 메모리 버퍼도 두지 않는다). 메시지 신고 스냅샷은 **서명된 메시지**로 처리한다(R14).
- **Alternatives**: 채널마다 DO — 이슈 #1의 "방 1개 = DO 1개" 결정과 다르고 채널 배정에 조정이 필요해서
  기각.

## R7. 익명 신원과 닉네임

- **Decision**: 기기 키는 클라이언트가 `crypto.randomUUID()`로 만들어 localStorage에 둔다. 닉네임과
  아바타는 서버(그리고 같은 순수 함수를 쓰는 클라이언트)가 기기 키 해시로 **결정적으로** 만든다
  (형용사 + 동물 단어 목록, 아바타 목록에서 선택). 클라이언트가 닉네임을 정하지 않으므로 사칭과 금칙어
  닉네임이 원천적으로 막히고, 재접속 시 같은 닉네임이 나온다.
- 서버는 기기 키 원문을 저장하지 않는다. 신고 중복 판별에는 `HMAC-SHA256(SERVER_SECRET, "reporter|" + 기기 키)`만
  저장한다.

## R8. 2D 화면과 SEO

- **Decision**: 2D 화면은 같은 React 앱 안의 시맨틱 HTML 컴포넌트다. WebGL 지원 여부를 확인해서
  안 되면 2D로 시작하고, 3D 코드(three, R3F, rapier)는 동적 import로 나눠 2D 경로에서는 내려받지 않는다.
- 검색 엔진용으로 Worker가 `/rooms/:id` 요청에 `index.html`을 `HTMLRewriter`로 고쳐 `<title>`,
  `<meta name="description">`, `<noscript>` 안의 제목·설명을 넣는다. SSR 프레임워크는 쓰지 않는다.
- **Alternatives**: SSR 프레임워크 도입 — 범위에 비해 과해서 기각.

## R9. 요청 횟수 제한 (저장 없이)

- **Decision**: HTTP는 Workers Rate Limiting 바인딩을 쓴다. 키는 `cf-connecting-ip`를 요청 처리 중에만
  메모리에서 쓰고 어디에도 기록하지 않는다(로그 포함). 카운터는 Cloudflare 엣지에만 있고 우리 저장소에는
  남지 않는다.
  - 방 만들기 3회/60초, 비밀번호 확인 5회/60초, 신고 10회/60초, 관리자 토큰 확인 5회/60초.
- WebSocket은 DO 메모리의 참가자별 토큰 버킷: 채팅 10초에 5개, 이동 초당 10개.
- 바인딩은 PoP별 느슨한 집계라 강한 방어는 아니다. Turnstile과 함께 쓴다.

## R10. 다국어

- **Decision**: 외부 라이브러리 없이 `src/client/i18n/`에 언어별 문구 객체(`ko.ts`)와 `t(key, vars)`
  함수를 둔다. 키는 `ko.ts`에서 타입으로 뽑아서 없는 키를 쓰면 타입 오류가 난다.
- **Rationale**: v1은 한국어 하나이고 복수형 규칙이 필요 없다. 두 번째 언어가 생길 때 i18next로 옮긴다.
- **Alternatives**: i18next + react-i18next — 지금은 의존성만 늘어서 보류.

## R11. 욕설 필터

- **Decision**: 방 상태 로직(`src/core`)의 순수 함수. 한국어·영어 금칙어 목록, 자모 분리·공백·특수문자
  끼워넣기 같은 흔한 우회를 정규화한 뒤 일치 부분을 `*`로 가린다. 방 제목·설명에도 같은 필터를 쓴다.
- 목록은 저장소의 데이터 파일로 두어 코드 수정 없이 늘린다.

## R12. 테스트 전략

- `src/core` 순수 로직: Vitest(Node 환경). 채널 배정, 이동 검증, 토큰 버킷, 필터, 닉네임 생성, 프로토콜 파싱.
- Worker·DO: `@cloudflare/vitest-plugin`으로 workerd 안에서 실제 D1·DO 바인딩으로 테스트.
- E2E: Playwright, 개발 서버(Vite + Cloudflare 플러그인, workerd 로컬 실행)를 상대로 브라우저 컨텍스트
  2개 이상. 주로 2D 화면으로 검증하고, 3D는 개발 빌드 전용 `window.__roomboard` 테스트 훅으로 상태를
  읽는다. 테스트 훅은 `import.meta.env.DEV`로 감싸 프로덕션 번들에서 빠지는지 빌드 결과를 검사한다.
- Turnstile은 Cloudflare 공식 테스트 키(항상 통과/항상 실패)를 테스트 환경 변수로 쓴다.
- 21명 채널 분리는 브라우저 21개 대신 DO 테스트에서 WebSocket 21개로 검증한다.
- 모든 테스트는 클라우드 세션과 GitHub Actions에서 실행한다(헌법 원칙 I).

## R13. 3D 에셋

- **Decision**: Kenney(방·가구), Quaternius(애니메이션 캐릭터), Poly Haven(HDRI·텍스처), 모두 CC0.
  `public/assets/CREDITS.md`에 파일별 출처를 적는다. 테마 3개의 첫 로딩 용량 목표는 테마당 5MB 이하
  (SC-001의 4G 10초 목표). GLB는 Draco/Meshopt 압축, 텍스처는 KTX2를 검토한다.

## R14. 메시지 신고 스냅샷 (채팅 미저장 유지)

- 문제: Hibernation된 DO는 소켓이 열려 있어도 메모리에서 내려갈 수 있고, ping 자동 응답은 DO를 깨우지 않는다. 메모리
  버퍼 방식이면 조용한 방에서 신고가 실패한다. 이는 clarify 답변("신고된 메시지 내용을 신고와 함께 저장")과 어긋난다.
- **Decision**: DO가 `chat`을 보낼 때 `sig = HMAC-SHA256(SERVER_SECRET, "chat|" + roomId|messageId|nickname|text|sentAt|channel)`을
  붙인다. 신고하는 클라이언트는 받은 메시지 필드와 `sig`를 그대로 보내고, Worker가 서명을 검증한 뒤 스냅샷으로 저장한다.
  클라이언트는 내용을 위조할 수 없고, 서버는 채팅을 저장하지 않으며, Hibernation과 무관하게 동작한다.
- 서명 유효 기간: `sentAt`에서 24시간. 지나면 400.
- **Alternatives**: DO 메모리 버퍼 — 위 문제로 기각. DO 저장소에 최근 채팅 저장 — 채팅 미저장 결정과 어긋나서 기각.

## R15. 개발 환경 재현 (Codespaces)

- `.devcontainer/devcontainer.json`: Node 22 이미지, `postCreateCommand`로 `npm ci`와 `npx playwright install --with-deps chromium`.
  웹 세션·Codespaces·Actions에서 같은 npm 스크립트로 개발·테스트한다(헌법 원칙 I).

## Sources

- Durable Objects 가격: https://developers.cloudflare.com/durable-objects/platform/pricing
- Durable Objects FAQ(무료 1GB, SQLite 전용): https://developers.cloudflare.com/durable-objects/reference/faq
- Durable Objects changelog(무료 플랜 SQLite DO): https://developers.cloudflare.com/durable-objects/changelog/
- DO 무료 한도 요약(3자): https://flarecalc.com/ , https://agentdeals.dev/go/cloudflare-durable-objects
- D1 가격: https://developers.cloudflare.com/d1/platform/pricing/
- D1 한도: https://developers.cloudflare.com/d1/platform/limits
- D1 무료 한도 강제(2026-09-01): https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/
- D1 무료 한도(3자): https://freetier.co/articles/cloudflare-d1-free-tier-limits-pricing-and-alternatives
- Workers 한도: https://developers.cloudflare.com/workers/platform/limits
- Workers 가격: https://developers.cloudflare.com/workers/platform/pricing/
- Rate Limiting 바인딩: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Rate Limiting 실험(3자): https://dev.classmethod.jp/en/articles/cloudflare-rate-limit-experiments/
- Preview URL(DO Worker 미지원): https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/
- Version URL: https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/
- npm 레지스트리(`npm view`, 2026-11-06 조회): 위 R1 버전

developers.cloudflare.com은 이 세션 네트워크에서 막혀 있어 위 공식 문서는 검색 결과 요약으로만 확인했다.
