// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'

import { SavedProgramsPage } from './SavedProgramsPage'
import { createCalendarPreview } from '../viewmodel/savedProgramCalendar'

afterEach(() => { cleanup(); vi.useRealTimers() })

it('관심 공고를 내부 스크롤 없이 달력과 페이지 목록으로 확인한다', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-10T03:00:00Z'))
  render(<SavedProgramsPage initial={{ today: '2026-09-10', programs: createCalendarPreview('2026-09-10') }} />)
  expect(screen.getByRole('table', { name: '2026년 9월 접수 일정' })).toBeTruthy()
  expect(screen.queryByRole('region', { name: '달력 내부 스크롤' })).toBeNull()
  expect(screen.queryByRole('link', { name: /지원사업 찾기/ })).toBeNull()
  expect(screen.queryByRole('button', { name: /공고 찾기/ })).toBeNull()
  expect(screen.queryByRole('button', { name: '오늘' })).toBeNull()
  expect(document.querySelector('time[aria-current="date"]')?.textContent).toBe('10')
  const crowdedDay = within(screen.getByRole('table')).getByRole('list', { name: /2026-09-11 접수 일정/ })
  expect(within(crowdedDay).getAllByTitle(/지원/)[0]?.classList.contains('overflow-hidden')).toBe(true)
  expect(within(crowdedDay).getAllByTitle(/지원/)[0]?.querySelector('[class*="text-ellipsis"]')).toBeTruthy()
  fireEvent.click(within(crowdedDay).getByRole('button', { name: /건 더보기/ }))
  const dialog = screen.getByRole('dialog', { name: /2026-09-11/ })
  expect(within(dialog).getByRole('list', { name: '2026-09-11 전체 접수 일정' }).children).toHaveLength(4)
  fireEvent.click(within(dialog).getByRole('button', { name: '2페이지' }))
  expect(within(dialog).getByRole('button', { name: '2페이지' }).getAttribute('aria-current')).toBe('page')
  expect(within(dialog).getByRole('list', { name: '2026-09-11 전체 접수 일정' }).children).toHaveLength(4)
  fireEvent.click(within(dialog).getByRole('button', { name: '전체 공고 닫기' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(within(crowdedDay).getAllByRole('listitem')).toHaveLength(4)
  expect(within(screen.getByRole('table')).getAllByText('시').length).toBeGreaterThan(0)
  expect(within(screen.getByRole('table')).getAllByText('끝').length).toBeGreaterThan(0)
  expect(within(screen.getByRole('table')).getAllByText('당일').length).toBeGreaterThan(0)
  expect(within(screen.getByRole('table')).queryByRole('link')).toBeNull()
  fireEvent.change(screen.getByRole('combobox', { name: '지원 분야' }), { target: { value: '사업화' } })
  expect(screen.getByText(/표시 공고/).textContent).toContain('4건 / 전체 24건')
  fireEvent.click(screen.getByRole('button', { name: /분야 · 사업화/ }))
  fireEvent.change(screen.getByRole('searchbox', { name: '공고명 또는 기관명' }), { target: { value: '서울경제' } })
  fireEvent.click(screen.getByRole('button', { name: '전체 초기화' }))
  fireEvent.click(screen.getByRole('tab', { name: '목록 보기' }))
  expect(screen.getByRole('tabpanel', { name: '관심 공고 목록' })).toBeTruthy()
  expect(screen.getAllByRole('article')).toHaveLength(8)
  expect(screen.getByRole('navigation', { name: '관심 공고 페이지' })).toBeTruthy()
  const firstPage = screen.getByRole('button', { name: '1페이지' })
  expect(firstPage.classList.contains('text-white')).toBe(true)
  expect(firstPage.classList.contains('text-sample-muted')).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: '2페이지' }))
  expect(screen.getByRole('button', { name: '2페이지' }).getAttribute('aria-current')).toBe('page')
  fireEvent.click(screen.getByRole('tab', { name: '달력 보기' }))
  // 연도 목록은 2000년부터 2030년까지입니다.
  const yearOptions = within(screen.getByRole('combobox', { name: '달력 연도' })).getAllByRole('option').map((option) => option.textContent)
  expect(yearOptions).toHaveLength(31)
  expect(yearOptions[0]).toBe('2000년')
  expect(yearOptions[30]).toBe('2030년')
  expect(screen.queryByRole('button', { name: '다음 연도' })).toBeNull()
  fireEvent.change(screen.getByRole('combobox', { name: '달력 연도' }), { target: { value: '2027' } })
  expect(screen.getByRole('table', { name: '2027년 9월 접수 일정' })).toBeTruthy()
  expect(screen.queryByText('이 달에 표시할 관심 공고가 없습니다.')).toBeNull()
  fireEvent.change(screen.getByRole('combobox', { name: '달력 월' }), { target: { value: '12' } })
  fireEvent.click(screen.getByRole('button', { name: '다음 달' }))
  expect(screen.getByRole('table', { name: '2028년 1월 접수 일정' })).toBeTruthy()
})

