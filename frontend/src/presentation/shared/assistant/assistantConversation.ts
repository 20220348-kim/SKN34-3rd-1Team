import type { PartnerProposal } from '../../../domain/entities/PartnerProposal'
import type { SavedSupportProgram } from '../../../domain/entities/SavedSupportProgram'
import { loginPathFor, signupPathFor } from '../auth/returnPath'
import { findHelpEntry, helpActionHref } from '../help/helpContent'
import type { HelpEntry } from '../help/helpTypes'
import { appPaths, isAppPath, publicPaths } from '../routes/appPaths'
import type { AssistantCardTagTone } from './Assistant.styles'
import { assistantMessages } from './assistantMessages'

/** 봇 말풍선 아래 알약 버튼 하나입니다. 누르면 [label]이 사용자 말풍선이 되고 [kind]에 따라 답을 만듭니다. */
export type AssistantQuickReply = {
  id: string
  label: string
  kind: 'topic' | 'help' | 'saved-programs' | 'received-proposals' | 'login-benefits' | 'contact' | 'other'
  /** `help`일 때 도움말 항목 id입니다. */
  helpId?: string
  /** `topic`일 때 주제 id입니다. */
  topicId?: string
}

/** 도움말 항목을 묶는 주제입니다. 어느 화면에서 열어도 같은 주제 목록이 먼저 나오고, 주제 → 질문 → 답 순서로 타고 들어갑니다. */
export type AssistantHelpTopic = { id: string; label: string; entryIds: readonly string[] }

export const assistantHelpTopics: readonly AssistantHelpTopic[] = [
  { id: 'search', label: '지원사업 검색', entryIds: ['search-confirm-card', 'search-score-meaning', 'eligibility-unknown', 'status-unknown-source', 'evidence-insufficient', 'search-slow-or-failed'] },
  { id: 'review', label: '중복 검토·신청 문서', entryIds: ['review-save-vs-run', 'review-input-revision'] },
  { id: 'partner', label: '파트너·기업 등록', entryIds: ['partner-write-requires-company'] },
  { id: 'general', label: '기타 안내', entryIds: ['feature-status-preparing'] },
]

export function findAssistantHelpTopic(id: string): AssistantHelpTopic | undefined {
  return assistantHelpTopics.find((topic) => topic.id === id)
}

export type AssistantCardRow = {
  tag: { label: string; tone: AssistantCardTagTone } | null
  title: string
  detail: string | null
}

/** [external]이면 새 탭에서 바깥 주소를 엽니다. 그 밖에는 앱 안 화면 이동입니다. */
export type AssistantCardButton = { label: string; to: string; external?: boolean }

/** 목록·버튼이 있는 답변입니다. 버튼은 화면 이동만 합니다. */
export type AssistantCard = {
  rows: AssistantCardRow[]
  buttons: AssistantCardButton[]
}

export type AssistantMessage =
  | { id: string; role: 'user'; text: string }
  | {
      id: string
      role: 'assistant'
      paragraphs: string[]
      card: AssistantCard | null
      /** "내 관심 공고함 기준"처럼 답의 근거를 시각 옆에 작게 적습니다. */
      source: string | null
      tone: 'normal' | 'warn'
      /** 이 답변 뒤에 붙일 빠른 답변입니다. 비어 있으면 화면 추천으로 돌아갑니다. */
      followUps: AssistantQuickReply[]
    }

export type AssistantSession = {
  isAuthenticated: boolean
  hasCompany: boolean
  /** 담당자 문의가 여는 카카오톡 채널 1:1 채팅 주소입니다. null이면 문의 항목을 두지 않습니다. */
  contactUrl: string | null
}

const DAY_MS = 86_400_000
const SOON_DAYS = 7

let sequence = 0
function nextId(prefix: string): string {
  sequence += 1
  return `${prefix}-${Date.now().toString(36)}-${sequence}`
}

