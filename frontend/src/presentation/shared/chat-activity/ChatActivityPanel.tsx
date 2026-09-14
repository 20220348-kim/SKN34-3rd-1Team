import { Link } from 'react-router'

import { useAppSelector } from '../../../app/hooks'
import { selectChatActivity, selectChatConversationTitle } from '../../features/chat/state/chatSlice'
import { appPaths } from '../routes/appPaths'
import { ChatActivityDot } from './ChatActivityDot'
import { chatActivityMessages, chatActivityPanelLabel } from './chatActivityMessages'
import { chatActivityPanelStyles as styles } from './ChatActivityPanel.styles'

/**
 * 사이드바 아래에 고정되어 진행 중인 검색·해석과 아직 보지 않은 결과를 알리는 패널입니다.
 * 어느 대화인지 제목을 함께 보여 주고, "보기"로 그 대화(현재 대화)를 엽니다. 결과를 보면 사라집니다.
 */
export function ChatActivityPanel() {
  const activity = useAppSelector(selectChatActivity)
  const title = useAppSelector(selectChatConversationTitle)
  if (activity === null) return null

  return (
    <section className={styles.panel} role="status" aria-live="polite" aria-label={chatActivityMessages.panelLabel}>
      <ChatActivityDot activity={activity} />
      <div className={styles.body}>
        <p className={styles.label}>{chatActivityPanelLabel(activity)}</p>
        {title ? <p className={styles.title} title={title}>{title}</p> : null}
      </div>
      <Link className={styles.open} to={appPaths.chat}>{chatActivityMessages.panelOpen}</Link>
    </section>
  )
}
