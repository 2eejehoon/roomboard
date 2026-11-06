# roomboard 작업 규칙

- 새 자동화(워크플로, 에이전트, 스크립트)는 머지 뒤 **실제로 한 번 돌려 결과를 확인**한 다음에 다음 단계로 간다.
  확인 결과(성공·실패·고친 것)는 해당 tasks.md 항목과 PR에 남긴다.
- 의존성을 새로 받을 때는 `npx npm@11 install`을 쓴다(npm 10.9는 `edgesOut` 오류). `npm ci`는 npm 10도 된다.
  npm 11은 패키지 설치 스크립트를 기본으로 막는다. 새 버전이 들어오면 `npx npm@11 install-scripts ls`로 확인하고,
  자기 바이너리만 받는 패키지(esbuild, workerd 등)만 `install-scripts approve`한다.
