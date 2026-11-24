# Quickstart: 넉백 난투 확인

001 [quickstart.md](../001-realtime-room-board/quickstart.md)로 개발 서버를 띄운 상태에서 한다. 설계는 [plan.md](plan.md),
메시지는 [contracts/websocket.md](contracts/websocket.md), 수치는 [data-model.md](data-model.md) "조정표".

## 1. 단위 테스트 (SC-004, SC-005)

```bash
npx vitest run tests/core/brawl
```

- 넉백 공식·경직·타격 정지·방어 순서가 조정표 값으로 계산한 값과 같다(spec US1 시나리오 1·2·5·7, research R11의 20.4·32.4·126, 경직 상한 0.3초).
- 같은 `launch`와 블록으로 `stepFlight`를 두 번 돌리면 모든 점이 같고, 벽 튕김·뚫림·낙법·착지·넉아웃이 FR-019대로다.
- 조정표 값 하나를 바꾼 사본으로 판정 함수를 부르면 결과가 따라 바뀐다(코드 다른 곳은 그대로).

## 2. 방 DO 테스트 (FR-031·FR-034)

```bash
npx vitest run tests/worker/brawl
```

- 가짜 소켓 2~3개로: 평화 구역에서는 맞지 않음, 다시 쓰기 시간·닿는 거리 밖 요청은 무시, 블록 놓기 칸 규칙, 판 시작·탈락·순위,
  잠들었다 깨어도 지은 블록과 판이 남음, 채널이 비면 `arena:<채널>`이 지워짐, close 이벤트 없이 소켓이 사라져도 정리 alarm이 키를 지움, `resetArenas()`.

## 3. E2E (브라우저 2~3개, 헌법 III)

```bash
npx playwright test tests/e2e/us*-brawl*.spec.ts
```

- US1: 두 브라우저가 경기장에 들어가 잽 → % 증가, 반복해 넉아웃 → 3초 뒤 0%로 다시 섬. 평화 구역에서는 공격 버튼이 막힌다.
- US3: 한쪽이 흙 블록을 놓으면 다른 쪽에 같은 칸으로 보인다(2D 화면 버튼으로도).
- US4: 브라우저 3개로 판을 시작해 모든 화면에 같은 순위가 나온다.
- 2D(FR-033): 2D 화면의 옆 그림과 글 기록으로 같은 놀이를 한다. a11y.spec이 계속 통과한다.
- 기존 E2E와 perf.spec(SC-007)이 그대로 통과한다.

## 4. 부하 다시 재기 (SC-006, research R1)

측정용 DO(plan 단계의 설계 흉내)로:

```bash
npx wrangler dev -c tests/bench/brawl-load/wrangler.jsonc --port 8787 --ip 127.0.0.1 &
for n in 2 4 8 12 20; do node tests/bench/brawl-load/clients.mjs $n 20; done
for n in 12 20; do SPREAD=1 node tests/bench/brawl-load/clients.mjs $n 20; done   # 가장 무거운 배치
```

- 끝나면 `rm -rf tests/bench/brawl-load/.wrangler`(wrangler가 만든 번들, 린트가 읽는다).
- 합격: N=20에서 마지막 상대 도착 p95 ≤ 50ms, p99 ≤ 100ms, 클라이언트당 ≤ 50KB/s.
- 실제 서버(tasks T054·T055): `npm run build` 뒤 `npx vite preview --port 4173`을 띄우고
  `node tests/bench/brawl-load/real.mjs http://localhost:4173 - <N> 20`(`-`는 방을 새로 만듦, 방 만들기는 분당 3개라 같은 배치는 방 id를 다시 쓴다). PR 미리보기는 운영자가 만든 방 id로.
- SC-002(T056): `npx playwright test -c tests/bench/perf-brawl --project mobile --trace off`. 소프트웨어 WebGL은 한 프레임이 0.1초보다 길어 기록만 하고, 판정은 5의 실제 휴대폰.

## 5. 사람이 보는 확인

- PR 미리보기를 휴대폰과 PC로 열어 손맛(타격 정지, 꼬리, 숫자 색, 흔들림 끄기)을 운영자가 본다(spec US2).
- SC-001: 운영자와 지인 3명이 설명 없이 1분 안에 잽으로 밀어내고 평화 구역으로 돌아가는지 본다. 이때 research R11 조정 후보를 함께 본다.
- SC-002: 경기장에 여러 명이 있을 때 휴대폰에서 잽을 누르면 번쩍임이 바로(0.1초 안) 보이는지 본다(소프트웨어 WebGL로는 판정할 수 없음, tasks T056).
