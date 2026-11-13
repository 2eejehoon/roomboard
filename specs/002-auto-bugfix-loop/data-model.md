# Data Model: 자동 버그 수정·재발 방지 루프

저장 위치: **D1**(서비스와 같은 DB), **GitHub**(이슈·라벨·PR이 상태의 일부), **저장소 파일**(분류 목록, 판례).
개인정보는 어디에도 없다(헌법 II). 모든 텍스트는 저장 전에 `redact()`를 거친다(research R4).

## D1

### bug_fingerprints

| 컬럼 | 타입 | 규칙 |
|---|---|---|
| fingerprint | TEXT PK | 16자 hex (research R4) |
| source | TEXT NOT NULL | `client` \| `server` |
| error_name | TEXT NOT NULL | 최대 100자, 가림 적용 |
| summary | TEXT NOT NULL | 가린 메시지 최대 300자 |
| frames | TEXT NOT NULL | JSON 앱 코드 프레임 최대 20개 `{file, fn, line, col}` |
| count | INTEGER NOT NULL | 누적 발생 수 |
| synced_count | INTEGER NOT NULL DEFAULT 0 | 마지막 GitHub 동기화 때의 count |
| first_seen / last_seen | INTEGER NOT NULL | Unix ms |
| app_version_min / app_version_max | TEXT NOT NULL | |
| view_counts | TEXT NOT NULL | JSON `{"3d": n, "2d": n}` |
| browser_counts | TEXT NOT NULL | JSON `{"chrome": n, ...}` (브라우저 계열만, 버전·OS 상세 없음) |
| issue_number | INTEGER NULL | 연결된 이슈 |
| status | TEXT NOT NULL | `new` → `open` → `closed` → `regressed` → `open` … |
| gated | INTEGER NOT NULL DEFAULT 0 | FR-015 조건 충족 여부(client만 의미) |
| fixed_version | TEXT NULL | 이슈가 닫힐 때의 앱 버전(재발 판단용) |

- `regressed`: `closed`이고 `fixed_version` 이후 버전에서 다시 발생.
- 인덱스: `(status, last_seen)`.

### github_sync_state

| 컬럼 | 타입 | 규칙 |
|---|---|---|
| day | TEXT PK | `YYYY-MM-DD` (UTC) |
| issues_created | INTEGER NOT NULL DEFAULT 0 | 하루 상한 10 (FR-013). 수집 경로가 `reports_received`만으로 그날 행을 처음 만든다 |
| reports_received | INTEGER NOT NULL DEFAULT 0 | 그날 받은 자동 리포트 수, 하루 상한 1000 (FR-003, research R4) |

- 열린 버그 이슈 수(상한 20)는 동기화 때 GitHub에서 센다.

### user_bug_reports

| 컬럼 | 타입 | 규칙 |
|---|---|---|
| id | INTEGER PK | |
| text | TEXT NOT NULL | 1~1000자, 접수 시 가림 적용. 비공개 |
| context | TEXT NOT NULL | JSON `{view, themeId, connection, recentFingerprints[≤5], appVersion, browser}` |
| status | TEXT NOT NULL | `pending` → `issued` \| `discarded`(즉시 행 삭제) |
| issue_number | INTEGER NULL | |
| created_at | INTEGER NOT NULL | 30일 뒤 Cron이 행 삭제 |

## GitHub 라벨 (상태의 일부, contracts/github.md)

`source:service`, `source:user-report`, `agent:gated`, `agent:run`, `agent:skip`, `agent:working`, `agent:queued`,
`agent:attempt-1`, `agent:attempt-2`, `agent:needs-human`, `regressed`, `kind:guardrail`, `kind:doc-garden`, `cause:<id>`,
`no-precedent`.

## 저장소 파일

- `.github/mistake-categories.yml`: `- id: <kebab>` / `description: <한 줄>`. 라벨 `cause:<id>`와 리뷰 태그 `[mistake:<id>]`의 허용 목록.
- `docs/precedents/*.md`: 헌법 Governance 형식.
- `/manifest.json`(빌드 산출물, 정적 자산으로 배포): `{"version": "<앱 버전>", "chunks": ["index-BXjaK0XS.js", …]}`. Worker가 `ASSETS`로 읽어
  FR-015 게이트(청크 이름)와 앱 버전 검사·서버 오류의 버전에 쓴다. 없거나 JSON이 아니면 게이트를 열지 않고 버전은 `unknown`.

## 상태 전이

```text
Fingerprint: new --(client: count≥3 & manifest 일치 → gated) / (server: 즉시)--> 이슈 생성 → open
             open --이슈 닫힘--> closed --fixed_version 이후 재발--> regressed → 이슈 재오픈 → open
Issue(agent): labeled/reopened/dispatch → [gate, 현재 라벨 기준] → agent:working → (PR | agent:needs-human | agent:queued)
              agent:queued --매시 큐--> agent:working
              같은 이슈 실패 2회 → agent:needs-human (자동 실행 중단)
UserReport:   pending --운영자 이슈화--> issued / --버리기--> (삭제) / 30일 --> (삭제)
```
