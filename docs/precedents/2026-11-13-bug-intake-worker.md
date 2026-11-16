# 오류 리포트 수집 Worker: 파일 이름도 가림, manifest가 없으면 닫힌 쪽으로

- 날짜: 2026-11-13
- 대상: specs/002-auto-bugfix-loop research R4·R5, data-model `/manifest.json`·`github_sync_state.issues_created`, FR-001~003·FR-015, tasks T035·T036
- 출처: T036 PR (a)(세션 판단), PR #58·#60 리뷰
- 대체한 판례: 없음

## 결정

- `frame.file`은 마지막 경로 조각만 남긴 뒤 `redact()`도 적용한다.
- 배포 버전과 청크 이름은 정적 자산 `/manifest.json`(`{version, chunks}`)에서 `ASSETS`로 읽는다. 없거나 JSON이 아니면 클라이언트 지문은
  gated가 되지 않고 클라이언트 `appVersion`은 `unknown`이 된다. 서버 오류는 manifest 버전(없으면 `unknown`)으로, 바로 gated.
- FR-015의 "스택 파일 이름"은 지문을 만드는 상위 앱 프레임 3개다.
- 하루 총량은 한 문장 upsert(`… WHERE reports_received < 1000`)로 센다. 서버 오류도 같은 총량에 든다.
- 서버 오류는 `onError`에서 `waitUntil`로 기록하고, 기록 실패는 500 응답을 바꾸지 않는다. 수집 경로는 오류를 모두 삼켜 202를 돌려주므로
  자기 오류로 지문을 만들지 않는다(spec Edge Cases).
- `github_sync_state.issues_created`는 `DEFAULT 0`(수집 경로가 그날 행을 처음 만든다).

## 이유

- 파일 이름은 공개 이슈의 스택 줄에 그대로 들어간다. 위조한 이름에 남의 이메일·전화번호를 넣을 수 있다. 실제 청크 이름은 가림 패턴에 걸리지 않는다.
- manifest는 PR (b)의 빌드 설정이 만든다. 그 전에 게이트를 열면 위조 리포트가 에이전트를 실행할 수 있다. 닫힌 쪽이 안전하고, 클라이언트 수집(T037)도 그 뒤라 잃는 것이 없다.
- 상위 3개 밖의 프레임은 지문에 들지 않고, 브라우저 확장 등 앱 밖 프레임이 섞이면 진짜 오류도 게이트를 못 연다.
- 확인과 증가를 따로 하면 동시 요청이 상한을 넘긴다.

## 검토한 대안

- 파일 이름을 `^[\w.-]+$`로만 허용: 규칙이 하나 더 생긴다. 이미 있는 `redact()`로 충분. 기각.
- manifest를 Worker 번들에 넣기: 청크 이름이 정해진 뒤에 Worker를 묶도록 빌드 순서를 다시 짜야 한다. 정적 자산이면 빌드가 파일 하나만 쓰면 된다. 기각.
- 서버 오류는 하루 총량에서 빼기: 서버 오류를 일으키는 요청을 반복하면 D1 쓰기가 끝없이 는다. 기각.
대체됨: 2026-11-13-intake-limit-alert.md
