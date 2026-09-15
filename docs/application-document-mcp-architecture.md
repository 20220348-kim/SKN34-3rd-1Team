# 신청 문서 MCP 구조

## 현재 호출 경로

React의 저장된 답변·expectedRevision → Core `ApplicationDocumentService` → 공식 첨부 재수집/hash 확인 → AI `/internal/v1/application-preparations/document/generate` → 원본 복사본 지도 → OpenAI 구조화 수정 계획 → 형식별 MCP → Core 결과 확인 → 소유권/revision 잠금 재확인 → 파일 저장 → 기존 다운로드 API.

| 형식 | 편집 경로 | 현재 검증/제약 |
|---|---|---|
| HWP | 인증된 Windows 브리지 → stdio 고정 확장 → Topabaem05 COM controller | 번호 있는 누름틀의 읽기·입력·HWP 저장·재열기. 이름 없는 표/병합 셀/체크 컨트롤 주소는 미지원 blocker |
| HWPX | Hangeul-mcp 파일 모드 inspect → preview → apply → verify_targets | 셀/셀 문단/본문, 범위의 문자열 교체. 원본 불변·XML·값 검증. 중첩 표/누름틀/체크 컨트롤은 지원을 추정하지 않음 |
| PDF | pdf-edit-mcp 페이지별 읽기/선택 예시 실제 삭제 → Core PDFBox AcroForm → 재열기·appearance·렌더 실행 | 기존 필드 재사용 또는 평면 문서에 새 필드. flatten하지 않음 |

MCP 서버마다 실제 stdio `initialize`, `tools/list`, `tools/call`을 실행한다. HTTP URL을 stdio 서버에 붙이지 않는다. Windows HTTP 브리지는 내부 고정 작업만 받으며 tools/call 프록시가 아니다. COM은 해당 작업의 새 `DispatchEx` 인스턴스에서 같은 MCP 이벤트 루프 스레드로 실행한다. 질문 대기 동안 프로세스/문서를 유지하지 않는다.

## 지도와 계획

`application-document-mcp-v1`의 지도는 sourceSha256, 형식, engineVersion, mapVersion, 실제 nativeLocator, 본문, 주변 문맥, editable/unsupportedReason을 포함한다. 확인하지 못한 표/페이지 정보는 null이며 구조를 추정하지 않는다. HWPX 엔진의 `tN.rN.cN.pN`/`bN` 주소(표·문단은 1-based, 행·열은 XML의 0-based 주소)를 그대로 사용한다. COM 누름틀의 중복 이름은 `GetFieldList(1,0)`가 반환하는 `{{n}}` 주소를 사용한다.

WritePlan은 sourceSha256/mapVersion/answerRevision/planHash와 허용 연산만 담는다. 모든 쓰기 값은 저장된 fact ID인 valueRef에서 해결하며 모델이 값이나 코드를 생성할 수 없다. expectedText는 빈 문자열까지 서비스에서 정확히 비교한다. Hangeul 엔진 자체는 빈 expected_text를 검사 생략으로 해석하므로 해당 검사를 위임하지 않는다. 같은 fact의 여러 입력란 사용은 허용하지만 겹친 범위, 중복 주소, 부모 셀과 자식 문단 동시 편집은 거절한다. 범위 인덱스는 Python Unicode code point, 0-based/end-exclusive이다.

공식 문항 추출 뒤 사용자에게 질문을 보여주기 전에 `/document/map`으로 sectionKey:fieldKey와 실제 targetId/box를 연결한다. 답변 값은 이 요청에 포함하지 않는다. 지도·bindings·선택 양식 scope는 기존 양식 스냅샷 JSON의 documentMapSnapshot에 함께 저장하며 공개 응답 DTO에는 노출하지 않는다. 생성 계획은 이 bindings/scope를 벗어나지 못하고 원본에서 주소를 재검증한다. 과거 스냅샷은 지도 필드만 JSON_SET으로 복원하고 기존 문항·사용자 답변·이력은 보존한다. 같은 파이프라인의 첫 검증된 지도는 덮어쓰지 않는다. 유료 호출을 하지 않는 기존 기록 재현(recordedPayload) 경로는 기존 계약을 보존하고, 필요하면 실제 생성 시 지도를 복원한다. 위치 연결 실패는 MAPPING_FAILED로 기록하여 사업 정보 부족으로 다시 질문하지 않는다.