export function userMessage(text: string): AssistantMessage {
  return { id: nextId('u'), role: 'user', text }
}

function botMessage(
  paragraphs: string[],
  options: Partial<Omit<Extract<AssistantMessage, { role: 'assistant' }>, 'id' | 'role' | 'paragraphs'>> = {},
): AssistantMessage {
  return {
    id: nextId('a'),
    role: 'assistant',
    paragraphs,
    card: options.card ?? null,
    source: options.source ?? null,
    tone: options.tone ?? 'normal',
    followUps: options.followUps ?? [],
  }
}

/** 처음 열 때의 인사 두 마디입니다. */
export function greetingMessages(): AssistantMessage[] {
  return [
    botMessage([assistantMessages.greetingIntro, assistantMessages.greetingScope]),
    botMessage([assistantMessages.greetingAsk]),
  ]
}

function helpQuickReply(entry: HelpEntry): AssistantQuickReply {
  return { id: `help:${entry.id}`, label: entry.question, kind: 'help', helpId: entry.id }
}

export const contactQuickReply: AssistantQuickReply = { id: 'contact', label: assistantMessages.quickContact, kind: 'contact' }

/**
 * 처음 열었을 때와 "다른 주제"를 눌렀을 때의 빠른 답변입니다. 화면과 무관하게 도움말 주제 전부와 회원의 상태 질문을 둡니다.
 * 비로그인이면 상태 질문 대신 로그인 안내 하나를 둡니다. 카카오톡 채널이 설정돼 있으면 담당자 문의를 마지막에 둡니다.
 */
export function quickRepliesFor(session: AssistantSession): AssistantQuickReply[] {
  const topics = assistantHelpTopics.map<AssistantQuickReply>((topic) => ({ id: `topic:${topic.id}`, label: topic.label, kind: 'topic', topicId: topic.id }))
  const status: AssistantQuickReply[] = session.isAuthenticated
    ? [
        { id: 'status:saved-programs', label: assistantMessages.quickSavedPrograms, kind: 'saved-programs' },
        ...(session.hasCompany ? [{ id: 'status:received-proposals', label: assistantMessages.quickReceivedProposals, kind: 'received-proposals' as const }] : []),
      ]
    : [{ id: 'status:login-benefits', label: assistantMessages.quickLoginBenefits, kind: 'login-benefits' }]
  const contact = session.contactUrl === null ? [] : [contactQuickReply]
  return [...topics, ...status, ...contact]
}

export const otherQuestionReply: AssistantQuickReply = { id: 'other', label: assistantMessages.otherQuestion, kind: 'other' }

/** 주제를 고르면 그 주제의 질문들을 알약으로 보여 줍니다. 답은 짧게 한 줄입니다. */
export function topicAnswer(topic: AssistantHelpTopic): AssistantMessage {
  const questions = topic.entryIds
    .map((id) => findHelpEntry(id))
    .filter((entry): entry is HelpEntry => entry !== undefined)
    .map(helpQuickReply)
  return botMessage([assistantMessages.topicAsk(topic.label)], { followUps: [...questions, otherQuestionReply] })
}

/** 도움말 항목으로 답합니다. 결론 → 본문 첫 문단 → 지금 안 되는 것 → 행동 버튼. 준비 중·예시 항목은 그 사실을 함께 말합니다. */
export function helpAnswer(entry: HelpEntry, pathname: string): AssistantMessage {
  const inApp = isAppPath(pathname)
  const paragraphs = [entry.summary, ...entry.body.slice(0, 1)]
  if (entry.limitation !== null) paragraphs.push(entry.limitation)
  if (entry.status === 'planned') paragraphs.push(assistantMessages.helpPlanned)
  if (entry.status === 'demo') paragraphs.push(assistantMessages.helpDemo)
  const buttons: AssistantCardButton[] = entry.action === null
    ? []
    : [{ label: entry.action.label, to: helpActionHref(entry.action.to, inApp) }]
  const followUps = entry.related
    .map((id) => findHelpEntry(id))
    .filter((related): related is HelpEntry => related !== undefined)
    .slice(0, 2)
    .map(helpQuickReply)
  return botMessage(paragraphs, {
    card: buttons.length > 0 ? { rows: [], buttons } : null,
    source: assistantMessages.helpSource(entry.title),
    followUps: [...followUps, otherQuestionReply],
  })
}

