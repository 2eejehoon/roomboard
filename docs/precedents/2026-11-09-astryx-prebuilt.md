# 화면 컴포넌트는 Astryx, 미리 빌드된 CSS로 쓴다

- 날짜: 2026-11-09
- 대상: specs/001-realtime-room-board/research.md R1·R16, plan.md Primary Dependencies, tasks.md Phase 9a
- 출처: Astryx 도입 PR (T100), 운영자 요청
- 대체한 판례: 없음

## 결정

- 2D·폼·목록·안내 화면을 `@astryxdesign/core` + `@astryxdesign/theme-neutral` 컴포넌트로 바꾼다.
- 미리 빌드된 CSS(`reset.css`, `astryx.css`, `theme.css`)만 쓰고 StyleX 빌드 플러그인은 쓰지 않는다.
- 0.x라 버전을 정확히 고정하고, `postinstall`(안내 출력)은 거부한다. CLI `init`은 쓰지 않는다.
- 컴포넌트 안 문구는 Astryx의 `ko-KR` 카탈로그, 우리 문구는 계속 `ko.ts`(R10).
- 화면을 바꾸는 PR은 동작·문구를 바꾸지 않는다. 스펙에 없는 기능(지우기 버튼, 선택 표시 등)을 켜지 않는다.

## 이유

- 지금까지 화면은 의미 있는 HTML뿐이라 디자인이 없었다. 화면이 다섯 개일 때 옮기는 것이 US7 관리자 화면까지 만든 뒤보다 싸다.
- 우리 스타일이 거의 없어 빌드 플러그인이 컴파일할 것이 없다. Vite는 미리 빌드된 파일로 충분하다(Astryx README).
- 첫 청크 gzip +44KB, CSS 44KB는 SC-001(4G 10초)에 비해 작다(R16 측정).
- `init`은 CLAUDE.md·AGENTS.md를 고쳐 merge-gate 밖의 에이전트 규칙을 바꾼다.

## 검토한 대안

- StyleX 빌드 플러그인: 설정 파일과 Babel이 늘고 얻는 것이 없다.
- 직접 CSS: 화면마다 접근성·모바일 처리를 다시 만든다.
- 기능을 다 만든 뒤 교체: 옮길 화면만 늘어난다.
