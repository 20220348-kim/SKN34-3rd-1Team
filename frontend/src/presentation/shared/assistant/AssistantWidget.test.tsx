// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../../../App'
import { appContainer } from '../../../app/appContainer'
import { createAppStore } from '../../../app/store'
import { receivedPendingProposal, receivedProposalBox } from '../../../data/fixtures/partnerProposals'
import { supportPrograms } from '../../../data/fixtures/supportPrograms'
import type { Account } from '../../../domain/entities/Account'
import type { SavedSupportProgram } from '../../../domain/entities/SavedSupportProgram'
import { sessionRestored } from '../auth/state/authSlice'
import { findHelpEntry } from '../help/helpContent'
import { assistantHelpTopics } from './assistantConversation'
import { assistantMessages } from './assistantMessages'
import { assistantConversationStorageKey } from './useAssistantViewModel'

vi.mock('../core-api-status/CoreApiConnectionStatus', () => ({
  CoreApiConnectionStatus: () => null,
}))

const memberAccount: Account = { email: 'member@govbiz.local', role: 'USER', tier: 'MEMBER', emailVerified: true, hasPassword: true, company: null }
const companyAccount: Account = {
  email: 'company@govbiz.local', role: 'USER', tier: 'COMPANY', emailVerified: true, hasPassword: true,
  company: { companyName: '넥스트웨이브 주식회사', businessNumber: '2148812034' },
}

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000 + days * 86_400_000).toISOString().slice(0, 10)
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
  vi.stubEnv('VITE_KAKAO_CHANNEL_ID', '_govbizTest')
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('GovBiz 도우미 위젯', () => {
  it('비로그인 검색 화면에서 런처가 뜨고, 열면 인사와 주제 목록을 보여 준 뒤 주제 → 질문 → 도움말 답으로 타고 들어간다', () => {
    renderApp('/', null)

    const launcher = screen.getByRole('button', { name: assistantMessages.openLauncher })
    expect(launcher.getAttribute('aria-expanded')).toBe('false')
    // 채팅 입력창이 있는 화면이라 런처가 위로 올라갑니다.
    expect(launcher.parentElement?.classList.contains('bottom-[92px]')).toBe(true)
    expect(screen.getByText(assistantMessages.launcherLabel)).toBeTruthy()

    fireEvent.click(launcher)
    const panel = screen.getByRole('dialog', { name: assistantMessages.name })
    expect(within(panel).getByText(assistantMessages.greetingIntro)).toBeTruthy()
    expect(within(panel).getByText(assistantMessages.greetingAsk)).toBeTruthy()
    expect(screen.getByRole('button', { name: assistantMessages.closeLauncher }).getAttribute('aria-expanded')).toBe('true')

    // 어느 화면에서 열어도 같은 주제 목록이 먼저 나옵니다.
    const replies = within(panel).getByRole('group', { name: '빠른 답변' })
    expect(within(replies).getAllByRole('button').map((button) => button.textContent)).toEqual([
      ...assistantHelpTopics.map((topic) => topic.label), assistantMessages.quickLoginBenefits, assistantMessages.quickContact,
    ])

    const topic = assistantHelpTopics[0]!
    const first = findHelpEntry(topic.entryIds[0]!)!
    fireEvent.click(within(replies).getByRole('button', { name: topic.label }))
    const log = within(panel).getByRole('log', { name: '대화' })
    expect(within(log).getByText(assistantMessages.topicAsk(topic.label))).toBeTruthy()
    const questions = within(panel).getByRole('group', { name: '빠른 답변' })
    expect(within(questions).getAllByRole('button').map((button) => button.textContent)).toEqual([
      ...topic.entryIds.map((id) => findHelpEntry(id)!.question), assistantMessages.otherQuestion,
    ])

    fireEvent.click(within(questions).getByRole('button', { name: first.question }))
    // 누른 질문이 사용자 말풍선이 되고 답은 도움말 요약으로 시작하며 행동 버튼은 공개 경로를 가리킵니다.
    expect(within(log).getByText(first.question)).toBeTruthy()
    expect(within(log).getByText(first.summary)).toBeTruthy()
    expect(within(log).getByText(assistantMessages.helpSource(first.title))).toBeTruthy()
    expect(within(log).getByRole('link', { name: first.action!.label }).getAttribute('href')).toBe('/')
    expect(within(panel).getByRole('button', { name: assistantMessages.otherQuestion })).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: assistantMessages.name })).toBeNull()
    // 대화는 세션에 남아 다시 열면 그대로입니다.
    expect(window.sessionStorage.getItem(assistantConversationStorageKey)).toContain(first.question)
  })

  it('회원은 관심 공고 마감을 카드로 받고 로그인 화면에서는 도우미가 숨는다', async () => {
    const saved: SavedSupportProgram[] = [
      { savedAt: '2026-09-12T10:00:00', program: { ...supportPrograms[0]!, title: '3일 뒤 마감 공고', applicationEndDate: isoDaysFromNow(3) } },
      { savedAt: '2026-09-11T10:00:00', program: { ...supportPrograms[1]!, title: '30일 뒤 마감 공고', applicationEndDate: isoDaysFromNow(30) } },
      { savedAt: '2026-09-10T10:00:00', program: { ...supportPrograms[0]!, id: 'x-3', title: '마감일 없는 공고', applicationEndDate: null } },
      { savedAt: '2026-09-09T10:00:00', program: { ...supportPrograms[1]!, id: 'x-4', title: '6일 뒤 마감 공고', applicationEndDate: isoDaysFromNow(6) } },
    ]
    const browse = vi.spyOn(appContainer.resolve('browseSavedSupportProgramsUseCase'), 'execute').mockResolvedValue(saved)
    renderApp('/app/partners', memberAccount)

    fireEvent.click(screen.getByRole('button', { name: assistantMessages.openLauncher }))
    const panel = screen.getByRole('dialog', { name: assistantMessages.name })
    const replies = within(panel).getByRole('group', { name: '빠른 답변' })
    expect(within(replies).queryByRole('button', { name: assistantMessages.quickReceivedProposals })).toBeNull()
    fireEvent.click(within(replies).getByRole('button', { name: assistantMessages.quickSavedPrograms }))

    expect(await within(panel).findByText(assistantMessages.savedSummary(4, 2))).toBeTruthy()
    expect(browse).toHaveBeenCalledTimes(1)
    const log = within(panel).getByRole('log', { name: '대화' })
    // 마감 임박순으로 3건만 보이고 D-day 태그가 붙으며, 4건이라 버튼이 전체 보기 문구입니다.
    expect(within(log).getByText('D-3')).toBeTruthy()
    expect(within(log).getByText('D-6')).toBeTruthy()
    expect(within(log).getByText('D-30')).toBeTruthy()
    expect(within(log).queryByText('마감일 없는 공고')).toBeNull()
    expect(within(log).getByRole('link', { name: assistantMessages.savedOpenAll(4) }).getAttribute('href')).toBe('/app/saved-programs')
    expect(within(log).getByText(assistantMessages.savedSource)).toBeTruthy()

    cleanup()
    renderApp('/login', null)
    expect(screen.queryByRole('button', { name: assistantMessages.openLauncher })).toBeNull()
  })

  it('기업 회원은 받은 제안 대기 건수와 가장 빠른 응답 기한을 받고, 자유 질문은 추천 질문으로 돌려보낸다', async () => {
    vi.spyOn(appContainer.resolve('browsePartnerProposalsUseCase'), 'execute').mockResolvedValue(receivedProposalBox)
    renderApp('/app/proposals', companyAccount)

    // 받은 제안함은 제안함 화면과 사이드바 배지가 먼저 읽어 둡니다.
    expect((await screen.findAllByText(receivedPendingProposal.recruitment.title)).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: assistantMessages.openLauncher }))
    const panel = screen.getByRole('dialog', { name: assistantMessages.name })
    fireEvent.click(within(panel).getByRole('button', { name: assistantMessages.quickReceivedProposals }))

    const log = within(panel).getByRole('log', { name: '대화' })
    expect(within(log).getByText(assistantMessages.proposalsSummary(1, '9월 15일'))).toBeTruthy()
    expect(within(log).getByText(assistantMessages.proposalsHandled)).toBeTruthy()
    expect(within(log).getByRole('link', { name: assistantMessages.openProposals }).getAttribute('href')).toBe('/app/proposals')

    const input = within(panel).getByRole('textbox', { name: assistantMessages.placeholder })
    expect((within(panel).getByRole('button', { name: assistantMessages.send }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(input, { target: { value: '이 공고 지원 대상이 누구야?' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(within(log).getByText('이 공고 지원 대상이 누구야?')).toBeTruthy()
    expect(within(log).getByText(assistantMessages.freeTextPreparing)).toBeTruthy()
    expect((input as HTMLTextAreaElement).value).toBe('')

    // 메뉴의 새 대화는 인사로 되돌립니다.
    fireEvent.click(within(panel).getByRole('button', { name: assistantMessages.menu }))
    fireEvent.click(within(panel).getByRole('menuitem', { name: assistantMessages.newConversation }))
    expect(within(log).queryByText(assistantMessages.freeTextPreparing)).toBeNull()
    expect(within(log).getByText(assistantMessages.greetingAsk)).toBeTruthy()
  })

  it('담당자 문의를 고르면 카카오톡 채널 1:1 채팅을 새 탭으로 여는 링크를 주고, 채널 ID가 없으면 문의 항목을 두지 않는다', () => {
    renderApp('/', null)
    fireEvent.click(screen.getByRole('button', { name: assistantMessages.openLauncher }))
    const panel = screen.getByRole('dialog', { name: assistantMessages.name })
    fireEvent.click(within(panel).getByRole('button', { name: assistantMessages.quickContact }))

    const log = within(panel).getByRole('log', { name: '대화' })
    expect(within(log).getByText(assistantMessages.contactIntro)).toBeTruthy()
    const link = within(log).getByRole('link', { name: assistantMessages.contactKakao })
    expect(link.getAttribute('href')).toBe('https://pf.kakao.com/_govbizTest/chat')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    // 바깥 주소는 앱 화면 이동이 아니므로 패널은 열린 채입니다.
    expect(screen.getByRole('dialog', { name: assistantMessages.name })).toBeTruthy()

    cleanup()
    vi.stubEnv('VITE_KAKAO_CHANNEL_ID', 'not-a-channel-id')
    renderApp('/', null)
    fireEvent.click(screen.getByRole('button', { name: assistantMessages.openLauncher }))
    const again = screen.getByRole('dialog', { name: assistantMessages.name })
    expect(within(again).queryByRole('button', { name: assistantMessages.quickContact })).toBeNull()
  })

  it('비로그인이 상태 질문을 고르면 로그인 안내와 복귀 경로가 담긴 링크를 준다', () => {
    renderApp('/partners', null)
    fireEvent.click(screen.getByRole('button', { name: assistantMessages.openLauncher }))
    const panel = screen.getByRole('dialog', { name: assistantMessages.name })
    fireEvent.click(within(panel).getByRole('button', { name: assistantMessages.quickLoginBenefits }))

    const log = within(panel).getByRole('log', { name: '대화' })
    expect(within(log).getByText(assistantMessages.loginBenefits)).toBeTruthy()
    expect(within(log).getByRole('link', { name: assistantMessages.login }).getAttribute('href')).toBe(`/login?next=${encodeURIComponent('/partners')}`)
  })
})

function renderApp(initialEntry: string, account: Account | null) {
  const store = createAppStore()
  store.dispatch(sessionRestored(account))
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
      </MemoryRouter>
    </Provider>,
  )
}