/** 담당자 문의는 카카오톡 채널 1:1 채팅을 새 탭으로 엽니다. 대화는 이 도우미 밖에서 이어집니다. */
export function contactAnswer(contactUrl: string | null): AssistantMessage {
  return botMessage([assistantMessages.contactIntro], {
    card: contactUrl === null ? null : { rows: [], buttons: [{ label: assistantMessages.contactKakao, to: contactUrl, external: true }] },
    followUps: [otherQuestionReply],
  })
}

/** 자유 질문은 C1에서 받지 않고 추천 질문으로 돌려보냅니다. */
export function freeTextFallback(): AssistantMessage {
  return botMessage([assistantMessages.freeTextPreparing])
}

/** 비로그인이 상태 질문을 눌렀을 때입니다. 로그인 뒤 같은 화면으로 돌아옵니다. */
export function loginPromptAnswer(returnTo: string): AssistantMessage {
  return botMessage([assistantMessages.loginPrompt], {
    card: { rows: [], buttons: [{ label: assistantMessages.login, to: loginPathFor(returnTo) }, { label: assistantMessages.signup, to: signupPathFor(returnTo) }] },
  })
}

export function loginBenefitsAnswer(returnTo: string): AssistantMessage {
  return botMessage([assistantMessages.loginBenefits], {
    card: { rows: [], buttons: [{ label: assistantMessages.login, to: loginPathFor(returnTo) }, { label: assistantMessages.signup, to: signupPathFor(returnTo) }] },
    followUps: [otherQuestionReply],
  })
}

/** 서울 기준 오늘 0시입니다. */
function startOfSeoulDay(now: Date): number {
  const seoul = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return Date.UTC(seoul.getUTCFullYear(), seoul.getUTCMonth(), seoul.getUTCDate()) - 9 * 60 * 60 * 1000
}

/** YYYY-MM-DD까지 남은 날수입니다. 지난 날짜는 음수입니다. */
export function daysUntil(date: string, now: Date): number {
  return Math.round((Date.parse(`${date}T00:00:00+09:00`) - startOfSeoulDay(now)) / DAY_MS)
}

function deadlineTag(applicationEndDate: string | null, now: Date): AssistantCardRow['tag'] {
  if (applicationEndDate === null) return { label: '미정', tone: 'muted' }
  const remaining = daysUntil(applicationEndDate, now)
  if (Number.isNaN(remaining)) return { label: '미정', tone: 'muted' }
  if (remaining < 0) return { label: '마감', tone: 'muted' }
  if (remaining === 0) return { label: 'D-day', tone: 'hot' }
  return { label: `D-${remaining}`, tone: remaining <= 3 ? 'hot' : remaining <= SOON_DAYS ? 'soon' : 'ok' }
}

function monthDay(date: string): string {
  const [, month = '', day = ''] = date.split('-')
  return `${Number.parseInt(month, 10)}월 ${Number.parseInt(day, 10)}일`
}

