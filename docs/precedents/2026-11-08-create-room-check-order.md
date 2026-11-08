# 방 만들기는 입력 검사 뒤에 Turnstile, 목록 limit 범위 밖은 400

- 날짜: 2026-11-08
- 대상: specs/001-realtime-room-board/tasks.md T064, contracts/openapi.yaml `POST /rooms`·`GET /rooms`
- 출처: 001 US3 서버 PR (T058~T064)
- 대체한 판례: 없음

## 결정

- `POST /api/rooms`의 순서는 rate limit(`RL_CREATE`) → 입력 검사(zod) → Turnstile siteverify → 필터 → 비밀번호 해시 → D1이다.
  T064 처음 순서(Turnstile → zod)를 바꿨다.
- 클라이언트는 400이면 위젯 토큰을 그대로 두고, 403·500처럼 siteverify를 거친 뒤의 실패에서만 위젯을 다시 받는다.
- `GET /api/rooms`의 `limit`이 1~50 밖이거나 숫자가 아니면, 또는 `cursor`가 서버가 준 형식이 아니면 400 `validation`이다.
  값을 조용히 고치지 않는다(openapi 범위 그대로).

## 이유

Turnstile 토큰은 한 번만 검증된다. 검증을 먼저 하면 제목 오류 하나로 토큰이 쓰여서, 고쳐서 다시 낸 요청이 403이 된다.
입력 검사는 비용이 작고 rate limit 뒤라서 먼저 해도 봇이 얻는 것이 없다.

## 검토한 대안

- Turnstile 먼저, 클라이언트가 모든 실패 뒤에 위젯 재설정: 사용자가 오류를 고칠 때마다 봇 확인을 다시 기다린다.
- `limit` 범위 밖을 1~50으로 맞춤: openapi의 `maximum`과 달라지고, 잘못 부른 쪽이 오류를 모른다.
