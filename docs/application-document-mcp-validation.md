# 신청 문서 MCP 검증 기록

검증 결과는 아래 최종 실행 기록에 업데이트한다. 자동 테스트와 MCP 통신 성공을 실제 문서의 위치·레이아웃 품질 완료로 해석하지 않는다.

## 검증 명령

- AI Service: `uv run --locked --extra dev python -m pytest`
- 의존성: `uv lock --check`, `uv pip check --python .venv/Scripts/python.exe`, `uv build`
- Core (JDK 21): `./gradlew clean build --no-daemon` — MySQL 8.4 Testcontainers 포함
- Frontend (Node 24/pnpm 11.22): `pnpm test`, `pnpm lint`, `pnpm build`
- Compose: `docker compose -f infrastructure/compose.yaml config --quiet`, `infrastructure/scripts/verify-compose.sh`
- 최종 변경: `git diff --check`

실제 MCP, OpenAI 호출 없는 스모크(AI Service 디렉터리):

```text
python document-tools/smoke.py --format hwpx --fixture ../core-api/src/test/resources/combinationreview/general.hwpx
python document-tools/smoke.py --format hwpx --fixture <공식 HWPX> --target <사람이 확인한 native target> --output <새 결과 경로>
python document-tools/smoke.py --format pdf --fixture ../core-api/src/test/resources/combinationreview/deeptech.pdf
python document-tools/smoke.py --format hwp --fixture ../core-api/src/test/resources/applicationpreparation/checkbox-form.hwp
```

스모크는 job 복사본만 수정한다. 예시값은 가상기업이며 출력 경로 덮어쓰기를 거절한다. HWPX 텍스트/XML 검사와 한글 렌더링은 별도이다. HWP 파일을 HWPX에서 이름만 바꿔 만들지 않는다.

## 수동 실파일·재편집 절차

1. 각 공식 원본의 hash와 선택 양식 범위를 기록한다. 가상 회사 답변만 사용한다.
2. 사람이 입력할 셀/문단/누름틀/PDF 영역과 지워도 되는 예시 구간을 확인한다. 제목·고지·서명·표·이미지 보존 여부를 비교한다.
3. HWP/HWPX 결과를 실제 한글로 열어 짧은 셀·다문단·병합 셀·체크 항목 및 예시 제거를 확인한다. 미지원 항목은 실패로 남긴다.
4. PDF를 다운로드한 후 Reader/브라우저에서 한국어 값을 변경하고 새 파일로 저장한다. 재열어 변경값과 AcroForm 편집 가능 상태, 글자 잘림·겹침·테두리를 확인한다.
5. 같은 답변 revision 재생성은 같은 fingerprint 결과를 반환하고, 엔진 변경 시 새 결과가 생기며 이전 파일도 소유자에게 다운로드되는지 확인한다.
6. 마지막으로 승인된 API 예산 안에서 OpenAI 질문/계획부터 결과까지 실제 웹 흐름을 확인한다. 현재 구현 작업에 별도 유료 호출 예산은 지정되지 않았으므로 임의 과금 평가를 하지 않는다.

## 알려진 필수 잔여 범위

- HWP 일반 표·병합 셀·체크 컨트롤의 신뢰할 수 있는 COM 위치 조회/편집 확장과 실제 한글 설치 환경 검증.
- HWPX 누름틀/체크 컨트롤 지원, 복잡한 다중 변경·특수 컨트롤, HTML/PNG 및 독립 한글 렌더링 검증. 단순한 하나의 구간 변경은 기존 run 서식을 유지하며, 모호한 반복 텍스트 변경은 거절한다.
- PDF 중복 예시의 위치 지정 삭제 범위 확장 및 실제 사용자 PDF 앱의 한국어 재편집 확인.
- 이 범위가 남아 있으므로 세 형식 전체 요구사항 완료/배포 완료로 보고하지 않는다.

## 최종 실행 기록

2026-09-16 로컬 검증 결과. 실제 커밋·push·PR·배포는 하지 않았다.

