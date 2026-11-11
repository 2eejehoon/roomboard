# Data Model: 시각 품질 개선

저장 데이터(D1·DO)와 프로토콜은 바뀌지 않는다. 바뀌는 것은 코드 안의 테마 정의뿐이다.

## Theme (001 data-model "Theme"에 필드 추가)

| 필드 | 뜻 | 규칙 |
|------|----|------|
| `look.kind` | `indoor` \| `outdoor` | indoor는 벽 4면, outdoor는 하늘·안개 |
| `look.floor` | 바닥 색 | `#rrggbb` |
| `look.wall` | 벽 색(indoor) | `#rrggbb`, outdoor면 없음 |
| `look.sky` | 배경색 | `#rrggbb` |
| `look.sun` | 해 색·세기·방향 | 세기 0 초과, 방향은 위에서 아래(y < 0) |
| `look.ambient` | 하늘·땅 색과 세기 | 세기 0 초과 |
| `look.fog` | 안개 시작·끝 거리(outdoor) | 시작 < 끝, 끝은 경계 대각선 이상 |

- 테마 3개 모두 `look`을 가진다. 테마끼리 `sun` 색이나 `ambient` 색이 다르다(US1 시나리오 4).
- 색 대비 규칙(화면): 본문 글자와 배경 4.5:1 이상(SC-003). 계산은 WCAG 상대 휘도.

## Avatar 피부색 표 (R4 결과가 "원본도 어둡다"일 때만)

| 필드 | 뜻 |
|------|----|
| `avatarId` | `char-01`~`char-08` |
| `skin` | 피부 재질 색 `#rrggbb` |
