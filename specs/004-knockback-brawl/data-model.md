# Data Model: 넉백 난투

새 D1 테이블·컬럼은 없다(FR-037). 상태는 세 곳에만 있다: **코드 상수**(조정표, 기본 경기장, 모습 목록),
**방 DO 메모리 + 소켓 attachment**(경기 참가자 상태), **DO 저장소 `arena:<채널>`**(지은 블록과 진행 중인 판, 채널이 비면 지움, 블록은 2초에 한 번 씀, research R6).
개인정보는 없다. 참가자는 001처럼 `peerId`와 랜덤 닉네임으로만 보인다.

## 조정표 `TUNING` (`src/core/brawl/tuning.ts`, FR-030)

spec의 이름 ↔ 코드 키. 값은 spec과 research R12의 초기값이다. 서버·화면·테스트가 이 객체만 읽는다.

| spec 이름 | 키 | 초기값 |
|---|---|---|
| 기술 표(피해·기본 넉백·넉백 성장·각도) | `skills.{jab1, jab2, jab3, smash, throw}.{damage, base, growth, angleDeg}` | spec "맨손 기술" 표. 강펀치 `damage`는 `[12, 22]` |
| 던지기 위쪽 각도 | `skills.throw.angleDeg` | 45(R12) |
| 닿는 거리, 다시 쓰기 시간 (FR-012) | `skills.*.reach`, `skills.*.cooldownMs`, `reachSlack` | R12 |
| 몸무게 | `weight` | 100 |
| 경직 계수, 경직 상한 | `hitstunMsPerStrength`, `hitstunMaxMs` | 40 ms, 300 ms |
| 방어 감소율·각도 | `guard.reduction`, `guard.arcDeg` | 0.8, 120 |
| 구르기 시간·기력 | `roll.invulnMs`, `roll.stamina` | 300, 15 |
| 기력 최대·회복 | `stamina.max`, `stamina.perSec` | 100, 10 |
| 연타 간격 | `jabChainMs` | 400 |
| 모으기 시간 | `smashChargeMs` | 1000 |
| 재시작 시간 | `respawnMs` | 3000 |
| 타격 정지 최소·최대·증가 계수·마무리 기준 | `hitstop.minMs`, `hitstop.maxMs`, `hitstop.msPerStrength`, `hitstop.finisherStrength` | 30, 150, 4, 30 |
| 숫자 색 기준 | `damageColor.yellowFrom`, `damageColor.redFrom` | 50, 100 |
| 블록 크기·내구 | `block.size`, `block.hp.{dirt, stone}` | 1 m, 1, 4 |
| 벽 뚫림 기준 | `wall.breakAt.{dirt, stone}` | 3, 10 |
| 벽 반발 계수, 벽 추가 피해 | `wall.bounce`, `wall.damagePerStrength` | 0.5, 0.5 |
| 낙법 시간 | `wall.techWindowMs` | 200 |
| 방향 틀기 각도 | `steerMaxDeg` | 15 |
| 공중 점프·복귀기 횟수와 세기 | `air.jumps`, `air.recovers`, `air.jumpSpeed`, `air.recoverSpeed` | 1, 1, 8, 12 m/s |
| 중력, 넉아웃 높이 | `gravity`, `koDepth` | 20 m/s², 바닥 −10 m |
| 목숨 수, 판 제한 시간 | `match.stocks`, `match.limitMs` | 3, 300000 |
| 넉백 세기 → 속도 계수 | `speedPerStrength` | 0.6 m/s |
| 블록 요청 제한 | `blockRate` | 초당 4 |
| 궤적 계산 간격 | `stepMs` | 1000/60 |
| 땅 미끄럼 감속 | `groundFriction` | 6 m/s²(research R3·R12) |

## 경기장 Arena (`src/core/brawl/arena.ts`)

```text
Arena {
  bounds: Bounds             // 테마 범위 밖의 상자 영역(research R5). 이 안이 경기장, 밖은 평화 구역
  origin: Vec3               // 칸 (0,0,0)의 월드 좌표. 칸 [x,y,z]는 origin + [x,y,z] × block.size
  size: [w, h, d]            // 칸 수. 기본 24×12×24
  defaultBlocks: Block[]     // 돌 바닥 한 겹(FR-016). 모든 방이 같이 쓰는 상수
  starts: Cell[]             // 시작 지점(재시작·입장). 블록을 놓을 수 없음
  exit: Cell                 // 출구 칸. 걸어 들어가면 방 시작 지점으로(FR-014)
  koY: number                // 넉아웃 높이 = 바닥 − koDepth
}
Theme.arenaEntrance: Cell    // 테마마다 방 공간의 입구 칸(themes.ts에 추가)
Block { cell: Cell, kind: 'dirt' | 'stone', hp: number }
Cell = [x, y, z]             // 정수 칸 좌표
```

- 채널 경기장 = 기본 블록 + 차이(`changed: Map<cellKey, Block | null>`, null은 부서진 기본 블록). 저장소 `arena:<채널>`에 차이만 둔다.
- 놓기·부수기 대상(FR-015a): `targetCell(pose, height)` = 보는 방향(`r`를 네 방향으로 반올림) 바로 앞 칸, 높이 `-1 | 0 | 1`
  (앞 칸 아래 · 발 높이 · 눈 높이). 내 몸 칸·내 바로 아래 칸은 대상이 아니다.
