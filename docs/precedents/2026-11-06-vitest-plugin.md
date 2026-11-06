# Worker 테스트는 @cloudflare/vitest-plugin, Vitest 5.1

- 날짜: 2026-11-06
- 대상: specs/001-realtime-room-board/plan.md Technical Context, research R1·R12
- 출처: 001 Setup PR
- 대체한 판례: 2026-11-06-tooling-version-pins.md (Vitest 부분)

## 결정

Worker·DO 테스트 도구를 `@cloudflare/vitest-plugin` 1.6으로 바꾸고 Vitest를 5.1로 올린다. TypeScript 6.0 고정은 그대로다.

## 이유

`@cloudflare/vitest-pool-workers`는 이름이 바뀌어 더 이상 갱신되지 않는다(패키지 README). 새 패키지는 Vitest 5를 지원하므로
Vitest를 4.1에 묶어 둘 이유가 없어졌다. 테스트가 적은 지금 옮기는 비용이 가장 작다.

## 검토한 대안

옛 패키지와 Vitest 4.1 유지(보안·버그 수정이 끊김), 새 패키지 + Vitest 4.1(옛 이유 없이 구버전 유지).
