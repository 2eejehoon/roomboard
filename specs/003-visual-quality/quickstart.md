# Quickstart: 시각 품질 개선 확인

## 준비

001 quickstart의 준비와 같다(`npm ci`, `npm run build`, Playwright의 Chromium).

## V1. 기준 화면 만들기

`npx playwright test visual --trace off` → `test-results/visual/`에 [contracts/visual-baseline.md](contracts/visual-baseline.md)의
화면이 생긴다. 자동 검사(밝기·그림자·대비·가로 스크롤·터치 크기)가 모두 통과해야 한다.

## V2. 첫 로딩 용량과 속도

`npx playwright test perf --project=mobile --trace off` → SC-001 10초 이내, 3D 에셋 합계가 001보다 작다(HDRI 제거, research R1).
`npm run check:bundle` 통과.

## V3. 접근성과 2D

`npx playwright test a11y us2-fallback --trace off` 통과(FR-012).

## V4. 운영자 판정 (SC-001)

PR 미리보기 배포(T097) 주소를 휴대폰에서 열어 테마 3개 방, 목록, 방 만들기를 보고 판정한다.
CI 결과물 `visual`의 스크린샷도 같은 화면이다.
