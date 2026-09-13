# GovBiz 문서 안내

[메인 README](../README.md)로 돌아가기

메인 README는 프로젝트 소개와 빠른 시작만 안내합니다. 상세 설명은 아래 문서에서 관리합니다.

## 구조와 구현 범위

| 문서 | 확인할 내용 |
|---|---|
| [아키텍처 README](architecture/README.md) | 서비스 경계, Frontend·Core API·AI Service의 계층·DI·디자인 패턴 |
| [서비스 호출·데이터 흐름](architecture.md) | 검색·상세·RAG·동기화·키워드/벡터 복구와 오류 처리 순서 |
| [기술 스택과 데이터 구성](technology.md) | 사용 기술·버전, MySQL·Elasticsearch·Qdrant·Redis·RabbitMQ의 역할과 점수 정책 |
| [Elasticsearch 한국어 후보 검색](elasticsearch-lexical-search.md) | Nori·BM25·RRF 흐름, 불변 버전·공개 전 준비·복구, 설정·V24 업그레이드·검증·한계 |
| [Redis 적용 범위·검색 결과 복원](redis-search-result-restoration.md) | 적용 위치·호출 흐름·저장 구조, 30분 TTL·계정 소유권, 장애·운영·검증과 미적용 범위 |
| [RabbitMQ 정기 리포트 생성](rabbitmq-daily-report-generation.md) | 용어·호출 흐름·코드 위치, DB Outbox·중복·예산·실행 불명, 설정 조합·증상별 대응·검증과 미적용 범위 |
| [RabbitMQ 리포트 메일 발송](rabbitmq-daily-report-delivery.md) | V27 기존 리포트 행 Outbox·SMTP 전용 소비자·UNKNOWN·큐 off 호환·운영 조회 |
| [RabbitMQ 카카오 연결 해제](rabbitmq-account-oauth-unlink.md) | V28 탈퇴 작업·재가입 차단·중복/UNKNOWN·큐 off·운영자 확인 |
| [RabbitMQ 중복 검토 분석](rabbitmq-combination-review.md) | 202 접수·실행 상태 자동 조회, 실행 행 Outbox·중복/만료/결과 불명·V25·설정·검증 |
| [RabbitMQ 공식 문서 분석·운영 조회](rabbitmq-application-form-discovery.md) | V26 문항 추출 작업·이력 복원, 관리자 큐 현황·장애 대응 |
| [구현 현황](implementation-status.md) | 현재 완료 단계, 검증 범위, 제한 사항과 다음 작업 |
| [코드 검수·최적화 기록](code-audit-20260907.md) | 학습 코드 보존, 미사용 항목 제거, 장애·화면·평가 오류 수정과 전체 검증 결과 |
| [기획 대조 추가 검수](project-review-20260907.md) | 추가 발견 버그의 재현·수정, 이번 실행 검증과 환경 제약 |
| [프런트엔드 전체 감사](frontend-audit-20260908.md) | 계정·파트너 모집·프로필·관리자 화면 합류 뒤의 결함 수정과 미구현 범위(작성 시점 기록) |

## 실행과 API

| 문서 | 확인할 내용 |
|---|---|
| [Compose 실행·검증](../infrastructure/README.md) | 환경변수, 시작·중지·초기화, 실제 API 키 없는 통합 검증 |
| [지원사업 API 계약](support-program-search-contract.md) | 검색·상세·원문 질문·준비 상태의 공개/내부 요청·응답 |
| [계정·인증 계약](account-auth-contract.md) | 로그인·세션(유지·유휴 만료)·로그아웃·권한 단계·개발용 시드 로그인의 요청·응답과 설정 |
| [기업 맞춤 일일 리포트](daily-reports.md) | 기업별 추천·근거 확인, 웹 미리보기, 수신 주소 확인·동의·해지, SMTP 설정과 중복·비용 경계 |
| [요청량·동시 실행 제한](support-program-request-limits.md) | 제한 설정·429/503 계약·운영 한계·4단계 최종 통합 검증 |
| [Frontend 개발](../frontend/README.md) | 화면 구조, 실행, 테스트·lint·build |
| [Core API 개발](../backend/core-api/README.md) | 패키지·DB 규칙, 평가 프로필, JDK 21·MySQL 테스트 |
| [AI Service 개발](../backend/ai-service/README.md) | 실행 설정, 내부 API, 테스트와 패키지 빌드 |

## 평가와 개발 확장

