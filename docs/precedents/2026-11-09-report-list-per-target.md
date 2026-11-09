# 관리자 신고 목록은 대상마다 한 줄, 처리 완료는 대상 단위

- 날짜: 2026-11-09
- 대상: specs/001-realtime-room-board/contracts/openapi.yaml `/admin/reports`·`/admin/reports/{reportId}/resolve`·`/admin/rooms/{roomId}` DELETE·`/reports` 400, data-model.md reports
- 출처: 001 US7 Worker PR #38 (T086~T090), PR #39 리뷰
- 대체한 판례: 없음

## 결정

- 목록은 상태(`open`/`resolved`)별로 대상(방, 또는 방의 메시지 하나)마다 한 줄이다. 그 상태의 가장 최근 신고가 대표(`id`, `reason`, `createdAt`)이고, `reportCount`는 그 상태에서 같은 대상의 신고 수다.
- 페이지는 대표 신고 `id` 내림차순 50개, `nextCursor`는 마지막 줄의 `id`.
- 처리 완료(`resolve/:id`)는 그 신고와 같은 대상의 `open` 신고를 모두 `resolved`로 바꾼다.
- 관리자 방 삭제(`DELETE /admin/rooms/:id`)가 이미 삭제된 방(소유자가 먼저 지움)을 만나면 410으로 답하되, 그 방의 `open` 신고는 그때도 모두 `resolved`로 바꾼다. `deleted_by`는 바꾸지 않는다.
- 메시지 신고가 서명은 맞고 24시간이 지났으면 400 `fields.message = "report.expired"`. 서명이 틀리면 `fields` 없는 400(만료 여부를 말하지 않는다).

## 이유

신고 행이 신고자마다 하나라서 그대로 보이면 같은 방이 여러 줄로 나오고, 관리자가 같은 대상을 여러 번 처리해야 한다. 스펙은 "한 번만 집계"를 말하고 `Report`에 `reportCount`가 있다.
그 방이 이미 삭제됐다고 신고를 남겨 두면 관리자 목록에 아무 동작으로도 지울 수 없는 줄이 남는다.
만료 문구(screens.md 신고 대화상자)를 고르려면 화면이 만료를 서명 오류와 구별해야 한다. `sentAt`이 서명 안에 있어서 서명 확인 뒤의 만료는 진짜 오래된 메시지뿐이다.

## 검토한 대안

- 신고마다 한 줄: 쿼리가 단순하지만 같은 대상이 반복되고 처리도 여러 번.
- 화면이 `sentAt`으로 만료를 직접 판단: 기기 시계에 기댄다.
