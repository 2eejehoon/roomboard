# PR 미리보기는 PR마다 별도 Worker·D1

- 날짜: 2026-11-06
- 대상: specs/001-realtime-room-board/research.md R3, plan.md 개발 워크플로
- 출처: 001 plan, PR #3
- 대체한 판례: 없음

## 결정

PR마다 `roomboard-pr-<번호>` Worker와 D1을 배포하고 PR이 닫히면 지운다.

## 이유

Durable Object를 구현한 Worker는 Cloudflare Preview/Version URL이 생성되지 않는다. PR마다 D1을 따로 두면 PR끼리 마이그레이션이 달라도 충돌하지 않는다.

## 검토한 대안

앞단 Worker만 미리보기 + 운영 DO 공유(데이터 섞임), 미리보기 D1 하나 공유(스키마 충돌).
