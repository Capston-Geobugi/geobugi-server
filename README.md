# geobugi

Electron, React, MediaPipe Pose, SQLite를 사용한 웹캠 기반 자세 교정 데스크톱 앱입니다.

현재 구현 범위는 아래와 같습니다.

- MediaPipe Pose 기반 상체 자세 측정
- 개인 기준 자세 캘리브레이션
- 실시간 자세 상태 분류 (`good` / `warning` / `bad`)
- 자세 세션 및 상태 로그 저장
- 스트레칭 미션 기록 API
- 일간 / 주간 리포트 집계 API

## Tech Stack

- Electron
- React
- Vite
- MediaPipe Tasks Vision
- SQLite (`better-sqlite3`)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

## 📂 Backend Folder Structure (`src/main/`)


```text
src/main/
 ├── index.js              # [진입점] 윈도우 창 생성 및 DB/API 초기화 실행
 ├── database/
 │    └── db.js            # SQLite DB 연결 및 테이블 스키마 관리
 ├── controllers/
 │    ├── postureController.js  # 자세 로그 저장 및 분석 비즈니스 로직
 │    └── reportController.js   # 일일/주간 통계 리포트 비즈니스 로직
 └── ipc/
      └── ipcRouter.js     # 프론트엔드의 요청(채널명)을 컨트롤러 함수와 매핑
```

---

## 📡 API Reference (구현 예정)

### 1. 기준 자세 캘리브레이션 API
사용자의 올바른 자세(OSHA 가이드라인 기준)를 측정하고 저장하여, 이후 실시간 자세 분석의 '영점'으로 활용합니다.
| 메서드 호출 예시 | 설명 |
| :--- | :--- |
| `await window.api.calibration.get()` | 저장된 개인화 캘리브레이션 데이터(목/어깨 각도, 랜드마크 기준점 등)를 불러옵니다. 앱 실행 시 가장 먼저 호출합니다. |
| `await window.api.calibration.save(data)` | 웹캠을 통해 초기 설정된 사용자의 기준 자세 데이터를 SQLite DB에 저장합니다. |

### 2. 실시간 자세 로깅 및 피드백 API
실시간 자세 상태를 기록하고 시스템 알림을 제어합니다.
| 메서드 호출 예시 | 설명 |
| :--- | :--- |
| `await window.api.posture.logState(state)` | 실시간으로 분석된 사용자의 자세 상태(Good / Warning / Bad)를 타임스탬프와 함께 DB에 기록합니다. |

### 3. 스트레칭 미션 API
일정 시간 작업 후 스트레칭을 유도하고 그 결과를 관리합니다.
| 메서드 호출 예시 | 설명 |
| :--- | :--- |
| `await window.api.stretching.getMission()` | 현재 사용자에게 필요한 스트레칭 종류와 가이드 영상(또는 이미지) 정보를 프론트엔드로 전달합니다. |
| `await window.api.stretching.logResult(res)` | 웹캠으로 확인된 스트레칭 미션 성공 여부와 수행 시간을 DB에 저장합니다. |

### 4. 분석 리포트(통계) API
사용자에게 일일 및 주간 자세 습관 리포트를 제공하기 위해 로그 데이터를 집계합니다.
| 메서드 호출 예시 | 설명 |
| :--- | :--- |
| `await window.api.report.getDaily(date)` | 특정 날짜의 자세 비율, 거북목 발생 횟수, 최장 연속 Bad 자세 유지 시간 등의 하루 통계를 계산하여 반환합니다. |
| `await window.api.report.getWeekly(start, end)`| 주간 자세 변화 추이, 스트레칭 미션 달성률 등을 시계열 데이터(배열 형태)로 가공하여 반환합니다. |