| 구분 | 실제 실행 | 결과 |
|---|---|---|
| AI 단위·계약 전체 | Python 3.12.10 / uv 0.12.5, `uv run --locked --extra dev python -m pytest --basetemp=<작업별 임시 경로> -o cache_dir=<작업 캐시>` | **1,229 passed**. 실제 OpenAI 호출 없음 |
| Frontend 전체 | Node 24.18.0 / pnpm 11.22.0, `pnpm test --maxWorkers=2`, `pnpm lint`, `pnpm build` | **96 files / 1,189 tests passed**, lint/build 통과. 500 kB 초과 bundle 경고 있음 |
| Core 최신 컴파일 | JDK 21.0.12.1, `gradlew clean bootJar compileTestKotlin --no-daemon --max-workers=2 -Pkotlin.incremental=false` | production·테스트 clean 컴파일 및 bootJar 통과 |
| Core 변경 관련 단위·HTTP 계약 | `gradlew test --no-daemon --max-workers=2 --tests '*ApplicationDocumentEditorTest' --tests '*ApplicationDocumentMcpClientTest' --tests '*ApplicationFormManifestTest'` | **18 tests passed** (편집 11, HTTP client 2, manifest 5) |
| Core 전체 / 실제 MySQL 8.4 | Windows JDK 21 `gradlew clean build --no-daemon --max-workers=2 -Pkotlin.incremental=false`, 실패 영향 범위 Linux 재검증 | 전체 **1,447개 실행: 최초 1,440 통과 / 7 실패**. 계약 fixture 2건 보완 및 Windows POSIX 권한 미지원 5건을 포함한 4개 클래스 **79개를 Linux에서 재실행하여 모두 통과**, clean 빌드 성공. 아래 재검증 기록 참고 |
| Docker / Compose | 최신 코드로 `infrastructure/scripts/verify-compose.sh`, 실제 Nginx 검증 | **최신 이미지 빌드·Compose 전체 스모크·Nginx 경계 검증 통과**. 외부 API는 로컬 stub 사용. 최신 AI 이미지의 실제 HWPX 편집 및 PDF 읽기 MCP 스모크 통과 |
| 환경·패키지 | `uv lock --check`, `uv pip check`, `uv build` | 실행 시점 통과. 이후 추가 모듈의 최종 패키지 확인은 아래 보완 기록 참고 |
| 브라우저 PDF UI | 연결 브라우저 도구 실행, reset 후 재시도 | `failed to write kernel assets ... os error 3`로 열기 전에 실패. 실제 Reader/브라우저 조작 검증으로 보고하지 않음 |

Windows JDK의 AF_UNIX loopback 오류는 검증 JVM에만 `-Djdk.net.unixdomain.tmpdir=<존재하지 않는 작업별 임시 하위 경로>`를 설정하여 JDK의 TCP 대체 경로로 실행했다. OS 보안 설정은 바꾸지 않았다. Linux/Windows 산출물 혼용을 피하려고 clean 컴파일했다. 테스트 환경의 Spring context cache는 2로 제한하도록 설정했다.

### 실제 HWPX MCP / 원본 신청서

