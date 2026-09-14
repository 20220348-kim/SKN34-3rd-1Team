/** 사이드바 대화 기록 아래, 계정 줄 위에 고정되는 검색 진행 패널입니다. 스크롤 영역 밖이라 항상 보입니다. */
export const chatActivityPanelStyles = {
  panel: 'mt-2 flex shrink-0 items-center gap-2.5 rounded-xl border border-brand-accent bg-[#f1faf5] px-3 py-2.5',
  body: 'min-w-0 flex-1',
  label: 'm-0 text-xs font-semibold text-brand-primary',
  title: 'm-0 mt-0.5 truncate text-xs text-sample-muted',
  open: 'shrink-0 rounded-full bg-brand-primary px-2.5 py-1 text-xs font-semibold text-white no-underline hover:opacity-90',
  dot: 'size-2.5 shrink-0 rounded-full',
  dotPending: 'bg-brand-primary animate-pulse motion-reduce:animate-none',
  dotDone: 'bg-brand-primary',
  dotFailed: 'bg-red-600',
} as const