예시 삭제는 색상 필터를 사용하지 않는다. 모델이 의미·문맥과 정확한 문자열 구간을 지정하며, 미답변 예시 삭제에는 valueRef가 없다. 항목명과 예시가 섞이면 지정 구간 외 문자열은 보존한다. 단순하고 위치가 모호하지 않은 구간 변경은 원래 run을 유지하는 최소 확장으로 처리한다. 반복 텍스트 때문에 어느 run을 바꾸는지 모호하거나 보존 run을 합쳐야 하는 변경은 거절한다. 본문을 비워 bN 순번이 달라지는 경우에는 원본/결과를 다시 분석하여 유지된 문단 구조 위치에서 값을 확인한다. 독립 한글 렌더링은 별도 검증이 필요하다.

## PDF 좌표·단계

새 입력란의 box는 **회전된 CropBox 화면의 왼쪽 위** 기준 0..1이다. PDFBox는 CropBox 원점과 0/90/180/270도 회전을 반영하여 PDF 포인트로 변환한다. 픽셀을 PDF 포인트로 취급하지 않는다. 예시 삭제는 MCP `pdf_find_text`의 실제 일치 결과를 확인한 뒤 `pdf_replace_single(replacement="", reflow=false)`로 내용 스트림을 수정한다. 흰 사각형은 쓰지 않는다. 같은 문자열이 여러 번 나타나면 잘못된 영역 삭제를 피하기 위해 명시적으로 거절한다. MCP 원시 좌표를 PDFBox 신규 필드 좌표로 재사용하지 않는다.

PDF_PAGE에만 box를 허용하고 PDF_FIELD는 기존 필드명으로 채운다. 하나라도 기존 필드가 있으면 신규 필드를 추가하지 않는다. 빈 입력 영역의 기존 텍스트, 답변 크기, 선택값, readOnly, XFA, 서명을 검사한다. 한국어 폰트는 저장소의 기존 NanumGothic을 사용하며, 임의 축소/문안 절단 없이 overflow를 반환한다. 전체 값과 AcroForm 필드 트리, appearance를 재열어 확인하고 PDFBox 렌더러를 실행한다. 렌더 실행은 사람의 화면 확인과 다르다.

## 격리·중복 실행·저장

- 파일 경로와 실행 명령은 서버 구성에서만 결정한다. 원본은 job별 임시 디렉터리의 고정 파일명으로 복사한다. 크기 32 MiB, ZIP 256 entries/확장 32 MiB, PDF 50페이지, fact 200개 제한을 유지한다.
- 내부 생성 토큰과 Windows 브리지 토큰은 별도 비밀값이다. Windows 인증은 body 수신/작업 생성 전에 검사한다. 브리지는 기본 loopback 단일 worker이며 원격은 TLS 역방향 프록시와 사설망 제한이 필요하다.
- MCP child 환경에 OpenAI/브리지 비밀값을 전달하지 않는다. upstream stderr는 내용 유출 위험 때문에 폐기하며 고정 오류 종류/엔진 이름만 기록한다.
- Core는 Redis의 작성 건별 실행 잠금으로 중복 생성을 막는다. 결과 불명은 잠금을 만료 없이 유지한다. Windows는 프로세스 간/재시작 후에도 남는 executor.lock으로 COM 전체 작업을 직렬화한다. 잠금에는 사용자 내용 없이 jobId·브리지 PID·RUNNING/OUTCOME_UNKNOWN 상태를 기록한다. 같은 실행기의 진행 중 작업은 RUN_CONFLICT로 반환하여 단순 사용 중 상태가 영구 결과 불명 잠금으로 바뀌지 않게 한다. 종료 확인 전 잠금을 자동 삭제하거나 재시도하지 않는다.
- HWPX/PDF 중간 파일은 결과 검증을 통과하기 전 다운로드 저장소에 들어가지 않는다. 실패한 복사본을 이어 쓰지 않는다.
- fingerprint는 원본 hash + 입력 revision + 지도/계획 정책과 선택 도구 commit을 포함한 pipelineVersion으로 계산한다. 실제 지도·planHash·검증 결과는 placements_json의 mcp에 보존한다. V38은 fingerprint 고유키를 추가하며 기존 파일은 이력 다운로드로 유지한다.
- 외부 호출은 DB transaction 밖이다. 최종 Repository.save에서 소유권과 revision을 잠그고 재검사한다.