- 원본: [서초구 2026년 융자 신청서 및 사업계획서](https://bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=PBLN_000000000118098)의 공식 첨부.
- 다운로드: `https://www.bizinfo.go.kr/cmm/fms/fileDown.do?atchFileId=FILE_000000000742548&fileSn=1`
- 원본 SHA-256: `8d253d5c0f5af214caf28d20f108b106d7261c79334b77f167c3886b4b552c91`.
- 사람이 주변 `③ 기업체명`을 대조한 native `t1.r2.c2`에 `가상기업`을 넣었다. 해당 원본 셀은 열 4칸·행 2칸 병합 셀이다.
- 실제 SDK initialize → tools/list → inspect → preview/apply → 값 검증 및 XML 검사 통과. production `HwpxDocumentAdapter.apply` 경로를 사용했다.
- 원본 bytes 유지 확인. **한글 프로그램에서의 렌더링 및 전체 신청서 자동 작성 품질은 확인하지 않았다.**

### 실제 PDF MCP → Core PDFBox → 재편집

- 원본: [부산 항공부품산업 기술고도화 지원사업 신청서](https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=PBLN_000000000122391)의 공식 PDF 첨부(11페이지).
- 다운로드: `https://www.bizinfo.go.kr/cmm/fms/fileDown.do?atchFileId=FILE_000000000756959&fileSn=1`
- 원본 SHA-256: `4c90df4a5282dd62ae550bb1676766a550089dce7509192008feee988b24bde3`.
- `PdfSmoke inspect`가 실제 Core PDFBox로 원본을 읽어 source/fact/pageImages 요청을 만들었다.
- 실제 MCP에서 1페이지 업종 칸의 `예시 : (31321)항공기용 엔진 제조업 ` 구간 하나를 삭제했다. 새 버전 검증은 삭제된 native 문자 위치가 선택한 문자열 위치와 일치하고, 남는 텍스트 객체·페이지 좌표·글꼴 및 이미지 스트림 내용이 보존되는지 확인한다.
- 위치 보정 생략 경고는 7개 텍스트 객체 전체 삭제임을 검증한 뒤 사유를 기록했다. 다른 degradation/overflow/glyph 누락은 여전히 실패 처리한다.
- Core PDFBox로 기업명 칸에 AcroForm 텍스트 필드 하나를 추가하여 `가상기업`을 넣었다. 중복 정적 텍스트·flatten은 사용하지 않았다.
- PDFBox에서 `수정한 가상기업`으로 바꿔 저장·재열기 성공. 독립 pypdf에서도 필드 수 1개와 정확한 `/V`를 확인했다.
- 독립 Poppler 렌더 이미지에서 기업명 위치, 예시 제거, 빨간 `표준산업분류표 참고` 문구와 표·제목·제출 조건·서명란 보존을 확인했다. 겹침/잘림은 이 테스트의 입력 영역에서 발견하지 않았다.
- PDFBox 시스템 글꼴 검색 중 format 14 cmap 무시 경고가 있었다. 이 검증은 위 한국어 값에 한정하며 모든 글꼴/문자 조합을 보장하지 않는다.
- **회사의 모든 항목을 AI가 자동 배치한 결과가 아니다.** 사람이 지정한 입력 영역 1개·예시 1개에 대한 실행·보존 스모크다. 나머지 예시/미입력 항목은 이 수동 계획에 포함하지 않았다.

### HWP 및 아직 실행하지 못한 검증

- HWPFrame.HwpObject가 등록되어 있지 않아 Windows COM 실제 MCP/한글 저장·재열기·화면 검증 미실행.
- HWP 일반 표/체크 컨트롤, HWPX 누름틀/체크 컨트롤의 미지원 범위는 남아 있다. 다른 형식으로 내보내 성공 처리하지 않는다.
- 최종 Repository/Mapper JSON 지도 저장과 fingerprint 제약은 **실제 MySQL 8.4 통합 검증 통과**. H2로 대체하지 않았다. 기존 스냅샷의 지도 누락을 재현하여 실제 `JSON_SET` 경로와 기존 문항 보존도 확인했다.
- 실제 OpenAI 질문·지도 선정·작성 계획의 end-to-end 품질 평가는 호출 예산이 지정되지 않아 미실행. mock 계약 테스트를 AI 품질 검증으로 표시하지 않는다.
- 실제 사용자 PDF 앱의 입력 변경 UI는 브라우저 도구 장애로 미검증이며, PDFBox/pypdf 재편집 검사와 구분한다.



### 최종 보완 기록

- Windows 동시 요청 테스트를 추가했다. 실행 중인 동일 브리지의 작업은 RUN_CONFLICT로 구분하고, 프로세스 재시작·실패 뒤 남은 잠금은 OUTCOME_UNKNOWN으로 유지한다. 관련 계약 테스트 32개 통과 후 AI 전체를 다시 실행하여 1,229개 통과했다.
- 최종 사용 중 오류 안내를 포함하여 Frontend 전체 1,189개·lint·build 재검증 통과.
- 해당 Core HTTP client 변경은 관련 2개 테스트를 다시 실행해 통과했다. 앞서 통과한 편집 11개·manifest 5개와 구분한다.
- `uv lock --check`, 설치 의존성 확인 통과. 온라인 `uv build`는 일시적 DNS 오류가 났고, 확보된 캐시를 사용하는 `uv build --offline --quiet`는 통과했다. 생성 wheel에 신규 pipeline·HWPX/PDF 확장·Windows bridge 모듈 포함 확인.
- 고정 kordoc checkout을 package-lock으로 설치·빌드하고 실제 MCP initialize/tools/list/parse_document를 실행했다. 실제 서초구 신청서 읽기 전용 복사본에서 주 편집기와 정확히 일치하는 텍스트 1,577자를 확인했으며 상태는 READ_ONLY_EXACT_TEXT_MATCHED였다.
- 최종 PDF 삭제 검증은 단순히 텍스트 객체가 비었는지만 보지 않고, 원문에서 선택한 native 문자 위치와 실제 삭제된 문자 위치가 정확히 일치하는지도 확인한다. 문서 저장 시 갱신될 수 있는 XMP 메타데이터 및 파일 저장용 object/xref 스트림은 시각 리소스 비교와 구분한다.
- 첫 검증 시 Docker의 default/desktop-linux 두 연결이 시간 초과되어 MySQL/Redis/Compose가 남았다. 이후 재시도 결과는 다음 절과 같다.
- `git diff --check` 통과. 미커밋·미푸시·PR 미생성·미배포 상태이다.

### Docker 복구 후 재검증 (2026-09-16)

- Docker 29.7.2 Linux 엔진 응답을 확인한 뒤 전체 Core clean 빌드를 실행했다. 158개 suite / 1,447개 테스트가 실행됐고 1,440개 통과, 7개 실패, skip 0이었다. 기본 설정에서 제외하는 `live-source` 태그의 실제 제공처 호출은 실행하지 않았다.
- 문서 관련 실패 2건은 새 `/document/configuration`·`/document/map` HTTP fixture 누락과 가짜 PDF 바이트가 원인이었다. 계약 테스트에 인증 헤더·원본 hash·사용자 답변 미포함 검사 및 기존 스냅샷의 지도 복원 검사를 추가하고, PDF fixture를 PDFBox로 생성한 실제 PDF로 바꿨다. 운영 코드는 이 재검증에서 변경하지 않았다.
- 나머지 5건은 기존 일회성 색인 서비스가 사용하는 `posix:permissions` 초기 속성을 Windows 파일시스템이 지원하지 않아 실패했다. 권한 처리를 약화하거나 테스트를 skip하지 않고 Linux/JDK 21에서 확인했다.
- Linux 컨테이너의 별도 `/workspace`에 소스를 복사하고 실제 MySQL 8.4·Redis Testcontainers를 사용했다. 다음 4개 클래스의 **79개 모두 통과**, `clean` 컴파일·테스트·패키징 성공:

  ```text
  ./gradlew clean test \
    --tests '*ApplicationFormDiscoveryContractIntegrationTest' \
    --tests '*ApplicationPreparationApiIntegrationTest' \
    --tests '*SupportProgramRepositoryIntegrationTest' \
    --tests '*SupportProgramCatalogSyncOnceServiceTest' \
    build --no-daemon --max-workers=2 -Pkotlin.incremental=false
  ```

  각각 4 / 16 / 50 / 9개다. 최초 전체 실행과 실패·수정 영향 범위 재실행을 합쳐 확인한 결과이며, Windows 전체 명령이 한 번에 성공했다고 보고하지 않는다.
- `docker compose ... config --quiet` 통과. 사용하지 않던 전용 프로젝트 `govbiz-document-mcp-verify-20260916`에서 최신 이미지와 `verify-compose.sh` 전체 실행 통과. Web → Core → AI 상태 확인, 신청 준비 질문·확정값 저장, 네 제공처 모의 데이터 동기화, MySQL 조회, Elasticsearch·Qdrant·Redis·RabbitMQ·AI 장애 격리와 복구, Core 재시작 및 소유자별 결과 복원을 확인했다. 실제 제공처·OpenAI 품질 검증은 아니다.
- `python infrastructure/scripts/verify-production-proxy.py` 통과. 실제 Nginx와 로컬 모의 Core로 우회 차단, IP 정규화, HTTP 메서드·body 전달, 2 MB 제한, 다중 쿠키·캐시·리다이렉트를 검증했다.
- 최신 AI 이미지에서 `/opt/document-tools/smoke.py` 실행: 공식 서초구 HWPX의 `t1.r2.c2`에 기업명 입력 후 initialize/tools-list/preview/apply/verify 통과, 공식 부산 PDF는 11페이지의 텍스트·배치 읽기 통과. 이 재실행에서 PDF 편집이나 한글 화면 렌더링을 추가로 확인한 것은 아니다.
- 검증용 Compose 컨테이너·볼륨은 완료 후 정리했다. 기존 개발 스택·운영 데이터에는 적용하지 않았으며 유료 API 호출, 커밋, push, PR, 배포는 하지 않았다.
