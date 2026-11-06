# 자동 이슈 생성은 fine-grained PAT

- 날짜: 2026-11-06
- 대상: specs/002-auto-bugfix-loop/research.md R3
- 출처: 002 plan
- 대체한 판례: 없음

## 결정

Worker는 이 저장소의 Issues 읽기·쓰기만 가진 fine-grained PAT로 이슈를 만든다. 봇 이슈 구분은 작성자가 아니라 `source:service` 라벨로 한다. 만료 30일 전 Cron이 알림 이슈를 연다.

## 이유

가장 적은 코드로 최소 권한을 만족한다. 외부 사용자는 라벨을 붙일 수 없어 라벨로 구분해도 안전하다.

## 검토한 대안

GitHub App(만료 없음, 봇 계정이지만 JWT·설치 토큰 코드 필요). PAT 관리가 번거로워지면 옮긴다.
