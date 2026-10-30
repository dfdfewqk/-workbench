# Smart Maintenance

산업 현장의 **설비 예방점검·고장·정비 이력 통합 관리**를 위한 웹 애플리케이션입니다.

## 실행 및 데모

- [Vercel 공개 데모](https://smart-maintenance-aleph.vercel.app/) — 공개 사이트는 이 저장소의 최신 소스와 버전이 다를 수 있습니다.
- `index.html` — HTML/CSS/JavaScript를 합친 단일 파일 버전
- `docs/smart-maintenance/` — 모듈별 원본 HTML·CSS·JavaScript
- `SmartMaintenance-Start.cmd` — Windows 로컬 서버 실행용

**Windows 실행**: 저장소를 ZIP으로 내려받아 압축을 해제하고 `SmartMaintenance-Start.cmd`를 실행한 후, Chrome/Edge에서 `http://127.0.0.1:8765/`에 접속합니다. 서버 창은 사용 중 닫지 않습니다.

## 주요 기능

- 설비 등록·관리 및 설비별 점검표
- 일·주·월·연 예방점검 계획, 일정 계산, 미실시/조기 점검 상태
- 점검 결과 정상·주의·고장 판정, 임시저장과 이력 관리
- 고장 등록·연결, 정비 작업 및 진행 이력
- 설비 사진과 암호화 백업·복원
- 홈 / 점검 / 고장·정비 / 관리 메뉴와 반응형 화면

## 기술

HTML · CSS · Vanilla JavaScript · IndexedDB · PowerShell/Windows 로컬 서버 · Node.js 회귀 테스트

## 검증

```bash
node tests/check.mjs
```

기존 로컬 통합본으로 자동 검사를 수행했습니다. 일부 실제 브라우저 IndexedDB 저장·재실행 및 Windows 환경의 사용자 시나리오는 추가 확인이 필요합니다.

## 브라우저 저장 데이터 주의

사용자가 입력한 설비·점검·고장·정비 기록은 **브라우저의 IndexedDB**에 보관됩니다. 저장소 코드에는 테스트 기록이나 사용자 데이터가 포함되지 않습니다.

주소가 `file://`, `localhost`, `127.0.0.1`, Vercel 등으로 달라지거나 브라우저 프로필이 달라지면 서로 다른 데이터 저장 공간을 사용합니다. 중요한 기록은 앱의 암호화 백업 기능으로 보관하고, 브라우저 저장소를 함부로 초기화하지 마세요.

## 상태 및 용도

ALEPH Studio 과제 제출과 취업 포트폴리오용으로 정리한 **개인 프로젝트 프로토타입**입니다. 제작·검증이 완료되지 않은 사항을 상용 서비스 수준으로 보장하지 않습니다.
