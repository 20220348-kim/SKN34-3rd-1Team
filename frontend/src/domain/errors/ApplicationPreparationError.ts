export class ApplicationPreparationError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string) {
    super(messageFor(code, status))
    this.name = 'ApplicationPreparationError'
    this.status = status
    this.code = code
  }
}

function messageFor(code: string, status: number): string {
  if (status === 401) return '로그인이 만료되었습니다. 다시 로그인해 주세요.'
  if (code === 'RUN_OUTCOME_UNKNOWN') return '분석 결과를 확정할 수 없어 자동 재실행을 중단했습니다. 관리자 확인이 필요합니다.'
  if (code === 'QUEUE_EXPIRED') return '분석 대기 시간이 초과되었습니다. 공고를 다시 선택해 새 작업을 요청할 수 있습니다.'
  if (code === 'ACCOUNT_INACTIVE') return '계정 상태가 변경되어 분석을 중단했습니다.'
  if (code === 'DISCOVERY_FAILED') return '공식 문서 분석을 완료하지 못했습니다. 작업 내역을 확인해 주세요.'
  if (code === 'APPLICATION_FORM_QUEUE_UNAVAILABLE') return '공식 문서 분석 큐가 비활성화되어 있습니다. 관리자에게 문의해 주세요.'
  if (code === 'APPLICATION_FORM_JOB_NOT_FOUND') return '본인의 분석 작업을 찾을 수 없습니다.'
  if (code === 'APPLICATION_FORM_JOB_CONFLICT') return '같은 공고의 이전 분석이 진행 중이거나 결과 확인이 필요해 새 분석을 시작할 수 없습니다. 잠시 후에도 계속 표시되면 관리자에게 문의해 주세요.'
  if (code === 'APPLICATION_FORM_JOB_CAPACITY') return '진행 중이거나 확인이 필요한 분석이 3건입니다. 기존 작업을 먼저 확인해 주세요.'
  if (code === 'APPLICATION_PREPARATION_API_UNAVAILABLE') return '현재 연결된 서버가 신청 문서 작성 기능을 지원하지 않습니다. Core·AI Service 이미지를 갱신한 뒤 다시 시도해 주세요.'
  if (code === 'APPLICATION_PREPARATION_NOT_FOUND') return '신청 준비 건을 찾을 수 없습니다.'
  if (code === 'APPLICATION_FORM_NOT_SUPPORTED') return '현재 지원하지 않는 공고·양식·지원 분야입니다.'
  if (code === 'APPLICATION_FORM_NO_FORM') return '현재 지원하지 않는 신청 문서 형식입니다. 공식 공고 원문에서 신청 방법을 확인해 주세요.'
  if (code === 'APPLICATION_FORM_SOURCE_UNSUPPORTED') return '공식 PDF/HWP/HWPX 첨부를 확보하고 읽을 수 있는 공고만 분석할 수 있습니다.'
  if (code === 'APPLICATION_FORM_SOURCE_NOT_FOUND') return '공식 공고나 첨부를 찾지 못했습니다. 공고 ID를 확인해 주세요.'
  if (code === 'APPLICATION_FORM_SOURCE_TOO_LARGE') return '공식 첨부가 자동 분석 가능한 크기나 페이지 수를 초과했습니다.'
  if (code === 'APPLICATION_FORM_SOURCE_INVALID') return '공식 첨부의 형식이나 출처를 안전하게 확인하지 못했습니다.'
  if (code === 'APPLICATION_FORM_SOURCE_UNAVAILABLE') return '공식 공고나 첨부를 지금 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.'
  if (code === 'APPLICATION_FORM_AI_INVALID_RESPONSE') return 'AI가 공식 첨부의 문항 근거를 확인하지 못해 분석을 종료했습니다. 공고를 다시 선택하면 새 분석을 요청할 수 있습니다.'
  if (code === 'APPLICATION_PREPARATION_SECTION_NOT_FOUND') return '현재 지원하지 않는 작성 항목입니다.'
  if (code === 'APPLICATION_PREPARATION_REVISION_CONFLICT') return '다른 변경이 먼저 저장되었습니다. 최신 신청 준비 정보를 다시 불러와 주세요.'
  if (code === 'APPLICATION_PREPARATION_RUN_CONFLICT') return '같은 AI 요청을 다시 사용할 수 없습니다. 답변을 확인한 뒤 다시 시도해 주세요.'
  if (code === 'AI_SERVICE_TIMEOUT') return 'AI 답변 확인 시간이 초과되었습니다. 입력은 저장되지 않았으니 다시 시도해 주세요.'
  if (code === 'AI_SERVICE_UNAVAILABLE' || code === 'AI_SERVICE_INVALID_RESPONSE') return 'AI가 답변을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'
  if (code === 'REQUEST_VALIDATION_FAILED' || status === 400) return '선택한 공식 양식과 지원 분야를 다시 확인해 주세요.'
  if (code === 'INVALID_RESPONSE') return '신청 준비 응답 형식을 확인하지 못했습니다.'
  if (code === 'REQUEST_TIMEOUT') return '신청 준비 요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.'
  if (code === 'REQUEST_FAILED' || status === 0) return 'Core API에 연결하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.'
  return '신청 준비 정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
}