/** 관심 공고를 마감 임박순으로 정리해 카드로 답합니다. 목록은 3개까지, 나머지는 버튼 문구로 셉니다. */
export function savedProgramsAnswer(saved: SavedSupportProgram[], now: Date): AssistantMessage {
  if (saved.length === 0) {
    return botMessage([assistantMessages.savedNone], {
      card: { rows: [], buttons: [{ label: assistantMessages.openSearch, to: appPaths.chat }] },
      source: assistantMessages.savedSource,
      followUps: [otherQuestionReply],
    })
  }
  const upcoming = saved
    .filter((item) => item.program.applicationEndDate === null || daysUntil(item.program.applicationEndDate, now) >= 0)
    .sort((a, b) => {
      const left = a.program.applicationEndDate
      const right = b.program.applicationEndDate
      if (left === right) return 0
      if (left === null) return 1
      if (right === null) return -1
      return left < right ? -1 : 1
    })
  const soon = upcoming.filter((item) => item.program.applicationEndDate !== null && daysUntil(item.program.applicationEndDate, now) <= SOON_DAYS).length
  const rows: AssistantCardRow[] = upcoming.slice(0, 3).map((item) => ({
    tag: deadlineTag(item.program.applicationEndDate, now),
    title: item.program.title,
    detail: item.program.applicationEndDate === null
      ? `${item.program.organization} · ${assistantMessages.savedDeadlineUnknown}`
      : `${item.program.organization} · ${monthDay(item.program.applicationEndDate)} 마감`,
  }))
  const buttons: AssistantCardButton[] = [{
    label: saved.length > 3 ? assistantMessages.savedOpenAll(saved.length) : assistantMessages.savedOpen,
    to: appPaths.savedPrograms,
  }]
  return botMessage([assistantMessages.savedSummary(saved.length, soon)], {
    card: { rows, buttons },
    source: assistantMessages.savedSource,
    followUps: [otherQuestionReply],
  })
}

/** 받은 제안함 상태로 답합니다. 수락·거절은 제안함 화면에서 하므로 여기서는 화면만 엽니다. */
export function receivedProposalsAnswer(
  view: { phase: 'loading' | 'ready' | 'failed'; proposals: PartnerProposal[]; pendingCount: number },
  session: AssistantSession,
): AssistantMessage {
  if (!session.hasCompany) {
    return botMessage([assistantMessages.proposalsNeedCompany], {
      card: { rows: [], buttons: [{ label: assistantMessages.openProfile, to: appPaths.profile }] },
      followUps: [otherQuestionReply],
    })
  }
  if (view.phase === 'loading') return botMessage([assistantMessages.proposalsLoading], { followUps: [otherQuestionReply] })
  if (view.phase === 'failed') {
    return botMessage([assistantMessages.proposalsFailed], {
      card: { rows: [], buttons: [{ label: assistantMessages.openProposals, to: appPaths.proposals }] },
      tone: 'warn',
      followUps: [otherQuestionReply],
    })
  }
  if (view.pendingCount === 0) {
    return botMessage([assistantMessages.proposalsNone], {
      card: { rows: [], buttons: [{ label: assistantMessages.openProposals, to: appPaths.proposals }] },
      source: assistantMessages.proposalsSource,
      followUps: [otherQuestionReply],
    })
  }
  const earliest = view.proposals
    .filter((proposal) => proposal.status === 'PENDING')
    .map((proposal) => proposal.expiresAt.slice(0, 10))
    .sort()[0] ?? null
  return botMessage([assistantMessages.proposalsSummary(view.pendingCount, earliest === null ? null : monthDay(earliest)), assistantMessages.proposalsHandled], {
    card: { rows: [], buttons: [{ label: assistantMessages.openProposals, to: appPaths.proposals }] },
    source: assistantMessages.proposalsSource,
    followUps: [otherQuestionReply],
  })
}

/** 로그인·회원가입처럼 도우미를 두지 않는 화면입니다. */
export function isAssistantHiddenOn(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || publicPaths.landing
  return [publicPaths.login, publicPaths.signup, publicPaths.oauthComplete, publicPaths.reportEmail, '/forgot-password', '/reset-password'].includes(path)
    || path.startsWith('/examples/')
}

/** 채팅 입력창이 아래에 있는 화면에서는 런처를 위로 올립니다. */
export function isComposerScreen(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || publicPaths.landing
  return path === publicPaths.landing || path === appPaths.chat
}