it('진행 관리를 열 때 실제 신청 준비 건만 준비 중 단계에 표시한다', async () => {
  const list = vi.fn().mockResolvedValue({
    items: [{
      id: 41,
      inputRevision: 3,
      progressStage: 'PREPARING' as const,
      progressRevision: 1,
      progressStageUpdatedAt: '2026-09-13T09:20:00+09:00',
      sourceCode: 'BIZINFO',
      sourceProgramId: 'PBLN_41',
      serviceField: 'MARKETING' as const,
      programTitle: '해외 진출 역량 강화 지원사업',
      formTitle: '참여기업 신청서',
      updatedAt: '2026-09-13T09:20:00+09:00',
    }],
    nextBeforeId: null,
  })
  const updateProgress = vi.fn().mockResolvedValue({
    progressStage: 'APPLIED',
    progressRevision: 2,
    progressStageUpdatedAt: '2026-09-13T10:00:00+09:00',
    updatedAt: '2026-09-13T10:00:00+09:00',
  })

  render(<MemoryRouter><SavedProgramsPage
    initial={{ today: '2026-09-13', programs: [] }}
    preparationUseCase={{ list, updateProgress }}
  /></MemoryRouter>)

  expect(list).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('tab', { name: '진행 관리' }))
  await waitFor(() => expect(list).toHaveBeenCalledTimes(1))

  const board = screen.getByLabelText('지원사업 파이프라인')
  expect(within(board).getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual([
    '관심', '준비 중', '지원 완료', '서류 심사', '발표 심사', '선정', '탈락',
  ])
  expect(within(board).getAllByRole('article')).toHaveLength(1)
  expect(within(board).getByRole('link', { name: '해외 진출 역량 강화 지원사업' }).getAttribute('href'))
    .toBe('/app/application-preparations/41')
  expect(screen.getByRole('form', { name: '관심 공고 필터' })).toBeTruthy()

  fireEvent.change(screen.getByRole('combobox', { name: '해외 진출 역량 강화 지원사업 단계 변경' }), { target: { value: 'APPLIED' } })
  await waitFor(() => expect(updateProgress).toHaveBeenCalledWith(41, {
    expectedProgressRevision: 1,
    progressStage: 'APPLIED',
  }))
  expect(within(screen.getByRole('region', { name: '지원 완료' })).getByRole('article')).toBeTruthy()
})

it('진행 관리의 관심 단계는 세 건만 보이고 더보기 팝업에서 네 건씩 번호로 이동한다', async () => {
  const programs = createCalendarPreview('2026-09-10').slice(0, 5)
  const list = vi.fn().mockResolvedValue({ items: [], nextBeforeId: null })
  render(<MemoryRouter><SavedProgramsPage
    initial={{ today: '2026-09-10', programs }}
    preparationUseCase={{ list, updateProgress: vi.fn() }}
  /></MemoryRouter>)

  fireEvent.click(screen.getByRole('tab', { name: '진행 관리' }))
  await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
  const interest = screen.getByRole('region', { name: '관심' })
  expect(within(interest).getAllByRole('article')).toHaveLength(3)
  fireEvent.click(within(interest).getByRole('button', { name: '+2건 더보기' }))
  const dialog = screen.getByRole('dialog', { name: /관심 · 5건/ })
  expect(within(dialog).getAllByRole('article')).toHaveLength(4)
  expect(within(dialog).getByRole('button', { name: '1페이지' }).getAttribute('aria-current')).toBe('page')
  fireEvent.click(within(dialog).getByRole('button', { name: '2페이지' }))
  expect(within(dialog).getAllByRole('article')).toHaveLength(1)
})
