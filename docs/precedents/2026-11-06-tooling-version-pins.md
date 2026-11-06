# Vitest 4.1, TypeScript 6.0 고정

- 날짜: 2026-11-06
- 대상: specs/001-realtime-room-board/research.md R1, plan.md Technical Context
- 출처: 001 plan, PR #3
- 대체한 판례: 없음

## 결정

Vitest는 최신 5.1 대신 4.1, TypeScript는 7.0 대신 6.0을 쓴다. 나머지 의존성은 2026-11-06 최신 버전으로 고정한다.

## 이유

`@cloudflare/vitest-pool-workers` 0.23이 vitest ^4.1만 지원한다. TypeScript 7.0(네이티브 포트)은 나온 지 얼마 안 돼 도구 호환이 검증되지 않았다.

## 검토한 대안

Vitest 5.1(DO 테스트 불가), TypeScript 7.0(호환 위험).
