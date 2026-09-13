/** Core가 AI Service 분류를 검증해 돌려준 도우미 의도입니다. 화면은 이 값으로 말풍선 모양을 정합니다. */
export type AssistantIntent = 'PRODUCT_HELP' | 'ACCOUNT_STATE' | 'SEARCH' | 'PROGRAM_QUESTION' | 'OUT_OF_SCOPE' | 'UNCLEAR'

export type AssistantAccountTopic = 'SAVED_PROGRAMS' | 'RECEIVED_PROPOSALS' | 'COMPANY_PROFILE'

/** 답 뒤에 붙는 이동 버튼 하나입니다. `to`는 Core가 허용한 `/app` 아래 경로입니다. */
export type AssistantNavigation = {
  label: string
  to: string
}

/** 도우미 자유 질문 한 건의 답입니다. 의도에 따라 채워지는 필드가 다르고, `UNCLEAR`만 `answer`가 없습니다. */
export type AssistantAnswer = {
  intent: AssistantIntent
  answer: string | null
  /** 근거가 된 도움말 항목 id입니다. 요청에 실어 보낸 항목만 옵니다. */
  citations: string[]
  clarificationQuestion: string | null
  searchQuery: string | null
  accountTopic: AssistantAccountTopic | null
  navigation: AssistantNavigation | null
}
