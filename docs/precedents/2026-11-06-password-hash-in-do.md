# 글 비밀번호 해시는 방 DO 안에서 계산

- 날짜: 2026-11-06
- 대상: specs/001-realtime-room-board/research.md R5, plan.md 구조(`password.ts`), tasks.md T040·T062·T064·T082
- 출처: 001 Foundational F2 PR (T011 측정)
- 대체한 판례: 없음

## 결정

PBKDF2-SHA256 100,000회 해시의 계산과 검증을 Worker가 아니라 그 방의 Durable Object 안에서 한다. Worker는 DO RPC
(`hashPassword`, `verifyPassword`)로 부른다. 알고리즘, 반복 수, 저장 형식은 그대로다.

## 이유

T011 측정에서 로컬 workerd 1회 중앙값이 19ms(16~20ms)로, 무료 플랜 Worker 요청당 CPU 10ms를 넘었다. DO는 요청당 CPU
30초라 여유가 있다. tasks.md T011이 미리 정한 "10ms를 넘으면 R5의 대안" 조건이 충족됐다.

## 검토한 대안

- 반복 수를 50,000회 이하로 줄여 Worker에서 계산: 해시 강도가 절반 이하가 되어 기각.
- Workers Paid로 올려 CPU 한도 확대: 사용자가 없는 지금 고정 비용만 생겨 보류(R2).
- bcrypt/argon2 WASM: R5에서 이미 기각(번들·CPU 부담).