- 놓기 허용: 경기장 영역 안, 시작 지점·출구 아님, 빈 칸(블록도 참가자 몸도 없음). 부수기 허용: 블록이 있는 칸. 한 번에 `hp − 1`, 0이면 없어진다.

## 경기 참가자 상태 Fighter (`src/core/brawl/fighter.ts`, attachment의 `fighter`)

| 필드 | 규칙 |
|---|---|
| damage | 0~999 정수 %. 넉아웃·판 종료·되돌리기 때 0 |
| stamina | 0~max, `staminaAt` 시각부터 초당 회복을 계산(저장은 값과 시각만) |
| stunUntil | 경직 끝 시각. 이 전에는 기술·방어·구르기·공중 동작 거부(방어 누름은 낙법 판정용으로 기록) |
| invulnUntil | 구르기 무적 끝 시각 |
| cooldownUntil | 기술별 다시 쓸 수 있는 시각(때린 사람의 타격 정지 끝 + 다시 쓰기 시간, FR-012) |
| jabStep, jabAt | 잽 연타 단계(1~3)와 마지막 잽 시각 |
| holdAt | 강펀치 모으기 시작 시각(`hold` 수신), 없으면 null |
| guarding, guardPressedAt | 방어 누르는 중인지, 마지막 누른 시각(낙법) |
| inputDir | 마지막 `move.d`(방향 틀기·던지기 방향) |
| airJumps, airRecovers | 남은 공중 점프·복귀기. 착지 때 다시 참 |
| flight | 지금 궤적 `Launch` 또는 null. null이 아니면 서버가 위치의 주인. 경직이 풀렸으면 날아가는 중에도 기술을 쓴다(구르기만 땅에서) |
| knockedOutAt | 넉아웃 시각, 재시작 전까지. 탈락이면 `eliminated: true` |

- 상태 전이: `서 있음` →(맞음)→ `타격 정지` →(정지 끝)→ `날아감(flight)`(공중 또는 윗면 미끄러짐) →(미끄러짐 멈춤 = 착지)→ `서 있음`(경직 남으면 경직) /
  →(벽)→ 튕김·뚫림이면 새 `flight`, 낙법이면 `서 있음`(경직 끝) / →(koY 아래)→ `넉아웃` →(respawnMs)→ `서 있음` 또는 `탈락`.
- 경기장 밖(평화 구역)에 있으면 fighter는 공격·피격 대상이 아니다(FR-013).

## 넉백 Launch (`src/core/brawl/flight.ts`)

```text
Launch { t: number, p: Vec3, v: Vec3, s: number, cause: 'hit' | 'wall' | 'air' | 'recover' | 'block' }
FlightEnd { kind: 'land' | 'wall' | 'ko', t: number, p: Vec3, cell?: Cell }
```

- `t`는 타격 시각 + 타격 정지(FR-020). `v` = 방향 단위 벡터(방향 틀기 반영) × s × speedPerStrength, 소수 3자리로 반올림(research R3).
- `s`는 그 궤적의 시작 세기. 뚫림 기준·벽 추가 피해·반발은 이 값으로(FR-019). 튕김의 새 `s` = s × wall.bounce.
- 계산 순서(FR-002·FR-010): 방어 중 정면이면 피해 × (1 − 0.8) → damage에 더함(상한 999) → s = base + damage × growth × (100/weight)
  → 방어면 s × (1 − 0.8). 경직(ms, 타격 시각부터) = max(타격 정지, min(hitstunMaxMs, s × hitstunMsPerStrength)). 타격 정지 = 마무리면 maxMs, 아니면 min(maxMs, minMs + s × msPerStrength).

## 판 Match (`src/core/brawl/match.ts`, 저장소 `arena:<채널>`의 `match`)

```text
Match { state: 'running', startedAt, endsAt, players: { peerId, stocks, out?: number }[] }
```

- 시작(FR-025): 경기장에 2명 이상이고 요청자가 경기장에 있을 때. 그 순간 경기장에 있는 사람이 players, 모두 피해 0%.
- 진행 중 경기장 입장: players만(나머지는 입구에서 막혀 방 시작 지점에 그대로). 출구로 나감·연결 끊김 = 탈락(out 기록).
- 넉아웃마다 stocks − 1, 0이면 탈락(평화 구역 시작 지점으로). `out`은 탈락 순서 번호이고 같은 서버 판정에서 함께 탈락하면 같은 번호.
- 끝: 남은 사람 ≤ 1, 또는 endsAt(FR-025a). 순위 = 남은 사람(목숨 많은 순 → 피해 낮은 순, 같으면 같은 순위) 다음에 out 역순.
  모두 함께 탈락하면 공동 1위(FR-027). 결과를 보낸 뒤 match를 지우고 참가자 피해를 0%로. 되돌리기(FR-040)는 `cancelled`로 끝낸다.

## 모습 목록 `LOOKS` (`src/client/brawl/looks.ts`, FR-030a)

```text
LOOKS {
  blocks: { dirt: { model | color }, stone: { model | color } }
  arena: { boundary: color, exit: color, entrance: color }   // 평화 구역 경계 표시(FR-014)
  trail: { width, length, color }                            // 꼬리(FR-021)
  damageText: { font, colors: { white, yellow, red } }       // 색 바뀌는 기준은 TUNING.damageColor
  shake: { strengthFrom, amplitude }                         // 화면 흔들림(FR-023)
  sfx: { hit, smash, wall, ko }                              // CC0 파일 경로
}
```

- 화면 흔들림 끄기는 기기 localStorage `roomboard.shake = "off"`(FR-023). 개인정보 아님.
