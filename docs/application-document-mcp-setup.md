# 신청 문서 MCP 설치와 실행

## 고정 버전

`backend/ai-service/document-tools/versions.json`과 형식별 `.lock`에 고정하였다.

| 역할 | 저장소/commit | 배포 버전 |
|---|---|---|
| HWP | [Topabaem05/hwpx-mcp](https://github.com/Topabaem05/hwpx-mcp/tree/5993e014dd5bec68770379f2532ed0c1502a9952) | 4.0.1 |
| HWPX | [pblsketch/Hangeul-mcp](https://github.com/pblsketch/Hangeul-mcp/tree/b6fef153714e0cc9ce566df0da4082fc57c4fda4) | 0.6.0 |
| PDF | [AryanBV/pdf-edit-mcp](https://github.com/AryanBV/pdf-edit-mcp/tree/d4527e62b59433ad02f31a0511db218a2eeec1d3) | 0.2.0 / engine 0.2.0 |
| 읽기 보조 | [chrisryugj/kordoc](https://github.com/chrisryugj/kordoc/tree/f715573df1712d415604ac949603a00e387cd3d7) | 4.14.0 |

AI Service는 MCP SDK 2.1.0을 직접 선언하고, 편집 프로세스는 SDK 1.27.2와 별도 의존성 환경을 사용한다. PDF 엔진이 Python 3.12 이상을 요구하여 AI 컨테이너를 Python 3.12로 맞췄다. 실행 중 latest 설치·자동 업데이트는 없다. Docker는 고정 kordoc commit의 package-lock.json으로 npm ci를 실행한다.

## Linux / Docker

1. 기존 `.env.example`을 참고하여 서비스 설정을 준비한다. DOCUMENT_INTERNAL_TOKEN에 임의 생성한 32자 이상 비밀값을 설정한다. Core와 AI에서 같은 값을 사용한다.
2. HWP를 제공할 경우 DOCUMENT_HWP_BRIDGE_URL과 별도 DOCUMENT_HWP_BRIDGE_TOKEN을 설정한다. 원격 Windows는 사설망의 HTTPS URL을 사용한다. 토큰을 git에 저장하지 않는다.
3. 저장소 루트에서 `docker compose --env-file .env -f infrastructure/compose.yaml build ai-service core-api` 후 기존 서비스 시작 절차를 따른다. 새 V38 migration은 기존 파일을 삭제하지 않으며 Flyway가 적용한다.
4. Docker의 HWPX/PDF/kordoc 실행 경로는 이미지에 포함된다. 외부 MCP 포트를 공개할 필요가 없다.
5. 기존 웹서비스에서 문서를 선택하고 답변을 저장한 뒤 생성·다운로드한다. HWP 환경 미준비는 별도 오류이며 메뉴를 숨기지 않는다.

로컬은 Python 3.12와 uv 0.12.5에서 `uv sync --locked --extra dev` 후 도구별 venv를 만들고 `uv pip sync --python <도구 Python> document-tools/<형식>.lock`을 실행한다. DOCUMENT_HWPX_COMMAND에는 HWPX 환경의 Python, DOCUMENT_HWPX_ARGS에는 ["<AI Service 절대 경로>/app/application_preparation/hwpx_mcp_extension.py"]를 넣는다. DOCUMENT_PDF_COMMAND에는 PDF 환경의 Python, DOCUMENT_PDF_ARGS에는 ["<AI Service 절대 경로>/app/application_preparation/pdf_mcp_extension.py"]를 넣는다. 인수는 JSON 배열이며 사용자 입력을 연결하지 않는다. kordoc은 위 commit을 checkout하여 `npm ci --ignore-scripts && npm run build` 후 node 절대경로와 dist/mcp.js 인수를 설정한다.

## Windows 작업 서버

필수 사용자 조치: 서버용 Windows 계정, 설치·활성화된 정식 한컴 한글과 자동화에 맞는 사용권, TLS/사설망 경로, 토큰 공급. 고객 PC나 Mac 사용자에게 한글/MCP 설치를 요구하지 않는다. 현재 개발 PC에서는 HWPFrame.HwpObject 등록이 발견되지 않았다.

저장소 루트 PowerShell:

```powershell
./infrastructure/document-mcp/install-windows.ps1 -RuntimeRoot C:/GovBiz/document-runtime
# 실행 계정에 비밀 관리 시스템을 통해 DOCUMENT_HWP_BRIDGE_TOKEN을 공급한 뒤:
./infrastructure/document-mcp/status-windows.ps1 -RuntimeRoot C:/GovBiz/document-runtime
./infrastructure/document-mcp/start-windows.ps1 -RuntimeRoot C:/GovBiz/document-runtime
```

브리지는 127.0.0.1:8765, worker 1로 실행한다. Linux에서 로컬 경로를 보내지 않고 bytes/base64 + SHA-256을 전송한다. 브리지 고정 작업이 자신의 폴더에서 파일을 생성하고 MCP로 전달한다. 별도 개인 한글 문서를 열어둔 계정과 운영 실행 계정을 공유하지 않는다. 보안 모듈 등록/모든 팝업 승인/매크로/보호 문서 해제는 코드에서 수행하지 않는다.

## 장애·복구

- MCP_NOT_READY: 실행파일/잠금 의존성/토큰/Windows 한글 등록을 확인한다.
- UNSUPPORTED/MAPPING_FAILED: 이름 없는 HWP 입력란, HWPX 중첩 표/체크 컨트롤, 중복 PDF 예시, 모호한 양식 범위 등 실제 실패 구조를 확인한다. 다른 형식으로 바꾸어 성공 처리하지 않는다.
- OVERFLOW: 사용자가 원래 답변 화면에서 문안을 수정·확인한 후 새 revision으로 생성한다.
- OUTCOME_UNKNOWN: Core Redis `application-document-run:<작성ID>`와 Windows 작업 루트의 executor.lock을 유지한다. 해당 작업의 MCP/COM 프로세스가 종료되었고 중간 결과가 공개되지 않았는지 관리자가 확인한 후에만 정확한 해당 잠금을 제거한다. 자동 일괄 삭제 스크립트는 없다.
- 원본 변경: 공식 첨부 재분석 후 새 작성 선택이 필요하다. 과거 답변/파일 이력을 삭제하지 않는다.

## LICENSE / NOTICE

Hangeul-mcp, pdf-edit-mcp, kordoc은 각 고정 checkout의 LICENSE를 확인한다. kordoc의 NOTICE 및 THIRD_PARTY 고지는 배포 시 함께 유지한다. 확인한 Topabaem05 commit에는 저장소 루트 LICENSE 파일이 없었다. 해당 도구의 배포 권한과 한글 COM/제품 사용권은 별도 확인이 필요하며 MIT라고 가정하지 않는다. PDF 엔진과 모든 전이 의존성은 설치한 패키지의 라이선스 고지를 따른다. 기존 NanumGothic의 저장소 라이선스를 유지한다. 고객 문서·상용 글꼴·보안 DLL·비밀값을 이 변경에 추가하지 않는다.