## kordoc

주 분석에 문맥이 없거나 중복된 비어 있지 않은 항목이 있으면 읽기 보조가 필요하다고 판단한다. 그 외에는 SKIPPED_PRIMARY_SUFFICIENT를 기록한다. 별도 읽기 전용 복사본과 `parse_document`만 허용하며 OCR/수식 OCR 다운로드는 끈다. 주 편집기의 원문과 정확히 일치하는 문자열만 연결하며 kordoc 셀 주소를 편집 주소로 전용하지 않는다. 필요한 보조 호출 실패는 생성 실패이다. OS 수준의 완전한 악성 프로세스 sandbox를 제공하는 것은 아니며 운영 실행 계정 권한도 제한해야 한다.

### 확인된 빈 run 최소 확장

서초구 공식 신청서(원본 SHA-256 `8d253d5c0f5af214caf28d20f108b106d7261c79334b77f167c3886b4b552c91`)의 기업체명 셀은 `<hp:run charPrIDRef="33"/>`로 되어 있어 고정 Hangeul 엔진이 `no_text_nodes`를 반환했다. `hwpx_mcp_extension.py`는 이 엔진의 in-memory 텍스트 치환 primitive에만 빈 run/t 처리를 추가한다. 원본 파일을 미리 고치거나 별도 편집기로 전환하지 않는다. 기존 charPrIDRef와 문단을 유지하며 이미지·컨트롤·중첩 표·기존 문자가 있으면 확장을 거절한다. 다문단 빈 셀은 실제 조회된 자식 문단이 하나일 때 그 주소로 배치 편집하고 엔진의 확장 문단 검증 결과를 확인한다.

### PDF 한글 문자 매핑 보완

정상적인 PDF `/ToUnicode`가 있고 내장 TrueType subset에 선택적인 `cmap` 테이블이 없는 경우, pdf-edit-engine 0.2.0의 추가 문자 복원 함수가 KeyError를 발생시켜 기존 매핑까지 누락했다. `pdf_mcp_extension.py`는 이 선택적 복원 함수의 명시된 계약대로 추가 매핑이 없음을 반환하고 기존 `/ToUnicode`를 유지한다. 임의 문자·폰트 매핑을 만들지 않는다. 일반 텍스트까지 비어 있거나 Core가 읽은 페이지 텍스트에 대응하는 native layout이 없으면 미지원 오류로 중단한다. 여러 PDF 텍스트 연산자에 나뉜 예시는 주 MCP의 `pdf_detect_paragraphs`가 반환한 실제 문단과 원문 구간으로 묶는다. 이 엔진의 글꼴 크기/문단 bbox는 변환 행렬에 따라 시각적 크기와 다를 수 있어 `geometryVerified=false`로 기록하며, 새 입력란 좌표는 렌더 이미지와 PDFBox CropBox/회전 변환으로 검증한다.

### PDF 위치 보정 경고 처리

일부 한글 PDF의 기울어진 text matrix에서는 삭제 후 상대 위치 보정을 건너뛰었다는 경고가 발생한다. 이 경고를 무조건 통과시키지 않는다. 고정 읽기 검증 도구 `govbiz_verify_pdf_deletion`로 원본과 수정본의 모든 텍스트 이외 연산자가 동일하고, 변경된 텍스트가 전부 빈 문자열이며, 해당 BT/ET 텍스트 객체에 남는 문자가 없음을 확인한 경우에만 경고 사유와 검증 결과를 결과 메타데이터에 보존한다. 다른 degradation, 글꼴 대체, glyph 누락, overflow는 계속 실패 처리한다. 독립 렌더링 확인은 별도 검증 수준이다.
