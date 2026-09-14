import type { ChatActivity, ChatOutcome } from '../../features/chat/state/chatSlice'

/** 검색 화면 밖에서 진행 상태와 결과 도착을 알리는 문구입니다. */
export const chatActivityMessages = {
  panelLabel: '검색 상태',
  panelOpen: '보기',
  panelSearching: '검색 중',
  panelInterpreting: '조건 해석 중',
  headerSearching: '지원사업 검색 진행 중',
  headerInterpreting: '조건 해석 진행 중',
  headerUnseen: '검색 결과 도착',
  open: '대화 보기',
  close: '닫기',
  toastLabel: '검색 알림',
  openHistoryTitle: '검색이 진행 중입니다',
  openHistoryDescription: '다른 대화를 열면 진행 중인 검색이 취소되고 결과를 받지 못합니다. 계속할까요?',
  newChatDescription: '새 검색을 시작하면 진행 중인 검색이 취소되고 결과를 받지 못합니다. 계속할까요?',
  openHistoryContinue: '계속',
  openHistoryCancel: '취소',
} as const

export function chatOutcomeMessage(outcome: ChatOutcome, resultCount: number | null): string {
  switch (outcome) {
    case 'search-succeeded':
      return resultCount === null ? '지원사업 검색이 끝났어요.' : `지원사업 검색이 끝났어요. 결과 ${resultCount}건이에요.`
    case 'search-failed':
      return '지원사업 검색을 마치지 못했어요. 대화에서 다시 시도할 수 있어요.'
    case 'interpretation-ready':
      return '조건 변경안이 준비됐어요. 확인을 눌러야 검색이 시작돼요.'
    case 'interpretation-clarification':
      return '조건을 확인하는 질문이 있어요. 답하면 검색을 이어가요.'
    case 'interpretation-answered':
      return '답변이 도착했어요.'
    case 'interpretation-failed':
      return '조건 해석을 마치지 못했어요. 대화에서 다시 시도할 수 있어요.'
  }
}

/** 사이드바 아래 고정 패널의 한 줄 상태 문구입니다. 토스트 문장보다 짧게, 무슨 일이 끝났는지만 말합니다. */
export function chatActivityPanelLabel(activity: ChatActivity): string {
  if (activity.kind === 'searching') return chatActivityMessages.panelSearching
  if (activity.kind === 'interpreting') return chatActivityMessages.panelInterpreting
  switch (activity.outcome) {
    case 'search-succeeded':
      return activity.resultCount === null ? '검색 완료' : `결과 ${activity.resultCount}건 도착`
    case 'search-failed':
      return '검색 실패'
    case 'interpretation-ready':
      return '조건 변경안 준비됨'
    case 'interpretation-clarification':
      return '확인 질문 도착'
    case 'interpretation-answered':
      return '답변 도착'
    case 'interpretation-failed':
      return '조건 해석 실패'
  }
}

/** 점 표시의 상태입니다. 진행 중이면 깜박이고, 실패는 붉은색, 나머지 도착은 초록 점입니다. */
export function chatActivityTone(activity: ChatActivity): 'pending' | 'done' | 'failed' {
  if (activity.kind !== 'unseen') return 'pending'
  return activity.outcome === 'search-failed' || activity.outcome === 'interpretation-failed' ? 'failed' : 'done'
}

export function chatActivityHeaderLabel(activity: ChatActivity | null): string | null {
  if (activity === null) return null
  if (activity.kind === 'searching') return chatActivityMessages.headerSearching
  if (activity.kind === 'interpreting') return chatActivityMessages.headerInterpreting
  return chatActivityMessages.headerUnseen
}
