# GovBiz Docker Compose

이 문서는 **개발용 `compose.yaml`** 안내입니다. 별도 `compose.prod.yaml`·Nginx·Vercel을 사용하는
[AWS 운영 배포 준비](../docs/deployment-aws-vercel.md)는 개발 파일과 프로젝트/볼륨을 공유하지 않습니다.
운영 설정은 준비됐지만 실제 AWS/Vercel 자원 배포는 별도입니다.

Docker Compose는 React 개발 서버, Core API, AI Service, 원본 카탈로그용 MySQL과 의미 검색용
Qdrant, Nori·BM25 키워드 검색용 Elasticsearch, 로그인 후 검색 결과 복원용 Redis, 리포트·중복 검토·공식 문서 분석용 RabbitMQ를 함께 실행하는 로컬 개발 구성입니다. 회원 세션은 동작하지만 개발용 시드 로그인이 켜져 있고 쿠키 `Secure`가
꺼져 있으므로 운영 배포·TLS·운영 인증 구성으로 쓰지 않습니다.
전체 기술 선택과 데이터 흐름은 [프로젝트 기술 문서](../docs/technology.md)를 참고하세요.

기업 맞춤 리포트의 SMTP·발신자·정기 발송 설정은 [일일 리포트 안내](../docs/daily-reports.md#발송-환경-설정)를 참고하세요.
Compose는 관련 환경변수를 Core API에 전달하지만, 메일·자동 발송은 기본 비활성화이며 실제 SMTP 전달은 별도 확인해야 합니다.

```text
Browser (127.0.0.1:5173)
  → Vite web container
      → /api proxy
          → core-api:8080
              ├→ mysql:3306 (사용자 검색 카탈로그)
              ├→ elasticsearch:9200 (Nori·BM25 키워드 후보)
              ├→ redis:6379 (로그인 전 검색 결과·조건의 30분 임시 보관)
              ├↔ rabbitmq:5672 (리포트·중복 검토·공식 문서 분석 작업 ID 전달, 소비자는 Core 내부)
              ├→ https://apis.data.go.kr (백그라운드 동기화)
              └→ ai-service:8000
                    ├→ qdrant:6333 (현재 공고의 벡터 색인)
                    └→ https://api.openai.com (텍스트 임베딩·후보 점수화)
```

## 주소 규칙

| 호출 주체 | 사용하는 주소 | 이유 |
|---|---|---|
| 브라우저의 React | `/api/...` | Vite 프록시가 같은 Origin 요청을 Core API로 중계 |
| web 컨테이너 | `http://core-api:8080` | Compose 내부 DNS |
| Core API 컨테이너 | `http://ai-service:8000` | Compose 내부 DNS |
| Core API 컨테이너 | `http://elasticsearch:9200` | 한국어 키워드 색인·검색. 호스트 포트는 공개하지 않음 |
| Core API 컨테이너 | `jdbc:mysql://mysql:3306/govbiz` | 사용자 검색용 지원사업 카탈로그 MySQL |
| Core API 컨테이너 | `redis:6379` | 로그인 후 원본 검색 결과 복원. 호스트 포트는 공개하지 않음 |
| Core API 컨테이너 | `rabbitmq:5672` | 리포트·중복 검토·공식 문서 분석별 큐. AMQP·관리 UI 호스트 포트는 공개하지 않음 |
| Core API 컨테이너 | `https://apis.data.go.kr` | 백그라운드 동기화 전용 실제 기업마당 공고 upstream |
| AI Service 컨테이너 | `https://api.openai.com/v1` | 공고·질의 임베딩 및 후보 점수화 |
| AI Service 컨테이너 | `http://qdrant:6333` | 공고 임베딩 저장·의미 검색 |
| Host 터미널 | `http://127.0.0.1:8080` | Host에 공개된 Core API 포트 |
| Host의 DB 도구 | `127.0.0.1:3306` | loopback으로만 공개한 MySQL 포트 |
| Host 터미널 | `http://127.0.0.1:6333` | loopback으로만 공개한 개발용 Qdrant API |

`core-api`, `ai-service`, `mysql`, `qdrant`, `elasticsearch`, `redis`, `rabbitmq`는 컨테이너 네트워크 안에서만 해석되는 이름입니다. 브라우저
JavaScript가 `http://core-api:8080`을 직접 호출하면 실패합니다.

## 실행

Elasticsearch는 9.5.3 이미지에 같은 버전의 Nori 플러그인을 설치하고 `elasticsearch-data` 볼륨을 사용합니다.
512MiB heap·2GiB 메모리 상한·단일 노드·인증 비활성은 개발용이며 9200을 외부에 공개하지 않습니다.
**기존 환경은 Core의 V24 적용 후 두 색인 복구가 끝나야 자연어 검색이 준비됩니다.** 복구가 꺼져 있으면
자동 완료되지 않습니다. [환경변수·업그레이드·비용 주의사항](../docs/elasticsearch-lexical-search.md)을 먼저 확인하세요.

RabbitMQ는 `4.3.5-management-alpine` 단일 노드와 `rabbitmq-data` 볼륨을 사용합니다. Core는 브로커 기동 확인 후 시작합니다.
Compose는 `DAILY_REPORT_QUEUE_ENABLED=true`이지만 정기 예약·메일은 기존처럼 기본 비활성입니다. 이미 예약된 작업은
큐 스위치만 켜도 실행될 수 있으므로 새 정기 예약과 기존 작업 처리를 구분하세요. 별도 Worker 서버는 추가하지 않았습니다.
`RABBITMQ_USERNAME`/`RABBITMQ_PASSWORD`의 공개 기본값은 개발용이며 운영 secret과 네트워크/TLS 설계를 대체하지 않습니다.
사용자·비밀번호는 새 볼륨 초기화 때 적용됩니다. 기존 볼륨의 비밀번호 변경을 위해 볼륨을 삭제하지 마세요.
[큐·DB Outbox·장애/중복·운영 확인](../docs/rabbitmq-daily-report-generation.md)을 참고하세요.

중복 지원·수혜 검토 큐는 `COMBINATION_REVIEW_QUEUE_ENABLED=true`가 Compose 기본값입니다.
V25 적용 후 신규 분석은 202로 접수하고 Core 내부의 별도 검토 소비자가 처리합니다. 기존 QUEUED 작업도 실행될 수 있습니다.
끄면 새 분석은 503으로 거절하지만 저장된 결과 조회는 유지합니다. [상태·한도·운영·검증](../docs/rabbitmq-combination-review.md)을 참고하세요.

공식 신청 문서 분석도 `APPLICATION_FORM_DISCOVERY_QUEUE_ENABLED=true`로 별도 주 큐·DLQ·소비자 1개를 사용합니다.
Core의 V26과 최신 Frontend를 함께 갱신해야 하며, 큐를 켜면 기존 QUEUED가 실행될 수 있습니다.
리포트 메일 발송도 `DAILY_REPORT_DELIVERY_QUEUE_ENABLED=true`로 별도 큐·소비자를 사용합니다. V27은 기존 리포트에
발송 대기 컬럼을 추가합니다. false이면 기존 스케줄러 직접 SMTP 경로를 유지합니다. 큐와 메일이 켜져 있으면 기존 발송
대기가 정기 예약 스위치와 별개로 실행될 수 있습니다. [발송 큐 설정·전환·검증](../docs/rabbitmq-daily-report-delivery.md)을 참고하세요.
카카오 탈퇴 작업도 V28 DB Outbox와 `ACCOUNT_OAUTH_UNLINK_QUEUE_ENABLED=true`의 별도 큐로 처리합니다.
`ACCOUNT_OAUTH_UNLINK_ENABLED=false`는 작업 실행을 멈추지만 DB 작업·재가입 차단은 유지합니다.
큐 off는 같은 DB 작업의 직접 실행입니다. 어드민 키 누락·UNKNOWN은 운영 확인이 필요합니다.
[전환·재가입 차단·운영자 확인](../docs/rabbitmq-account-oauth-unlink.md)을 참고하세요.
관리자 `GET /api/v1/admin/queues`로 다섯 큐의 DB 상태·대기 메시지·소비자·DLQ를 읽기 전용으로 확인합니다.
[작업 API·운영 지표 의미·복구 주의사항](../docs/rabbitmq-application-form-discovery.md)을 참고하세요.

Redis는 8.2.9로 고정하고 `redis-data` 볼륨에 AOF(`appendfsync everysec`)를 기록합니다. Core 재시작과
Redis 컨테이너 재생성에도 만료 전 결과와 최초 복원 계정이 유지되지만, Redis 비정상 종료 시 최근 약 1초는
유실될 수 있습니다. 30분 TTL은 복원해도 연장하지 않으며 `128mb/noeviction` 한도에서 오래된 유효 결과를
임의 퇴거하지 않고 새 저장을 503으로 거부합니다. 일반 대화 기록·세션은 MySQL에 남습니다.
TTL은 조회 만료이며 AOF·백업에서의 물리적 즉시 삭제가 아닙니다. 디스크 접근 권한과 로그/백업 정리 정책도 관리해야 합니다.
Core의 Lettuce 전용 DNS 캐시는 최대 5초입니다. Redis 컨테이너 교체 시 새 IP로 재연결하며 JVM 전역 DNS는 변경하지 않습니다.
`REDIS_CONNECT_TIMEOUT`/`REDIS_TIMEOUT`은 기본 1초입니다. Redis 장애를 만료(410)로 숨기지 않고
`SUPPORT_PROGRAM_SEARCH_RESULT_STORE_UNAVAILABLE`(503)을 반환합니다. 회원 검색·일반 카탈로그는 Redis에 의존하지 않습니다.
로컬 Redis는 **무인증 개발망 내부 전용**이므로 외부 포트를 추가하지 마세요. 운영에는 별도 네트워크 격리·ACL/TLS·
메모리 및 AOF 모니터링이 필요합니다. Core 직접 실행 시 외부 Redis의 `REDIS_HOST`/`REDIS_PORT`, 필요하면
`REDIS_USERNAME`/`REDIS_PASSWORD`/`REDIS_SSL_ENABLED`를 지정합니다. 로컬 Compose는 이 외부 인증/TLS 설정을 사용하지 않습니다.

Docker Engine과 Compose v2가 필요합니다. 저장소 루트에서 `.env.example`을 `.env`로 복사하고,
공공데이터포털에서 발급한 일반 인증키와 필수 OpenAI 키를 넣습니다.
Encoding 또는 Decoding 키를 사용할 수 있으며 Core API가 호출 전에 정규화합니다. `.env`는 Git에서
제외되며 각 키는 필요한 컨테이너에만 전달됩니다.

```dotenv
DATA_GO_KR_SERVICE_KEY=발급받은_인증키
OPENAI_API_KEY=발급받은_OpenAI_API_키
```

| 환경변수 | 기본값 | 용도 |
|---|---|---|
| `BIZINFO_API_BASE_URL` | `https://apis.data.go.kr` | 백그라운드 동기화가 사용하는 공고 API origin. 로컬 스텁 검증 외에는 변경하지 않음 |
| `BIZINFO_API_CONNECT_TIMEOUT` | `2s` | 동기화 외부 API 연결 제한시간 |
| `BIZINFO_API_READ_TIMEOUT` | `10s` | 동기화 외부 API 응답 제한시간 |
| `BIZINFO_SYNC_ENABLED` | `true` | `false`이면 기업마당 공고 자동 동기화를 실행하지 않음 |
| `BIZINFO_SYNC_INITIAL_DELAY` | `PT0S` | 앱 시작 시 스케줄러의 첫 동기화까지의 ISO-8601 기간. 기본값은 즉시 실행 |
| `BIZINFO_SYNC_FIXED_DELAY` | `PT6H` | 이전 동기화가 끝난 뒤 다음 동기화까지의 ISO-8601 기간 |
| `KSTARTUP_API_KEY` | 빈 값 | K-Startup 활용 승인을 받은 공공데이터포털 서비스키. Core에만 주입 |
| `KSTARTUP_API_BASE_URL` | `https://apis.data.go.kr` | K-Startup 수집 API origin |
| `KSTARTUP_API_CONNECT_TIMEOUT` / `KSTARTUP_API_READ_TIMEOUT` | `2s` / `10s` | 연결 / 응답 제한시간 |
| `KSTARTUP_SYNC_ENABLED` | `false` | 초기 임베딩 비용 확인 뒤 켜는 별도 수집기 |
| `KSTARTUP_SYNC_SCOPE` | `RECENT_YEAR` | API에 1년 전 날짜 조건 전달. `RECENT_THREE_MONTHS`는 3개월 전, `OPEN`은 모집 중 공고만. 실응답에는 장기 공고도 포함될 수 있음 |
| `KSTARTUP_SYNC_INITIAL_DELAY` / `KSTARTUP_SYNC_FIXED_DELAY` | `PT0S` / `PT6H` | 첫 수집 지연 / 완료 후 다음 실행까지 지연 |
| `MSIT_API_KEY` / `CNTRADE_NOTICE_API_KEY` | `DATA_GO_KR_SERVICE_KEY` 재사용 | 각 API 활용 승인이 필요하며 전용 키로 덮어쓸 수 있음 |
| `MSIT_API_BASE_URL` / `CNTRADE_NOTICE_API_BASE_URL` | `https://apis.data.go.kr` | 제공처별 API origin |
| `MSIT_API_CONNECT_TIMEOUT` / `CNTRADE_NOTICE_API_CONNECT_TIMEOUT` | `2s` | 연결 제한시간 |
| `MSIT_API_READ_TIMEOUT` / `CNTRADE_NOTICE_API_READ_TIMEOUT` | `20s` | 응답 제한시간 |
| `MSIT_SYNC_ENABLED` / `CNTRADE_NOTICE_SYNC_ENABLED` | `false` | 최초 임베딩 비용과 실 API 응답 확인 후 각각 활성화 |
| `MSIT_SYNC_INITIAL_DELAY` / `CNTRADE_NOTICE_SYNC_INITIAL_DELAY` | `PT0S` | 첫 수집 지연 |
| `MSIT_SYNC_FIXED_DELAY` / `CNTRADE_NOTICE_SYNC_FIXED_DELAY` | `PT6H` | 해당 수집 완료 후 다음 실행까지 지연 |
| `CORE_API_HOST_PORT` / `WEB_HOST_PORT` | `8080` / `5173` | loopback 공개 포트. 격리 검증에서는 `18080` / `15173` 사용 |
| `CHOKIDAR_INTERVAL` | `1000` | web 컨테이너의 Vite가 바인드 마운트 소스를 폴링하는 간격(ms). Windows/macOS 바인드 마운트는 파일 stat이 느려 간격이 짧으면 web CPU가 40%대로 오르고 `/api` 프록시 응답이 초 단위로 느려진다. `.pnpm-store`·`dist`는 감시에서 제외하며 pnpm 저장소는 `/home/node/.pnpm-store`(볼륨 밖)에 둔다 |
| `ACCOUNT_SESSION_TTL` | `P30D` | "로그인 상태 유지"를 켠 세션의 절대 만료 기간 |
| `ACCOUNT_SESSION_SHORT_TTL` | `PT12H` | "로그인 상태 유지"를 끈 세션의 절대 만료 기간 |
| `ACCOUNT_SESSION_IDLE_TTL` | `P7D` | 마지막 사용 뒤 세션을 끝내는 유휴 기간 |
| `ACCOUNT_JWT_SECRET` | 로컬 개발용 문자열 | 세션 JWT 서명 비밀키(32자 이상). Core API 코드에는 기본값이 없으며 운영 환경에서는 반드시 교체 |
| `ACCOUNT_COOKIE_SECURE` | `false` | 세션 쿠키 `Secure` 속성. Compose는 http라 끄고, HTTPS 운영에서는 `true` |
| `DEMO_SEED_ENABLED` | `true` | 첫 기동 때 `demo-seed` 서비스가 [데모 데이터](#데모-데이터)를 넣을지 여부. 데모 계정이 이미 있으면 건너뛰며 직접 가입한 계정은 건드리지 않음 |
| `DEMO_SEED_FORCE` | `false` | `true`면 데모 계정이 있어도 데모 자료를 지우고 다시 넣음. 보통 `DEMO_SEED_FORCE=true docker compose run --rm demo-seed`로 한 번만 씀 |
| `DEMO_SEED_WAIT_SECONDS` | `600` | 데모 모집글을 붙일 기업마당 공고(접수 마감 3주 이상 남은 것 6건)가 동기화될 때까지 기다리는 최대 시간 |
| `ACCOUNT_DEV_LOGIN_ENABLED` | `true` | Compose 개발 환경에서는 `POST /api/v1/auth/dev-login`으로 관리자(`admin@govbiz.local`) 또는 회원(`member@govbiz.local`) 시드 세션을 바로 발급. 운영에서는 `false` |
| `ACCOUNT_DEV_LOGIN_EMAIL` | `admin@govbiz.local` | 개발용 관리자 시드 계정 이메일 |
| `ACCOUNT_DEV_LOGIN_MEMBER_EMAIL` | `member@govbiz.local` | 개발용 회원 시드 계정 이메일 |
| `ACCOUNT_DEV_LOGIN_PASSWORD` | `govbiz-admin1` | 시드 계정을 만들 때 저장하는 비밀번호. 로그인 폼으로도 쓸 수 있으므로 공유 환경에서는 교체 |
| `ACCOUNT_PASSWORD_RESET_MAIL_ENABLED` | `false` | 비밀번호 재설정 메일 전송. 끄면 개발용 로그인이 켜진 Compose에서는 재설정 링크가 core-api 로그(WARN)에 찍히므로 `docker compose logs core-api`에서 복사해 열면 됨. 회원가입 인증번호 메일도 이 값과 `ACCOUNT_PASSWORD_RESET_FROM`을 그대로 쓰며, 꺼져 있으면 인증번호가 같은 로그에 찍힘 |
| `ACCOUNT_EMAIL_VERIFICATION_CODE_TTL` | `PT10M` | 회원가입 인증번호 유효 시간 |
| `ACCOUNT_PASSWORD_RESET_FROM` | 빈 값 | 재설정 메일 발신 주소. 메일을 켜면 `SMTP_*`와 함께 필수 |
| `ACCOUNT_PASSWORD_RESET_FRONTEND_BASE_URL` | `http://127.0.0.1:5173` | 메일 링크가 여는 프런트 origin |
| `ACCOUNT_OAUTH_CALLBACK_BASE_URL` | `http://127.0.0.1:5173` | 소셜 로그인 콜백 origin. Compose는 브라우저가 5173만 쓰고 Vite가 `/api`를 넘기므로 공급자 콘솔에 `http://127.0.0.1:5173/api/v1/auth/oauth/{kakao\|google}/callback`을 등록 |
| `ACCOUNT_OAUTH_FRONTEND_BASE_URL` | `http://127.0.0.1:5173` | 소셜 로그인 뒤 돌아갈 프런트 origin |
| `ACCOUNT_OAUTH_GOOGLE_CLIENT_ID` / `ACCOUNT_OAUTH_GOOGLE_CLIENT_SECRET` | 빈 값 | Google 로그인 클라이언트. 비어 있으면 Google 버튼을 눌렀을 때 로그인 화면이 미설정 안내를 표시 |
| `ACCOUNT_OAUTH_KAKAO_CLIENT_ID` / `ACCOUNT_OAUTH_KAKAO_CLIENT_SECRET` | 빈 값 | 카카오 REST API 키·Client Secret. 비어 있으면 카카오 버튼을 눌렀을 때 로그인 화면이 미설정 안내를 표시 |
| `ACCOUNT_OAUTH_KAKAO_ADMIN_KEY` | 빈 값 | 탈퇴 때 카카오 연결 끊기용 어드민 키 |
| `KAKAO_CHANNEL_ID` | 빈 값 | 도우미 "담당자에게 문의" 버튼이 여는 카카오톡 채널 공개 ID(`_`로 시작). Web의 `VITE_KAKAO_CHANNEL_ID`로 전달되며 비어 있으면 문의 항목을 보여 주지 않음 |
| `ACCOUNT_OAUTH_CONNECT_TIMEOUT` / `ACCOUNT_OAUTH_READ_TIMEOUT` | `2s` / `10s` | 공급자 호출 제한시간 |
| `BIZNO_API_KEY` | 빈 값 | 기업 등록 시 사업자등록번호를 확인하는 Bizno API 키. 비어 있으면 프로필의 기업 조회·등록이 503 |
| `BIZNO_URL` | `https://bizno.net/api/fapi` | Bizno 조회 endpoint |
| `OPENAI_API_KEY` | 없음(필수) | AI Service만 사용하는 OpenAI 인증키 |
| `OPENAI_MODEL` | `gpt-5.6-luna` | 대화·원문 답변의 모델, 랭킹 전용 모델 미설정 시 상속 |
| `OPENAI_RANKING_MODEL` | 미설정 | 랭킹 전용 모델. `.env.example`은 비용 절감을 위해 `gpt-5.6-luna` 설정 |
| `OPENAI_RANKING_REASONING_EFFORT` | `none` | 랭킹 추론 수준(`none` 또는 `low`). `.env.example`은 `low`; 비용·지연 증가 가능 |
| `ASSISTANT_AI_ENABLED` | `false` | 도우미 자유 질문의 AI 호출 스위치. Web의 `VITE_ASSISTANT_AI_ENABLED`로 전달되며 꺼져 있으면 자유 입력은 주제 알약 안내로만 답해 모델 비용이 없음 |
| `OPENAI_ASSISTANT_MODEL` | `gpt-5-nano` | 도우미 자유 질문 의도 분류 전용 모델. 가장 싼 모델이 기본이며 다른 기능에는 영향 없음 |
| `OPENAI_ASSISTANT_REASONING_EFFORT` | `low` | 도우미 추론 수준(`none`·`minimal`·`low`). nano는 `minimal`에서 분류가 흔들려 `low`가 기본, `none`은 nano가 지원하지 않음 |
| `LLM_MODEL_TIMEOUT_SECONDS` | `25.0` | 조건 해석·원문 근거 답변의 OpenAI 호출 제한시간(초) |
| `LLM_RUN_TIMEOUT_SECONDS` | `30.0` | 조건 해석·원문 근거 답변의 Agent 실행 제한시간(초) |
| `LLM_COMBINATION_REVIEW_MODEL_TIMEOUT_SECONDS` | `60.0` | 중복 지원 검토 전용 OpenAI 호출 제한시간(초) |
| `LLM_COMBINATION_REVIEW_RUN_TIMEOUT_SECONDS` | `70.0` | 중복 지원 검토 전용 Agent 실행 제한시간(초) |
| `LLM_RANKING_MODEL_TIMEOUT_SECONDS` | `45.0` | 후보 점수화 전용 OpenAI 호출 제한시간(초) |
| `LLM_RANKING_RUN_TIMEOUT_SECONDS` | `50.0` | 후보 점수화 전용 Agent 실행 제한시간(초) |
| `AI_SERVICE_READ_TIMEOUT` | `35s` | Core API의 AI Health·조건 해석·원문 근거 답변 읽기 제한시간 |
| `AI_COMBINATION_REVIEW_READ_TIMEOUT` | `75s` | Core API의 중복 지원 검토 전용 읽기 제한시간 |
| `AI_RANKING_READ_TIMEOUT` | `55s` | Core API의 후보 점수화 전용 읽기 제한시간 |
| `SUPPORT_PROGRAM_REQUEST_PER_CLIENT_PER_MINUTE` | `6` | 검색·원문 질문이 공유하는 접속 주소별 최근 60초 허용 요청 수 |
| `SUPPORT_PROGRAM_REQUEST_GLOBAL_PER_MINUTE` | `60` | Core 프로세스 전체의 최근 60초 허용 요청 수 |
| `SUPPORT_PROGRAM_REQUEST_MAX_CONCURRENT` | `4` | 두 API의 최대 동시 처리 수. 초과 시 대기 없이 거절 |
| `AI_SEMANTIC_SEARCH_READ_TIMEOUT` | `30s` | Core API의 색인·의미 검색 요청 제한시간 |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | 공고·질의 임베딩 모델 |
| `OPENAI_EMBEDDING_DIMENSIONS` | `1536` | 임베딩 차원 수. 모델·차원이 바뀌면 별도 컬렉션을 사용 |
| `EMBEDDING_TIMEOUT_SECONDS` | `15` | OpenAI 임베딩 호출 제한시간(초) |
| `QDRANT_TIMEOUT_SECONDS` | `5` | Qdrant 요청 제한시간(초) |
| `QDRANT_HOST_PORT` | `6333` | Host loopback에 연결할 Qdrant 포트 |
| `ELASTICSEARCH_BASE_URL` | Compose에서 `http://elasticsearch:9200` 고정 | Core의 키워드 색인·검색 주소. `.env`로 덮어쓰지 않으며 호스트 실행은 Core README 참고 |
| `ELASTICSEARCH_INDEX_NAME` | `govbiz-support-program-lexical-v2` | v1에서 전환 시 환경변수의 이전 이름도 변경하고 재색인. [업그레이드·롤백](../docs/elasticsearch-lexical-search.md#v1--v2-분석기-업그레이드) |
| `ELASTICSEARCH_API_KEY` | 빈 값 | 인증을 별도로 구성한 ES의 API Key. 개발 Compose는 인증 비활성 |
| `ELASTICSEARCH_CONNECT_TIMEOUT` / `ELASTICSEARCH_READ_TIMEOUT` | `2s` / `10s` | Core의 ES 연결·읽기 제한시간 |
| `SUPPORT_PROGRAM_INDEX_ENABLED` | `true` | MySQL 현재 공고의 Elasticsearch·Qdrant 정기 확인·복구 여부. 공개 전 필수 색인은 중지하지 않음 |
| `SUPPORT_PROGRAM_INDEX_INITIAL_DELAY` | `PT0S` | 앱 시작 시 첫 키워드·벡터 색인 복구까지의 기간 |
| `SUPPORT_PROGRAM_INDEX_FIXED_DELAY` | `PT1M` | 이전 복구 완료 뒤 다음 실행까지의 기간 |
| `APP_CORS_ALLOWED_ORIGIN` | `http://127.0.0.1:5173` | Compose에서 Core API가 허용할 브라우저 origin |
| `MYSQL_DATABASE` | `govbiz` | MySQL 초기 데이터베이스 이름 |
| `MYSQL_USER` | `govbiz` | Core API의 MySQL 사용자 |
| `MYSQL_PASSWORD` | `govbiz-local` | Core API의 MySQL 비밀번호. 공유 환경에서는 secret으로 교체 |
| `MYSQL_ROOT_PASSWORD` | `govbiz-root-local` | MySQL 초기 root 비밀번호. 공유 환경에서는 secret으로 교체 |
| `MYSQL_HOST_PORT` | `3306` | Host loopback에 연결할 MySQL 포트 |

OpenAI는 공고 임베딩과 후보 점수화의 필수 의존성입니다. 키가 없으면 Compose 설정과 AI Service
시작이 실패하고, 실행 중 AI 호출이 실패하면 Core API가 오류 종류에 따라 502·503·504로
전달합니다. 후보 점수화는 모델 `45s` → Agent 실행 `50s` → Core 전용 읽기 `55s` 순서입니다.
조건 해석·원문 근거 답변은 기존 모델 `25s` → Agent 실행 `30s` → Core 읽기 `35s`를 유지합니다.
중복 지원 검토는 긴 공식 원문 분석을 위해 모델 `60s` → Agent 실행 `70s` → Core 전용 읽기 `75s`를 사용합니다.
검색 화면의 요청 제한은 기존 `90s`를 유지합니다. 현재 순서는 ES 키워드 검색 → 의미 검색 → 점수화이며
Core 읽기 제한은 각각 `10s`·`30s`·`55s`입니다. 브라우저 제한은 이 상한의 합보다 짧으므로
모든 단계를 최대 시간까지 기다려 주는 보장은 아닙니다. 요청 제한에 도달하면 취소하고 수동 재시도를 허용합니다.
시간 초과는 성공이나 빈 결과로 바꾸지 않고 명시적인 오류로
반환합니다. 이 값은 대기 상한이지 응답속도 목표가 아니며 자동 재시도는 하지 않습니다.
기존 `.env`나 서버 환경변수에 예전 제한시간을 지정했다면 기본값보다 우선하므로 직접 갱신해야 합니다.
랭킹 시간 예산은 별도 변수로 조정하며 모델 < Agent < Core 읽기 관계를 유지합니다.
전체 대기 정책을 바꿀 때는 ES·의미 검색·점수화와 DB/연결 시간을 함께 계산하고 브라우저 취소 시점도 검증해야 합니다.

공고 색인에도 OpenAI 임베딩 비용이 발생합니다. 신규·변경된 검색용 텍스트만 임베딩하며, 동일 내용은
Qdrant에 저장된 벡터를 재사용합니다. 의미 검색·색인 API의 전체 제한시간은 최대 25초이며 Core의
전용 읽기 제한시간 `30s`보다 짧게 유지합니다. 개발용 Qdrant는 인증 없이 loopback에만 공개됩니다.
외부에 배포할 때는 네트워크 접근 제한과 인증을 별도로 구성해야 합니다.

현재 Compose의 Qdrant 이미지는 `1.17.1`로 고정되어 있습니다. 버전 변경 시에는 데이터가 있는
상태로 중지·재시작한 뒤 검색이 복구되는지도 확인합니다.

Core API는 기본 설정에서 앱 시작 시 초기 지연 `PT0S`로 기업마당 공고 동기화를 실행하고, 동기화 완료 시점부터
6시간 뒤에 다시 실행합니다. 전체 페이지 수집·검증과 새 공고의 Elasticsearch·Qdrant 색인이 모두 성공한 뒤 MySQL
카탈로그를 한 transaction으로 갱신합니다. 외부 호출·색인 실패 시 이전 MySQL 카탈로그를 유지하고,
더 최신 동기화가 시작되었다면 오래된 실행 결과는 공개하지 않습니다. 사용자 검색은 MySQL을 읽고
기업마당 API를 직접 호출하지 않습니다. 로컬에서 자동 동기화를 끄려면 `.env`에 `BIZINFO_SYNC_ENABLED=false`를
설정합니다. 이 경우 기존 카탈로그는 검색할 수 있지만 새 공고는 갱신되지 않습니다.

별도 색인 복구 스케줄러는 MySQL의 현재 공고를 기본 1분 주기로 확인하고 Elasticsearch 누락 버전과
Qdrant 누락 벡터를 순서대로 채웁니다. 두 색인 준비 후 MySQL에 공개하므로, 통상적인 공고 변경 때문에
미완성 색인이 검색에 노출되지는 않습니다. 색인 누락·유실·장애를 정상적인 빈 결과로 처리하지 않습니다.
복구 실패로 일부 제공처만 준비됐다면 그 범위만 검색하며, 기존 공고가 있는데 준비된 제공처가 없으면 자연어 검색은 503입니다.
빈 검색어의 최신 목록·필터 목록·상세 조회는 Elasticsearch·Qdrant·OpenAI 없이 MySQL에서 반환합니다.

현재 작업은 오래된 벡터를 자동 삭제하지 않습니다. 검색할 때 현재 공고 식별자·내용 해시와 일치하는
벡터만 선택하며, 삭제 없는 복구로 겹치는 동기화 실행이 서로의 벡터를 지우는 일을 방지합니다.
오래된 벡터의 안전한 정리는 후속 과제입니다. `SUPPORT_PROGRAM_INDEX_ENABLED=false`는 정기 복구만
중지하며 공개 전 필수 색인이나 자연어 검색의 Elasticsearch·Qdrant 의존성을 없애지 않습니다.
Elasticsearch도 이전 문서 버전을 자동 삭제하지 않습니다. 구버전 저장량·BM25 통계 영향은
[색인 수명주기 한계](../docs/elasticsearch-lexical-search.md#실행-설정과-한계)를 참고하세요.

저장소 루트에서 실행합니다.

```bash
docker compose --env-file .env --file infrastructure/compose.yaml up --build
```

| 주소 | 용도 |
|---|---|
| `http://127.0.0.1:5173` | React Vite 개발 서버 |
| `http://127.0.0.1:5173/api/v1/health` | Vite 프록시를 거친 Core API Health |
| `http://127.0.0.1:5173/api/v1/support-programs/search?query=%EC%88%98%EC%B6%9C&acceptingOnly=true` | Vite 프록시를 거친 실제 공고 검색 |
| `http://127.0.0.1:5173/api/v1/sample-items/prepare` | Vite 프록시를 거친 SampleItem 준비 API (`POST`, JSON 본문 필요) |
| `http://127.0.0.1:5173/api/v1/health/ai-service` | Core API를 거친 AI Service Health |

Compose에서는 Web 컨테이너가 Core API의 /api/v1/health 응답을 확인한 뒤 시작됩니다. 따라서 재시작 직후
Core API가 포트를 열기 전에 Web이 공고 상태를 조회해 연결 거부 오류를 표시하는 기동 순서를 피합니다.

AI Service의 `/internal/v1/support-program-rankings/rank`와 `/internal/v1/support-program-index/*`는
Compose 네트워크 내부에서 Core API만 호출합니다. Host나 브라우저에 AI Service 포트를 공개하지 않습니다.

### 백엔드 변경 반영과 화면·API 버전 불일치

#### 1. 기존 프로젝트·설정·데이터 확인

저장소 루트에서 `docker compose ls`로 기존 프로젝트 이름을 확인하고 DB·볼륨을 백업합니다.
아래 명령은 기본 프로젝트 `govbiz` 기준입니다. 다른 이름이라면 모든 `--project-name`과
갱신 스크립트의 `GOVBIZ_COMPOSE_PROJECT_NAME`을 **같은 기존 이름**으로 지정합니다.
기존 `.env`를 새 예제로 덮어쓰지 말고 필요한 설정만 추가합니다.

특히 `DAILY_REPORT_ENABLED=false`만으로 이미 예약된 리포트의 실행을 막을 수는 없습니다.
`DAILY_REPORT_QUEUE_ENABLED`·SMTP·제공처 수집 설정과 기존 대기 작업을 확인하고, Elasticsearch 도입을
이유로 작업 스위치를 임의로 켜지 않습니다. 큐의 처리 범위는 [RabbitMQ 문서](../docs/rabbitmq-daily-report-generation.md)를 확인하세요.
기존 공고의 색인 복구를 진행하기로 했다면 **Core 재시작 전에** `SUPPORT_PROGRAM_INDEX_ENABLED=true`를
확인합니다. Qdrant 누락 버전의 임베딩 비용이 발생할 수 있으며, 복구를 꺼 두면 V24 적용 후 검색 준비가 자동 회복되지 않습니다.

```bash
docker compose --project-name govbiz --env-file .env --file infrastructure/compose.yaml ps --all
```

#### 2. 누락된 데이터 서비스 준비

Elasticsearch가 없는 기존 환경에서는 Nori 설치 이미지를 먼저 빌드·시작합니다. 이미 실행 중이고
정상이라면 건너뜁니다. 이 명령은 Core·AI를 시작하지 않으며 기존 데이터 컨테이너를 재생성하지 않습니다.

```bash
docker compose --project-name govbiz --env-file .env --file infrastructure/compose.yaml up --detach --wait --build --no-deps --no-recreate elasticsearch
```

Redis·RabbitMQ도 없는 환경이라면 아래 명령을 실행합니다. 둘 중 하나만 없으면 해당 서비스 이름만
지정해도 됩니다. 기존 컨테이너의 설정 변경·이미지 교체는 `--no-recreate`로 수행되지 않으므로,
이미 있는 서비스의 업그레이드와 이 최초 추가 절차를 혼동하지 마세요.

```bash
docker compose --project-name govbiz --env-file .env --file infrastructure/compose.yaml up --detach --wait --no-deps --no-recreate redis rabbitmq
```

이미 중지된 서비스는 위 명령으로 시작될 수 있습니다. 실행 중인 구버전 Core가 큐에 연결하면 기존 작업을
처리할 수 있으므로 1번의 설정·대기 작업 확인을 먼저 마칩니다. MySQL·Qdrant와 기존 named volume은
삭제하지 않습니다. Redis 도입 전 Core 메모리에만 있던 검색 토큰은 이전할 수 없어 새 검색이 필요합니다.

#### 3. Core·AI 재빌드와 Flyway 적용

Web은 소스 디렉터리를 bind mount하여 Vite가 변경을 바로 반영하지만, Core·AI는 이미지 안의 JAR/Python 코드를
실행합니다. 소스 수정이나 `docker compose restart`만으로 백엔드 코드가 갱신되지는 않습니다.
C01처럼 공개 POST 검색과 내부 기업 조건 계약을 함께 변경했다면 **Core와 AI를 함께 재빌드**해야 합니다.
화면의 POST 검색에 `405 Method Not Allowed`가 나오고 `OPTIONS /api/v1/support-programs/search`의 `Allow`에
GET만 있다면 실행 중인 Core가 구버전인지 확인합니다. Core만 갱신하고 AI를 그대로 두는 것도 계약 불일치를 만듭니다.
신청 문서 목록·양식 API가 모두 404라면 Frontend만 최신이고 Core·AI 이미지가 이전 버전인 경우입니다.

기존 개발 스택의 백엔드만 갱신할 때는 저장소 루트에서 다음 스크립트를 실행합니다.

```bash
./infrastructure/scripts/refresh-backend.sh
```

스크립트는 기본 `govbiz` 프로젝트의 Compose 설정과 기존 컨테이너·서비스 구성을 먼저 검사합니다. MySQL·Qdrant·Elasticsearch·Redis·RabbitMQ·Web이
실행 중이면 현재 checkout으로 Core·AI 이미지만 빌드하고, AI 준비 확인 후 두 컨테이너를 순서대로 교체합니다.
마지막으로 Web 프록시 경유 `/api/v1/health`, `/api/v1/health/ai-service`의 200 응답을 확인합니다. `down`,
`--volumes` 또는 데이터 컨테이너 재생성은 실행하지 않으므로 기존 MySQL·Qdrant·Elasticsearch·Redis·RabbitMQ 컨테이너와 named volume은 건드리지 않습니다.
스택이 다른 이름으로 시작됐다면 `docker compose ls`로 이름을 먼저 확인한 뒤
`GOVBIZ_COMPOSE_PROJECT_NAME=확인한이름 ./infrastructure/scripts/refresh-backend.sh`로 명시합니다. 스크립트는 해당 프로젝트가
없거나 예상 서비스 구성이 아니면 빌드·교체 전에 중단합니다. Core 시작 시 기존 설정에 따라 자동 수집·색인이 동작할 수 있고
OpenAI 임베딩 비용이 발생할 수 있습니다.

Core 시작 시 미적용 migration을 순서대로 적용합니다. `V23`은 리포트 작업 테이블을 추가하고,
`V24`는 기존 Qdrant 기준의 `index_ready`를 false로 재설정합니다. V24는 공고·대화 기록을 삭제하지 않습니다.
이후 복구가 완료되기 전까지 자연어 검색이 제한될 수 있습니다.

#### 4. 색인 복구와 검색 준비 확인

1번에서 활성화한 복구는 기본 시작 지연 `PT0S`, 이전 복구 완료 후 간격 `PT1M`으로 실행됩니다.
공개된 수동 복구 HTTP API는 없습니다. 재시작 이후 `.env` 파일만 고쳐서는 실행 중인 Core의 설정이 바뀌지 않습니다.
Elasticsearch 준비는 OpenAI를 호출하지 않지만 Qdrant에 없는 버전이 있으면 임베딩 비용이 발생할 수 있습니다.
비용 확인 전 복구를 꺼 두었다면 V24 적용 후에도 준비 상태가 자동으로 회복되지 않습니다.

기본 Web 포트에서 아래 조회는 상태만 읽으며 새 AI 검색을 실행하지 않습니다. 포트를 바꿨다면 주소도 맞춥니다.

```bash
curl --fail --silent --show-error http://127.0.0.1:5173/api/v1/support-programs/readiness
```

- `sources`에서 사용하려는 제공처의 `indexReady=true`를 확인합니다. 최상위 `indexReady=true`는 **한 제공처 이상** 준비됐다는 뜻입니다.
- `SEARCHABLE_WITH_PARTIAL_SOURCES`는 일부 제공처만 검색 가능, `SEARCHABLE_WITH_SYNC_FAILURE`는 기존 공고는 준비됐지만 최신 동기화는 실패한 상태입니다.
- `UNAVAILABLE`이면 복구 설정·ES/AI 연결·Core 로그를 확인합니다. `/api/v1/health`의 200이나 ES 컨테이너의 healthy만으로 공고 색인 완료를 판단하지 않습니다.
- 검증 없이 SQL로 `index_ready=true`를 강제하거나 볼륨을 삭제하지 않습니다. 실제 자연어 검색 확인은 임베딩·AI 점수화 비용을 확인한 뒤 별도로 수행합니다.

오류 코드·버전 일치·복구 방식은 [Elasticsearch 적용 상세](../docs/elasticsearch-lexical-search.md)를 참고하세요.

### 중지와 데이터 초기화

일반 중지는 named volume의 MySQL·Qdrant 데이터를 유지합니다.

```bash
docker compose --env-file .env --file infrastructure/compose.yaml down --remove-orphans
```

로컬 데이터를 의도적으로 초기화할 때만 다음 명령을 사용합니다. `mysql-data`, `qdrant-data`, `elasticsearch-data`, `redis-data`, `rabbitmq-data`,
`web-node-modules` volume을 삭제하므로 필요한 데이터는 먼저 백업해야 합니다. 삭제한 카탈로그와
색인은 다시 수집·구축해야 하며, 실제 OpenAI를 쓰는 색인 재구축에는 비용이 발생합니다.

```bash
docker compose --env-file .env --file infrastructure/compose.yaml down --volumes --remove-orphans
```


### 데모 데이터

`docker compose up -d`를 하면 `demo-seed` 서비스가 `core-api`가 healthy(Flyway 마이그레이션 완료)된 뒤 실행됩니다.
데모 계정이 없을 때는 [`demo-data.sql`](seed/demo-data.sql)과 [`application-preparations.sql`](seed/application-preparations.sql)을 순서대로 적재합니다.
파트너 제안을 서로 주고받는 시연에 맞춘 구성으로, 계정 6개(개발용 시드 admin·member + 데모 회원 4개),
기업 6개(협업·파트너 설정 6개), 파트너 모집글 5개(회원마다 1개, 모두 모집 중), 제안 4개(데모 회원 4곳이 서로에게 1건씩, 모두 대기), 관심 공고 20개(계정마다 3~4개),
중복 지원 검토 2건(저장된 데모 자동 분석 1건), 신청 준비 2건(확인 입력·작성본 포함), 관리자 조치 기록 2건입니다.
모집글은 접수 마감이 3주 이상 남은 기업마당 공고 5건에 붙이므로 공고 동기화가 끝날 때까지(최대 `DEMO_SEED_WAIT_SECONDS`) 기다렸다가 넣고,
공고가 부족하면 이유를 남기고 실패합니다(`BIZINFO_API_KEY` 확인). `DEMO_SEED_ENABLED=false`면 아무것도 하지 않습니다.

`jihoon.park@demo.govbiz.local` 계정이 이미 있으면 전체 초기화를 건너뛰고 신청도우미 SQL만 실행합니다.
V35의 `demo_seed_key`로 `member@govbiz.local`의 목업 2건을 식별하므로, 같은 공고·분야의 사용자 작업이 있어도 목업은 별도로 추가됩니다.
일반 작업은 키가 NULL이라 개수 제한 없이 별도 행으로 쌓입니다. 재실행 시 기존 목업과 사용자 작성본을 덮어쓰지 않으며,
목업을 삭제했다면 다음 시드 실행 시 다시 추가합니다. 이전 버전의 식별값 없는 행은 사용자 기록과 구분할 수 없어 그대로 보존합니다.
이 SQL을 포함한 코드를 각자 pull하고 로컬 Compose를 실행하면 각자의 DB에 동일한 목업이 들어갑니다.
신청도우미 목업은 member 계정에서 보이며 `DEMO_SEED_ENABLED=false` 또는 독립 production Compose에는 자동 적재하지 않습니다.

이미 실행 중인 환경에서 이번 변경을 적용할 때는 Core API를 재빌드해 V35를 적용한 뒤 시드만 실행합니다. 강제 초기화는 필요 없습니다.

```bash
docker compose --env-file .env -f infrastructure/compose.yaml up -d --build --wait core-api
docker compose --env-file .env -f infrastructure/compose.yaml run --rm demo-seed
```

신청도우미 목업은 `application-preparations.sql` 한 곳에서 관리하며 신규 DB 적재와 기존 DB 보충이 같은 파일을 사용합니다.
검증은 실제 개발 DB 대신 임시 MySQL 8.4 컨테이너에서 실행할 수 있습니다(실행 후 테스트 컨테이너 삭제).

```bash
RUN_SEED_MYSQL_TESTS=1 python3 -m unittest discover -s infrastructure/scripts -p test_application_seed_mysql.py
```

초기 상태로 되돌리거나 마감일을 오늘 기준으로 다시 맞추려면 `DEMO_SEED_FORCE=true docker compose run --rm demo-seed`를 실행합니다.
이때 `@demo.govbiz.local` 계정과 시드 계정의 기업·모집글·제안·관심 공고·중복 검토·신청 준비를 지우고 다시 넣으며,
**그 밖의 계정(직접 가입한 실제 이메일 등)은 읽지도 지우지도 않습니다.** 스택을 띄운 채 호스트에서 직접 넣으려면
`./infrastructure/scripts/seed-demo-data.sh`를 씁니다(이 스크립트는 건너뛰기 없이 항상 다시 넣습니다).

| 계정 | 비밀번호 | 용도 |
|---|---|---|
| `member@govbiz.local` | `govbiz-admin1`(개발용 로그인도 가능) | 넥스트웨이브. 모집글 R1(공고 1), 관심 공고 1·2·3·4, 중복 검토 2건, 신청 준비 2건 |
| `admin@govbiz.local` | `govbiz-admin1` | 거북섬테크. 관리자 계정 관리 화면(요약·목록·조치 기록), 모집글 없음, 관심 공고 1·2·5 |
| `jihoon.park@demo.govbiz.local` | `govbiz-demo1` | 데이터브릿지. 모집글 R2(공고 2), 보낸 제안 R4·받은 제안 1건(한빛정밀), 관심 공고 2·1·3 |
| `hana.choi@demo.govbiz.local` | `govbiz-demo1` | 한빛정밀. 모집글 R3(공고 3), 보낸 제안 R2·받은 제안 1건(오션로지스), 관심 공고 3·1·5 |
| `dohyun.jung@demo.govbiz.local` | `govbiz-demo1` | 마루헬스케어. 모집글 R4(공고 4), 보낸 제안 R5·받은 제안 1건(데이터브릿지), 관심 공고 4·2·5·1 |
| `yuna.kang@demo.govbiz.local` | `govbiz-demo1` | 오션로지스. 모집글 R5(공고 5), 보낸 제안 R3·받은 제안 1건(마루헬스케어), 관심 공고 5·3·4 |

데모 회원 4곳의 제안은 모두 대기 상태입니다. `member`·`admin`은 제안을 보내지도 받지도 않은 상태라 시연에서 직접 주고받고, 모집글 주인 계정에서 수락·거절합니다.

기업명·사업자등록번호·이메일은 모두 가상입니다. 로컬 데이터를 초기화(`down --volumes`)하면 다음 기동 때 다시 들어갑니다.

## 통합 smoke

Docker Engine·Compose v2·Bash·curl이 필요합니다. 다음 스크립트는 별도 Compose 프로젝트
`govbiz-verify`를 사용해 이미지를 빌드하고 다음을 확인합니다. 첫 실행의 이미지·의존 패키지
다운로드에는 네트워크가 필요합니다.

Windows에서는 WSL 등 Bash 환경에서 실행합니다. 루트 `.gitattributes`가 shell script를 LF로
유지하여 `core.autocrlf=true` 체크아웃에서도 Bash의 CRLF 구문 오류를 방지합니다.

```bash
./infrastructure/scripts/verify-compose.sh
```

검증 스크립트는 `verification` profile의 `bizinfo-stub`·`kstartup-stub`·`public-notices-stub`·`openai-stub`을 사용합니다. MySQL·Elasticsearch·Qdrant·Redis·RabbitMQ는
실제 서버이고, 외부 공고·임베딩·점수화 응답만 고정된 가상 자료입니다. 기업마당 공고 27개와 K-Startup 공고 2개를
수집하고, MSIT 11개(10+1 페이지)와 CNTRADE_NOTICE 2개(1+1 페이지)도 검증합니다.
네 출처의 관련 공고가 함께 검색되는지, K-Startup 전용 3개 필터가 저장된 분류를 사용하는지,
두 새 출처의 접수 기간 미확인이 OPEN으로 오인되지 않는지 확인합니다. CN fixture는 공식 명세 기반이며
실 API 성공을 뜻하지 않습니다. 이는 서비스 연결과 후보 누락 수정의 검증이지,
실제 OpenAI 모델의 검색 품질 측정이 아닙니다.

스텁 주소와 더미 인증키를 강제하므로 개인 키를 외부로 전송하거나 실제 OpenAI 비용을 발생시키지 않습니다.
네 제공처 스텁은 디코딩된 키도 확인합니다. 제공처 동기화와 색인은 `PT2S` 주기로 실행합니다.
장애·복구 확인을 위해 같은 API를 반복 호출하므로 스크립트는 요청량을 주소별·전체 각각 1,000건,
동시 처리 4건으로 설정합니다. 이는 서비스 연결 검증이며 기본 6건·60건의 한도 도달이나 적정 처리량을
검증하는 부하 테스트는 아닙니다. 낮은 한도·혼잡·오류 화면은 Core·Frontend 회귀 테스트에서 검증합니다.
설정 범위와 프록시/NAT 공유 등 운영 제약은 [요청 제한 안내](../docs/support-program-request-limits.md)를 참고하세요.
검증용 MySQL·Qdrant는 기본 Host 포트 `13306`·`16333`을 사용하며 각각
`VERIFY_COMPOSE_MYSQL_HOST_PORT`·`VERIFY_COMPOSE_QDRANT_HOST_PORT`로 변경할 수 있습니다.

1. Vite Web 응답이 200인지 확인합니다.
2. Vite 프록시를 거친 Core API Health가 200인지 확인합니다.
3. 개발 로그인 뒤 신청 문서 양식·빈 목록을 Web 프록시로 조회하고, 조회만으로 준비 건이 생기지 않았음을 확인한 뒤
   준비 건 생성 → AI 고정 스텁의 사실 제안 → 사용자 확인 스냅샷 저장 → 상세 재조회까지 검증합니다.
4. 동기화된 공고 행이 MySQL에 존재하는지 확인한 뒤 로컬 스텁을 중지하고, 빈 검색어 GET이
   Web → Core API → MySQL 카탈로그를 거쳐 이를 반환하는지 확인합니다. 이 검색 요청은 로컬 스텁을
   직접 호출하지 않으며, 더미 OpenAI 키도 외부로 보내지 않습니다.
5. 자연어 검색이 MySQL 대상 조회 → Elasticsearch 키워드 검색 → AI Service/Qdrant 의미 검색 → RRF 결합 → 스텁 점수화를 거쳐 오래된 관련 공고를 반환하는지 확인합니다.
6. Qdrant를 중지하고 정기 복구가 `UNAVAILABLE/indexReady=false`를 기록한 뒤에도 자연어 검색은 503,
   빈 검색어 목록은 기존 공개 공고를 포함한 200인지 확인합니다. 이후 재시작 뒤 검색 복구를 확인합니다.
7. SampleItem 준비 POST가 200과 `READY_FOR_PROCESSING`을 반환하는지 확인합니다.
8. Core API를 통한 AI Service Health가 200인지 확인합니다.
9. AI Service를 중지했을 때 Core Health는 200, AI Health와 자연어 검색은 503(연결 불가) 또는 504(시간 초과)인지 확인합니다.
10. AI Service 재시작 후 Core API 재시작 없이 Health와 자연어 검색이 복구되는지 확인합니다.
11. 익명 검색 토큰을 로그인 후 복원하고 Core 재시작 뒤에도 동일 결과·소유권이 유지되는지 확인합니다.
    Redis 중지 중에는 복원/익명 결과 저장이 503이고 MySQL 카탈로그는 200인지 확인하며,
    같은 AOF 볼륨으로 Redis를 재생성한 뒤 기존 결과가 그대로 복원되는지도 확인합니다.
    카카오 연결 해제를 포함한 다섯 RabbitMQ 기능의 quorum 주 큐/DLQ와 각 소비자 1개 연결도 확인합니다. 검증용 브로커 중단 중 카탈로그가 200을 유지하고,
    같은 브로커 볼륨으로 재생성 후 Core 재시작 없이 소비자가 재연결되는지 확인합니다.
    정기 생성·SMTP는 강제로 끄고 카카오·Google 자격증명도 비웁니다. 실제 작업·중복·재발행은 별도의 MySQL·RabbitMQ Testcontainers 테스트에서 검증합니다.
12. Elasticsearch를 중지하면 자연어 검색이 503이고 MySQL 목록은 유지되는지 확인합니다. 정기 복구의
    `indexReady=false` 기록과 같은 ES 볼륨으로 컨테이너를 재생성한 후 검색 준비·검색 결과 복구도 확인합니다.

전체 추천·제공처 포함 여부는 테스트 회원 세션으로 확인합니다. 비회원의 공개 2건 제한과 Redis 토큰 발급·복원은
별도의 익명 요청으로 확인하므로, 숨겨진 공고가 비회원 응답에 나타나야 통과하는 검증을 하지 않습니다.

Web/Core는 검증 전용 `15173`/`18080` 포트를 사용해 기존 개발 서비스를 중지하지 않고 실행할 수 있습니다.
`VERIFY_COMPOSE_WEB_HOST_PORT`/`VERIFY_COMPOSE_CORE_API_HOST_PORT`로 바꿀 수 있으며 CORS·요청 Origin도 같은 Web 주소를 사용합니다.
스크립트는 종료 시 검증용 컨테이너와 volume을 삭제합니다. 조사 목적으로 유지하려면
`VERIFY_COMPOSE_KEEP_RUNNING=true`로 실행합니다. `VERIFY_COMPOSE_PROJECT_NAME`을 변경할 경우 기존
개발·운영 프로젝트 이름을 사용하지 마세요. 실행 전 해당 이름의 컨테이너·네트워크·volume이 하나라도
존재하면 정리 작업 없이 중단합니다. 설정 검증이나 Docker 자원 확인에 실패해도 기존 자원을 정리하지
않으며, 새 검증 스택의 시작을 시도한 뒤부터만 자동 정리를 적용합니다. 같은 프로젝트 이름으로 검증을
동시에 실행하지 마세요. `KEEP_RUNNING`으로 남긴 스택이 있다면 새 이름을 지정하거나 해당 검증 자원을
직접 확인한 후 정리해야 합니다.

안전장치 회귀 테스트는 실제 Docker를 호출하지 않고 실행할 수 있습니다.

```bash
python3 -B -m unittest discover -s infrastructure/scripts -p 'test_*.py'
```
