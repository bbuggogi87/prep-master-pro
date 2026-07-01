# PREP MASTER PRO

식단·체중 기록과 운동(웨이트 트레이닝) 캘린더를 관리하는 순수 HTML/JS 웹앱입니다.
별도 빌드 과정이나 백엔드 서버 없이 동작하며, 모든 데이터는 브라우저 localStorage에 저장됩니다.

## 실행 방법

ES 모듈(`import`/`export`)을 사용하므로 `index.html`을 파일 탐색기에서 더블클릭(`file://`)하면
브라우저 보안 정책(CORS)에 막혀 실행되지 않습니다. 반드시 로컬 웹 서버로 열어야 합니다.

```bash
# 이 저장소 폴더에서 실행
python -m http.server 8080
# 또는
npx serve .
```

이후 브라우저에서 `http://localhost:8080/index.html`(식단 & 체중 기록) 또는
`http://localhost:8080/calendar.html`(운동 캘린더)로 접속합니다.

## 폴더 구조

```
index.html          식단 플래너 / 스마트 변환기 / 체중 기록 진입점
calendar.html        운동 캘린더 진입점
js/
  core/               두 화면이 공유하는 전역 상태(store.js)와 로컬 저장·백업 I/O(services.js)
  diet/               index.html 도메인 로직 (식단 마스터 데이터, 매크로 계산, 프로필, 체중 기록 등)
  workout/            calendar.html 도메인 로직 (운동 마스터 데이터, 운동 일지, 휴식 타이머, 분할 루틴 등)
```

`js/core`는 상태·저장 인프라, `js/diet`·`js/workout`은 각 화면의 도메인 로직으로 분리되어 있으며,
각 폴더의 `app.js`(diet) / `calendar.js`(workout)가 해당 화면의 오케스트레이터(초기화·탭 전환·전역 바인딩)입니다.

## 데이터 백업

환경설정 탭(또는 index.html 상단)의 "백업 내보내기"로 JSON 파일을 저장할 수 있고, 같은 화면에서 복원할 수 있습니다.
데이터는 기기의 브라우저에만 저장되므로, 다른 기기나 브라우저에서 이어서 쓰려면 이 백업/복원 기능을 이용하세요.
