import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useStore } from 'react-redux'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'

import { useAppDispatch } from '../../../app/hooks'
import type { RootState } from '../../../app/store'
import { cancelActiveChatRequests, hasActiveChatRequest } from '../../features/chat/state/chatRequestThunks'
import { conversationReset } from '../../features/chat/state/chatSlice'
import { useChatHistory } from '../../features/chat/hooks/useChatHistory'
import { chatActivityMessages } from '../chat-activity/chatActivityMessages'
import { appPaths } from '../routes/appPaths'
import { WorkspaceModal } from '../workspace/WorkspaceModal'
import { workspaceModalStyles } from '../workspace/WorkspaceModal.styles'
import { workspacePageStyles } from '../workspace/WorkspacePage.styles'
import { AppSidebar, SidebarActionIcon } from './AppSidebar'
import { appSidebarStyles } from './AppSidebar.styles'

/** 확인 대화상자를 거쳐야 하는 동작입니다. 새 검색·대화 열기는 진행 중 검색을 끊고, 삭제는 되돌릴 수 없습니다. */
type PendingChatAction = { kind: 'new' } | { kind: 'open'; id: string } | { kind: 'delete'; id: string; title: string }

/** 로그인 화면은 본문을 유지한 채 PC 사이드바를 접거나 모바일 메뉴를 엽니다. */
export function WorkspaceLayout() {
  const [isMobile, setIsMobile] = useState(() => typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 759px)').matches)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  // 확인을 기다리는 새 검색·대화 열기·대화 삭제입니다. 확인 대화상자가 떠 있는 동안만 값이 있습니다.
  const [pendingAction, setPendingAction] = useState<PendingChatAction | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const shouldFocusComposer = useRef(false)
  const dispatch = useAppDispatch()
  const store = useStore<RootState>()
  const navigate = useNavigate()
  const location = useLocation()
  const history = useChatHistory()
  const { cancelOpening } = history

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(max-width: 759px)')
    const update = () => { setIsMobile(media.matches); setIsMenuOpen(false) }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => { setIsMenuOpen(false) }, [location.key])
  // 다른 화면으로 이동한 뒤 늦게 도착한 기록 조회가 채팅으로 다시 끌고 가지 않게 합니다.
  useEffect(() => { cancelOpening() }, [location.key, cancelOpening])

  useEffect(() => {
    if (isMobile && isMenuOpen) dialogRef.current?.showModal()
    else dialogRef.current?.close()
  }, [isMobile, isMenuOpen])

  useEffect(() => {
    if (!shouldFocusComposer.current || isMenuOpen) return
    const input = workspaceRef.current?.querySelector<HTMLTextAreaElement>('textarea[aria-label="지원사업 검색어"]')
    // 라우터가 필터 탭에서 AI 탭으로 전환하고 모달이 닫힌 뒤 포커스를 줍니다.
    if (input && !input.closest('[hidden]')) {
      input.focus()
      shouldFocusComposer.current = false
    }
  }, [location.key, isMenuOpen])

  function closeSidebar() {
    flushSync(() => {
      if (isMobile) setIsMenuOpen(false)
      else setIsCollapsed(true)
    })
    menuButtonRef.current?.focus()
  }

  function openSidebar() {
    flushSync(() => {
      if (isMobile) setIsMenuOpen(true)
      else setIsCollapsed(false)
    })
    if (!isMobile) sidebarRef.current?.querySelector<HTMLButtonElement>('button[aria-label="사이드바 접기"]')?.focus()
  }

  function startNewChat() {
    history.cancelOpening()
    shouldFocusComposer.current = true
    // 요청 ID까지 함께 비워 진행 중인 해석·검색을 취소하고 늦은 응답이 대화를 되살리지 않게 합니다.
    flushSync(() => {
      dispatch(conversationReset())
      setIsMenuOpen(false)
      navigate(appPaths.chat)
    })
  }

  async function openChatHistory(id: string) {
    if (!await history.open(id)) return
    shouldFocusComposer.current = true
    setIsMenuOpen(false)
    navigate(appPaths.chat)
  }

  /** 비밀번호 변경창과 같은 대화상자로 먼저 확인을 받습니다. */
  function askBeforeActing(action: PendingChatAction) {
    // 모바일 메뉴 <dialog>는 최상위 레이어라 확인 대화상자를 가리므로 먼저 닫습니다.
    setIsMenuOpen(false)
    setPendingAction(action)
  }

  /**
   * 새검색은 검색 화면(AI 대화·필터 검색 탭)으로 가는 입구이기도 합니다. 검색이 진행 중이면 화면으로 가는 것까지는
   * 그대로 두고(진행 중인 대화가 보임), 이미 검색 화면에서 다시 누를 때만 새 대화 시작으로 보고 확인을 받습니다.
   */
  function requestNewChat() {
    if (!hasActiveChatRequest(store.getState())) { startNewChat(); return }
    if (location.pathname !== appPaths.chat) {
      history.cancelOpening()
      setIsMenuOpen(false)
      navigate(appPaths.chat)
      return
    }
    askBeforeActing({ kind: 'new' })
  }

  function requestOpenChatHistory(id: string) {
    if (!history.needsCancelToOpen(id)) { void openChatHistory(id); return }
    askBeforeActing({ kind: 'open', id })
  }

  async function deleteChatHistory(id: string) {
    if (!await history.remove(id)) return
    // 삭제된 항목의 버튼은 사라지므로 포커스를 새검색(모바일은 메뉴 버튼)으로 옮깁니다.
    const next = isMobile ? menuButtonRef.current
      : sidebarRef.current?.querySelector<HTMLButtonElement>('button[title="대화와 적용 조건을 초기화합니다"]')
    next?.focus()
  }

  function confirmPendingAction() {
    const action = pendingAction
    setPendingAction(null)
    if (action === null) return
    if (action.kind === 'delete') { void deleteChatHistory(action.id); return }
    dispatch(cancelActiveChatRequests())
    if (action.kind === 'new') startNewChat()
    else void openChatHistory(action.id)
  }

  const sidebar = <AppSidebar onClose={closeSidebar} onNewChat={requestNewChat}
    history={history} onOpenHistory={requestOpenChatHistory}
    onDeleteHistory={(id, title) => askBeforeActing({ kind: 'delete', id, title })}
    closeLabel={isMobile ? '메뉴 닫기' : '사이드바 접기'} onNavigate={() => setIsMenuOpen(false)} />

  return (
    <div className={appSidebarStyles.layout}>
      {isMobile ? <dialog ref={dialogRef} aria-label="작업 메뉴" onClose={() => setIsMenuOpen(false)}
        onClick={(event) => { if (event.target === event.currentTarget) closeSidebar() }}
        className={appSidebarStyles.mobileDialog}>
        {sidebar}
      </dialog> : <div ref={sidebarRef} hidden={isCollapsed}
        className={isCollapsed ? 'hidden' : 'h-full w-[260px] shrink-0'}>
        {sidebar}
      </div>}
      <div className={appSidebarStyles.workspace} ref={workspaceRef}>
        {isMobile || isCollapsed ? <header className={appSidebarStyles.compactHeader} aria-label="작업 메뉴 열기">
          <button ref={menuButtonRef} type="button" className={appSidebarStyles.iconButton}
            aria-label={isMobile ? '메뉴 열기' : '사이드바 펼치기'} title={isMobile ? '메뉴 열기' : '사이드바 펼치기'}
            aria-expanded={isMobile ? isMenuOpen : false} aria-haspopup={isMobile ? 'dialog' : undefined}
            onClick={openSidebar}><SidebarActionIcon name="panel" /></button>
          <Link to={appPaths.chat} className="text-lg font-semibold tracking-tight text-app-ink no-underline">GovBiz</Link>
          <button type="button" className={`${appSidebarStyles.iconButton} ml-auto`} aria-label="지원사업 새검색"
            title="지원사업 새검색" onClick={requestNewChat}><SidebarActionIcon name="newChat" /></button>
        </header> : null}
        <Outlet />
      </div>
      {pendingAction?.kind === 'delete' ? (
        <WorkspaceModal isOpen title="대화를 삭제할까요?" tone="danger" onClose={() => setPendingAction(null)}
          description={`“${pendingAction.title}” 대화의 질문·답변·검색 결과가 삭제되며 복구할 수 없습니다.`}>
          <div className={workspaceModalStyles.actions}>
            <button className={workspaceModalStyles.ghostButton} type="button" onClick={() => setPendingAction(null)}>취소</button>
            <button className={workspacePageStyles.dangerButton} type="button" onClick={confirmPendingAction}>삭제</button>
          </div>
        </WorkspaceModal>
      ) : (
        <WorkspaceModal isOpen={pendingAction !== null} title={chatActivityMessages.openHistoryTitle}
          description={pendingAction?.kind === 'new' ? chatActivityMessages.newChatDescription : chatActivityMessages.openHistoryDescription}
          onClose={() => setPendingAction(null)}>
          <div className={workspaceModalStyles.actions}>
            <button className={workspaceModalStyles.ghostButton} type="button" onClick={() => setPendingAction(null)}>
              {chatActivityMessages.openHistoryCancel}
            </button>
            <button className={workspacePageStyles.primaryButton} type="button" onClick={confirmPendingAction}>
              {chatActivityMessages.openHistoryContinue}
            </button>
          </div>
        </WorkspaceModal>
      )}
    </div>
  )
}