C01 문서의 수동 조건 입력 UI와 개발 전략의 최초 UI 계획은 과거 기록입니다. 현재는 해당 패널을 제거하고
대화의 변경 제안 확인을 유지합니다. [현재 화면 안내](../frontend/README.md#화면과-현재-동작)와
[대화 조건 계약](conversation-condition-update.md)을 함께 참고하세요.

| 문서 | 확인할 내용 |
|---|---|
| [기획 정합성·국내 경쟁 전략·개발 백로그](development-strategy-20260907.md) | 기획서 요구별 현재 차이, 국내 경쟁군 근거, P0/P1 작업·선행 조건·완료 기준·출시 게이트 |
| [신청 문서 작성 도우미 설계](application-preparation-design.md) | skn-89 최초 검수 기준과 skn-96 기업마당 공고 기반 공식 첨부·문항 발견, 작성 보조 계약 |
| [중복 지원·수혜 검토 설계](duplicate-support-review-design.md) | skn-59 입력·실행 API, 공식 첨부 수집·파싱·단일 Agent·원문/결과 보존과 검증·한계 |
| [중복 검토 공식 근거·사례](../evaluation/combination-review/README.md) | 4-1 창업도약패키지 원문·인용·AI 작성 사례·사람 검수표와 무료 무결성 검사 |
| [실데이터 평가 결과·이어받기](../evaluation/support-program-search/runs/support-program-catalog-20260906-v1/README.md) | 고정 스냅샷·판정 원표·3단계 기준선·4단계 전후 비교와 API 없는 재현 |
| [검색 평가 도구](../evaluation/support-program-search/README.md) | 가상 공고 회귀 평가, 실제 후보·최종 추천 캡처와 지표 계산 |
| [Elasticsearch 독립 비교 실험](../evaluation/support-program-search/elasticsearch/README.md) | 고정 스냅샷의 키워드·Standard BM25·Nori BM25 비교와 API 없는 보고서 재검증 |
| [RAG 검수·답변 평가](../evaluation/support-program-evidence/README.md) | 5단계 인용 오류 수정, 가상 근거 평가·공식 HTML 전체 경로 검증, API 없는 기록 재검사 |
| [6단계 다중 제공처 준비](support-program-multi-source-preparation.md) | API 없는 제공처별 준비 상태·검색 범위·복구 실패 격리·K-Startup URL/RAG 화면 준비와 남은 연동 범위 |
| [C01 기업 조건 검색](company-conditions-search.md) | 익명 조건 입력·적용·초기화, POST 검색 반영, 검증 결과와 후속 범위 |
| [원문 우선 자격 판정](source-first-eligibility-review.md) | 태그와 신청 요건 구분, 본문 인용 검증, 확인 필요 공고 분리와 검증 한계 |
| [C02 후속 대화 조건 갱신](conversation-condition-update.md) | 작은 대화 상태·조건 변경 제안·확인 질문·사용자 확인 검색과 검증 범위 |
| [검색 랭킹 시간 초과 수정](support-program-ranking-timeout-fix.md) | 랭킹 전용 시간 예산, 504 구분과 검색 재시도, 장애 관측·검증 기록 |
| [검색 지연 개선과 실제 비교](search-latency-20260908.md) | 정확일치 캐시·동시 요청 재사용, Fast 비교와 미채택 실험, 호출 한도·검증 |
| [지역 충돌 판정·Fast 상시 설정](region-conflict-fast-20260908.md) | 서울·안산 충돌과 실제 이전 예외 구분, 고정 회귀 검사·공개 공고 재검사·배포 기록 |
| [지역 자격 범위·근거 개선](region-eligibility-scope-fix.md) | 상·하위 소재지 구분, 지역을 뒷받침하는 인용 선택, 합성 지역 평가와 실제 검증 |
| [검색문·관련도·대화 초기화 개선](search-relevance-v5-fix.md) | 시스템 검색어 오염 제거, v5 관련도·자격 분리, 새 검색·현재 조건 표시, 검증과 한계 |
| [판정·검토 도구](../evaluation/support-program-search/review/README.md) | AI-only·혼합·사람 검토 모드 선택과 출처 관리 |
| [Agent 모듈 구조](../backend/ai-service/docs/agent-structure.md) | Agent의 책임과 기능 추가 기준 |
| [기능 확장 안내](customization-guide.md) | 새 기능을 추가할 때의 계층·계약·검증 순서 |
| [SampleItem 예제 계약](sample-item-contract.md) | 계층 학습용 예제 API |

## 문서별 관리 범위

- 현재 개발 단계와 다음 과제는 구현 현황에 기록합니다.
- 실험 수치·판정 원표·전후 비교는 해당 평가 실행 폴더에 보존하고 메인 README에는 반복하지 않습니다.
- 설계 패턴은 아키텍처 README, 실제 실행 순서는 호출·데이터 흐름, 실행 명령·환경변수는 해당 서비스 안내에서 관리합니다.
