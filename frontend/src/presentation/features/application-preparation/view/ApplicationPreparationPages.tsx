import { useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAppSelector } from '../../../../app/hooks'
import {
  applicationServiceFieldLabels,
  type ApplicationForm,
  type ApplicationFormSection,
} from '../../../../domain/entities/ApplicationPreparation'
import { catalogSourceLabels } from '../../../../domain/entities/SupportProgramCatalog'
import { ApplicationPreparationError } from '../../../../domain/errors/ApplicationPreparationError'
import { selectCurrentAccount } from '../../../shared/auth/state/authSlice'
import { appPaths } from '../../../shared/routes/appPaths'
import { WorkspacePageHeader } from '../../../shared/workspace/WorkspacePageHeader'
import { workspacePageStyles } from '../../../shared/workspace/WorkspacePage.styles'
import { SavedSupportProgramPickerDialog } from '../../../shared/support-program/SavedSupportProgramPickerDialog'
import { useApplicationPreparationEditorViewModel } from '../viewmodel/useApplicationPreparationEditorViewModel'
import { useApplicationPreparationListViewModel } from '../viewmodel/useApplicationPreparationListViewModel'
import { applicationPreparationStyles as s } from './ApplicationPreparation.styles'


const listTitle = '신청 문서 작성 도우미'
const sectionStatus = {
  NOT_STARTED: { label: '작성 전', className: s.notStarted },
  IN_PROGRESS: { label: '입력 중', className: s.inProgress },
  INPUT_CONFIRMED: { label: '사실 확인됨', className: s.confirmed },
} as const
const programStatusLabels = {
  OPEN: '접수 중',
  UPCOMING: '접수 예정',
  CLOSED: '접수 종료',
  UNKNOWN: '접수 상태 미확인',
} as const
const supportedDocumentSources = ['BIZINFO', 'KSTARTUP', 'MSIT', 'CNTRADE_NOTICE']
const directInputLabels: Record<string, string> = {
  BIZINFO: '기업마당 공식 공고 URL 또는 공고 ID',
  KSTARTUP: 'K-Startup 공식 공고 ID',
  MSIT: '과학기술정보통신부 공식 공고 ID',
  CNTRADE_NOTICE: '충남 온라인수출지원시스템 공식 공고 ID',
}

function readableTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function ErrorNotice({ message, retryLabel, onRetry, officialSource }: {
  message: string
  retryLabel?: string
  onRetry?: () => void
  officialSource?: { title: string; url: string }
}) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => { ref.current?.focus() }, [message])
  return <div className={s.warning} ref={ref} role="alert" tabIndex={-1}>
    <p>{message}</p>
    {(onRetry || officialSource) && <div className="mt-3 flex flex-wrap gap-3">
      {onRetry && <button className={s.button} type="button" onClick={onRetry}>{retryLabel ?? '다시 시도'}</button>}
      {officialSource && <a className={s.officialLink} href={officialSource.url} target="_blank" rel="noreferrer">
        공고 원문 열기<span className="sr-only">: {officialSource.title} (새 창)</span>
      </a>}
    </div>}
  </div>
}

function OfficialFormSummary({ form }: { form: ApplicationForm }) {
  return <section className={s.card} aria-labelledby="official-form-summary-title">
    <h2 className={s.cardTitle} id="official-form-summary-title">공고 및 공식 양식</h2>
    <dl className={s.details}>
      <div><dt>공고명</dt><dd>{form.programTitle}</dd></div>
      <div><dt>양식명</dt><dd>{form.formTitle}</dd></div>
      <div><dt>공식 첨부</dt><dd>{form.attachmentFileName}</dd></div>
      <div><dt>파일 SHA-256</dt><dd className="break-all font-mono text-xs">{form.attachmentSha256}</dd></div>
    </dl>
    <p className={s.muted}>{form.verificationStatus === 'SOURCE_DOCUMENT_EXTRACTED'
      ? '공식 첨부에서 AI가 추출한 작성 문항입니다. 문항 위치와 원문을 직접 대조해 주세요.'
      : '공식 파일 해시와 문항 위치를 확인한 양식입니다.'} 기관 검수 완료나 선정 가능성을 뜻하지 않습니다.</p>
    <a className={s.officialLink} href={form.sourceUrl} target="_blank" rel="noreferrer">
      공식 공고 열기<span className="sr-only">: {form.programTitle} (새 창)</span>
    </a>
  </section>
}

function SectionInputEditor({ section, vm }: {
  section: ApplicationFormSection
  vm: ReturnType<typeof useApplicationPreparationEditorViewModel>
}) {
  const [questionIndex, setQuestionIndex] = useState(0)
  const field = section.fields[questionIndex]
  const options = field?.options ?? []
  const missingOptions = options.length === 0 && /택\s*1|하나.{0,10}선택|중.{0,10}선택/.test(`${field?.label} ${field?.guidance}`)
  const messageKey = field ? `${section.key}:${field.key}` : section.key
  const answeredCount = section.fields.filter((value) => vm.sectionMessages[`${section.key}:${value.key}`]?.trim() || section.facts.some((fact) => fact.fieldKey === value.key)).length
  const busy = vm.busySection?.key === section.key
  const status = sectionStatus[section.status]
  const labels = new Map(section.fields.map((field) => [field.key, field.label]))
  return <section className={s.sectionItem} aria-label={`${section.title} 작성`}>
    <div className={s.sectionHeading}>
      <h3 className="text-lg font-bold">{section.title}</h3>
      <span className={status.className} >{status.label}</span>
    </div>
    {field && <div className="rounded-2xl rounded-tl-sm bg-emerald-50 p-4 text-sm leading-6 text-emerald-950" aria-live="polite">
      <p className="mb-2 text-xs font-semibold">질문 {questionIndex + 1} / {section.fields.length} · 답변 {answeredCount}개</p>
      <h4 className="font-bold">{field.label}을(를) 알려주세요.{field.required ? ' (필수)' : ' (선택)'}</h4>
      <p className="mt-2">{field.guidance}</p>
    </div>}
    {section.facts.some((fact) => fact.fieldKey === field?.key) && <div>
      <h3 className={s.label}>사용자가 확인한 사실</h3>
      <ul className={s.fieldList}>
        {section.facts.filter((fact) => fact.fieldKey === field?.key).map((fact) => <li className={s.factItem} key={fact.id}>
          <strong>{labels.get(fact.fieldKey) ?? fact.fieldKey}</strong>
          <p>{fact.status === 'UNKNOWN' ? '미정으로 확인함' : fact.value}</p>
        </li>)}
      </ul>
    </div>}
    <label className={s.label} htmlFor={`section-answer-${section.key}`}>답변 입력</label>
    {options.length > 0 ? <fieldset className="space-y-2" disabled={vm.busySection !== null}>
      <legend className={s.label}>공식 선택지 중 하나를 선택하세요</legend>
      {options.map((option) => <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm has-[:checked]:border-emerald-700 has-[:checked]:bg-emerald-50" key={option}>
        <input type="radio" name={`choice-${messageKey}`} value={option} checked={vm.sectionMessages[messageKey] === option} onChange={() => vm.setSectionMessage(messageKey, option)} />
        {option}
      </label>)}
      <label className="flex items-center gap-3 p-3 text-sm">
        <input type="radio" name={`choice-${messageKey}`} value="미정" checked={vm.sectionMessages[messageKey] === '미정'} onChange={() => vm.setSectionMessage(messageKey, '미정')} />아직 미정
      </label>
    </fieldset> : <textarea
      className={s.textarea}
      disabled={vm.busySection !== null}
      id={`section-answer-${section.key}`}
      maxLength={2000}
      value={vm.sectionMessages[messageKey] ?? ''}
      onChange={(event) => vm.setSectionMessage(messageKey, event.target.value)}
      placeholder="확인된 사실만 적어 주세요. 모르는 값은 미정이라고 밝혀 주세요."
    />}
    {missingOptions && <p className={s.warning}>공식 선택지를 확인하지 못했습니다. 아래 공식 공고에서 첨부 양식의 선택지를 확인한 뒤 입력해 주세요. <a className="underline" href={vm.preparation!.form.sourceUrl} target="_blank" rel="noreferrer">공식 공고 열기</a></p>}
    <div className="flex items-center justify-between gap-3" aria-label="입력 질문 이동">
      <button className={s.button} type="button" disabled={questionIndex === 0} onClick={() => setQuestionIndex((index) => index - 1)}>이전 질문</button>
      <button className={s.primary} type="button" disabled={questionIndex >= section.fields.length - 1} onClick={() => setQuestionIndex((index) => index + 1)}>다음 질문</button>
    </div>
    <p className={s.muted}>답변은 질문을 이동해도 유지됩니다. 모르는 내용은 미정이라고 적거나 건너뛰세요. 입력을 마치면 문서 답변 저장을 눌러주세요.</p>
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <p className="mb-3 text-sm text-emerald-950">이 문서에 입력한 답변을 한 번에 저장합니다. 입력한 내용 그대로 저장됩니다.</p>
      <button className={s.primary} type="button" disabled={vm.busySection !== null || !section.fields.some((value) => vm.sectionMessages[`${section.key}:${value.key}`]?.trim())} onClick={() => { void vm.saveDocumentAnswers(section) }}>
        {busy && vm.busySection?.action === 'save' ? '문서 답변 저장 중…' : '문서 답변 저장'}
      </button>
      {section.facts.length > 0 && <p className="mt-2 text-sm text-emerald-800" role="status">저장된 답변 {section.facts.length}개</p>}
    </div>
    <p className={s.locator}>공식 양식 위치: {section.locator}</p>
  </section>
}

function DocumentGenerationAction({ vm }: { vm: ReturnType<typeof useApplicationPreparationEditorViewModel> }) {
  const navigate = useNavigate()
  const preparation = vm.preparation!
  const pending = Object.values(vm.sectionMessages).some((value) => value.trim())
  const incomplete = preparation.form.sections.every((section) => section.facts.length === 0) || preparation.form.sections.some((section) => section.fields.some((field) => field.required && !section.facts.some((fact) => fact.fieldKey === field.key)))
  return <section className={s.sectionItem} aria-label="신청 문서 생성">
    <h3 className="text-lg font-bold">신청 문서 초안 생성</h3>
    <p className={s.muted}>모든 항목의 저장된 답변을 공식 원본 양식에 기입합니다. 다음 화면에서 편집 가능한 문서를 다운로드할 수 있습니다.</p>
    {pending && <p className={s.warning}>저장하지 않은 답변이 있습니다. 해당 항목에서 문서 답변 저장을 눌러 주세요.</p>}
    {incomplete && <p className={s.muted}>모든 필수 답변을 저장해 주세요. 모르는 내용은 미정으로 저장할 수 있습니다.</p>}
    <button type="button" className={s.primary} disabled={pending || incomplete || vm.busySection !== null}
      onClick={() => navigate(`${appPaths.applicationPreparations}/${preparation.id}/documents?generate=${preparation.inputRevision}`)}>초안 생성하기</button>
    <Link className={s.officialLink} to={`${appPaths.applicationPreparations}/${preparation.id}/documents`}>생성된 문서 보기</Link>
  </section>
}

function SectionWritingWorkspace({ vm }: { vm: ReturnType<typeof useApplicationPreparationEditorViewModel> }) {
  const sections = vm.preparation!.form.sections
  const [selectedKey, setSelectedKey] = useState(() => sections.find((section) => section.status !== 'INPUT_CONFIRMED')?.key ?? sections[0]?.key)
  const activeIndex = Math.max(0, sections.findIndex((section) => section.key === selectedKey))
  const activeSection = sections[activeIndex]
  const confirmedCount = sections.filter((section) => section.status === 'INPUT_CONFIRMED').length
  const headingRef = useRef<HTMLParagraphElement>(null)
  function selectSection(index: number) {
    setSelectedKey(sections[index].key)
    headingRef.current?.focus()
  }
  return <section className={s.card} aria-labelledby="official-sections-title">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className={s.cardTitle} id="official-sections-title">공식 작성 항목</h2>
      <p className="text-sm font-semibold text-emerald-800" role="status">사실 확인 {confirmedCount} / {sections.length}개 항목</p>
    </div>
    <p className={s.muted}>한 번에 한 항목씩 작성하세요. 목록에서 원하는 항목으로 이동해도 입력한 답변은 유지됩니다.</p>
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(0,2fr)]">
      <nav aria-label="신청 문서 작성 항목 목록" className="min-w-0 rounded-xl bg-slate-50 p-2 lg:sticky lg:top-4">
        <ol className="flex max-h-64 flex-col gap-2 overflow-y-auto lg:max-h-[65vh]">
          {sections.map((section, index) => {
            const pending = Boolean(section.fields.some((field) => vm.sectionMessages[`${section.key}:${field.key}`]?.trim()))
            const status = pending ? { label: '저장 전 답변', className: s.inProgress } : sectionStatus[section.status]
            return <li key={section.key}>
              <button type="button" aria-current={index === activeIndex ? 'step' : undefined}
                className={`flex w-full flex-col gap-2 rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087f46] ${index === activeIndex ? 'border-emerald-700 bg-white shadow-sm' : 'border-transparent hover:bg-white'}`}
                onClick={() => selectSection(index)}>
                <span className="text-sm font-bold">{index + 1}. {section.title}</span>
                <span className={`${status.className} self-start`} aria-label={`작성 상태: ${status.label}`}>{status.label}</span>
              </button>
            </li>
          })}
        </ol>
      </nav>
      {activeSection && <div className="min-w-0 space-y-3">
        <p ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-emerald-800 focus:outline-none" aria-live="polite">{activeIndex + 1} / {sections.length} · {activeSection.title}</p>
        <SectionInputEditor key={activeSection.key} section={activeSection} vm={vm} />
        <p className={s.muted}>저장 전 답변은 이 화면에서 항목을 이동할 때 유지됩니다. 화면을 나가기 전에는 문서 답변 저장을 눌러주세요.</p>
        <div className="flex items-center justify-between gap-3">
          <button className={s.button} type="button" disabled={activeIndex === 0} onClick={() => selectSection(activeIndex - 1)}>이전 항목</button>
          <button className={s.primary} type="button" disabled={activeIndex === sections.length - 1} onClick={() => selectSection(activeIndex + 1)}>다음 항목</button>
        </div>
        {activeIndex === sections.length - 1 && <p className={s.notice}>마지막 항목입니다. 목록에서 저장 전 답변이나 아직 확인하지 않은 항목을 살펴보세요.</p>}
        <DocumentGenerationAction vm={vm} />
      </div>}
    </div>
    <p className={s.notice}>저장한 답변은 공식 기관에 자동 제출되지 않습니다. 제출 전 공식 양식과 작성 내용을 확인해 주세요.</p>
  </section>
}

export function ApplicationPreparationListPage() {
  const account = useAppSelector(selectCurrentAccount)
  return account ? <ApplicationPreparationList key={account.email} /> : null
}

function ApplicationPreparationList() {
  const vm = useApplicationPreparationListViewModel()
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  return <>
    <WorkspacePageHeader
      title={listTitle}
      actions={<Link className={workspacePageStyles.primaryButton} to={appPaths.applicationPreparationNew}>새 작성</Link>}
    />
    <main className={workspacePageStyles.content}>
      <p className={s.muted}>검수된 공식 양식과 지원 분야를 선택해 신청 준비를 시작하고, 저장한 작업을 다시 열 수 있습니다.</p>
      {vm.error && <ErrorNotice message={vm.error.message} retryLabel="목록 다시 불러오기" onRetry={vm.retry} />}
      {vm.isInitialLoading && <p className={s.status} role="status" aria-live="polite">신청 준비 목록을 불러오는 중입니다.</p>}
      {vm.page?.items.length === 0 && !vm.isInitialLoading && <section className={s.card} aria-labelledby="empty-preparations-title">
        <h2 className={s.cardTitle} id="empty-preparations-title">아직 시작한 신청 문서가 없습니다.</h2>
        <p className={s.muted}>새 작성에서 공식 양식과 지원 분야를 확인한 뒤 시작해 주세요.</p>
      </section>}
      {vm.page && vm.page.items.length > 0 && <ul className={s.list} aria-label="신청 준비 목록">
        {vm.page.items.map((item) => <li className={s.card} key={item.id}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link className={`${s.listLink} min-w-0 flex-1`} to={`${appPaths.applicationPreparations}/${item.id}`}>
              <strong>{item.programTitle}</strong>
              <span className={s.muted}>{item.formTitle} · {applicationServiceFieldLabels[item.serviceField]}</span>
              <span className={s.muted}>입력 버전 {item.inputRevision} · {readableTime(item.updatedAt)} 수정</span>
            </Link>
            {confirmingId === item.id
              ? <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`${item.programTitle} 삭제 확인`}>
                <span className="text-sm text-red-800">작성 내용과 AI 실행 기록을 삭제할까요?</span>
                <button className={s.danger} disabled={vm.deletingId !== null} type="button" onClick={() => {
                  void vm.deletePreparation(item.id).then((deleted) => { if (deleted) setConfirmingId(null) })
                }}>{vm.deletingId === item.id ? '삭제 중…' : '정말 삭제'}</button>
                <button className={s.button} disabled={vm.deletingId !== null} type="button" onClick={() => setConfirmingId(null)}>취소</button>
              </div>
              : <button className={s.danger} disabled={vm.deletingId !== null} type="button" onClick={() => setConfirmingId(item.id)}>삭제</button>}
          </div>
        </li>)}
      </ul>}
      {vm.page && vm.page.nextBeforeId !== null && !vm.error && <div className={s.moreActions}>
        <button className={s.button} disabled={vm.isLoadingMore} type="button" onClick={() => { vm.loadMore() }}>
          {vm.isLoadingMore ? '이전 작업 불러오는 중…' : '이전 작업 더 보기'}
        </button>
        {vm.isLoadingMore && <p className={s.status} role="status" aria-live="polite">이전 신청 준비를 불러오는 중입니다.</p>}
      </div>}
    </main>
  </>
}

export function ApplicationPreparationEditorPage({ create = false }: { create?: boolean }) {
  const account = useAppSelector(selectCurrentAccount)
  const { preparationId } = useParams()
  const [searchParams] = useSearchParams()
  const id = create ? null : Number(preparationId)
  if (!account) return null
  if (!create && (id === null || !Number.isSafeInteger(id) || id <= 0)) {
    return <>
      <WorkspacePageHeader parent={{ to: appPaths.applicationPreparations, label: listTitle }} title="신청 문서" />
      <main className={workspacePageStyles.content}><ErrorNotice message="올바른 신청 준비 주소가 아닙니다." /></main>
    </>
  }
  const requestedSourceCode = create ? searchParams.get('sourceCode') ?? '' : ''
  const initialSourceCode = supportedDocumentSources.includes(requestedSourceCode) ? requestedSourceCode : ''
  const initialSourceProgramId = initialSourceCode ? searchParams.get('sourceProgramId') ?? '' : ''
  return <ApplicationPreparationEditor
    key={`${account.email}:${id ?? `new:${initialSourceCode}:${initialSourceProgramId}`}`}
    id={id}
    initialSourceCode={initialSourceCode}
    initialSourceProgramId={initialSourceProgramId}
  />
}

function ApplicationPreparationEditor({ id, initialSourceCode, initialSourceProgramId }: {
  id: number | null
  initialSourceCode: string
  initialSourceProgramId: string
}) {
  const [savedProgramsOpen, setSavedProgramsOpen] = useState(false)
  const savedProgramsButtonRef = useRef<HTMLButtonElement>(null)
  const vm = useApplicationPreparationEditorViewModel(id, initialSourceCode, initialSourceProgramId, savedProgramsOpen)
  const detail = id === null ? null : vm.preparation
  const resultHeading = useRef<HTMLHeadingElement>(null)
  const closeSavedPrograms = () => { setSavedProgramsOpen(false); savedProgramsButtonRef.current?.focus() }
  useLayoutEffect(() => {
    if (vm.creationStep === 'FORM') { setSavedProgramsOpen(false); resultHeading.current?.focus() }
  }, [vm.creationStep])
  const noDiscoveredForm = vm.error instanceof ApplicationPreparationError && vm.error.code === 'APPLICATION_FORM_NO_FORM'
  const canOpenOfficialSource = vm.error instanceof ApplicationPreparationError
    && ['APPLICATION_FORM_NO_FORM', 'APPLICATION_FORM_SOURCE_UNSUPPORTED'].includes(vm.error.code)
  const officialSource = vm.selectedProgram
    ? { title: vm.selectedProgram.title, url: vm.selectedProgram.sourceUrl }
    : vm.activeDiscoveryJob?.programSourceUrl
      ? { title: vm.activeDiscoveryJob.programTitle, url: vm.activeDiscoveryJob.programSourceUrl }
      : undefined
  return <>
    <WorkspacePageHeader
      parent={{ to: appPaths.applicationPreparations, label: listTitle }}
      title={id === null ? '새 신청 문서' : '신청 문서'}
    />
    <main className={workspacePageStyles.content}>
      {vm.loading && <p className={s.status} role="status" aria-live="polite">
        {id === null ? '지원 가능한 공식 양식을 불러오는 중입니다.' : '신청 문서 정보를 불러오는 중입니다.'}
      </p>}
      {vm.error && <ErrorNotice
        message={vm.error.message}
        onRetry={noDiscoveredForm || vm.submitting || vm.discovering ? undefined : id === null ? vm.discoverForms : vm.load}
        officialSource={canOpenOfficialSource ? officialSource : undefined}
      />}
        {id === null && vm.activeDiscoveryJob && vm.creationStep === 'PROGRAM' && <p role="status" aria-live="polite">
          {{ QUEUED: '작업이 접수되어 분석 순서를 기다리고 있습니다.', RUNNING: '공식 첨부를 수집하고 AI가 문항을 분석하고 있습니다.',
            SUCCEEDED: '저장된 분석 결과를 확인했습니다.', FAILED: '분석 작업이 실패로 종료되었습니다.', UNKNOWN: '분석 결과가 불확실하여 관리자 확인이 필요합니다.' }[vm.activeDiscoveryJob.status]}
          {vm.discoveryPollingPaused && ' 상태 조회가 중단되었습니다. 다시 시도하면 기존 작업만 조회하며 새 분석을 실행하지 않습니다.'}
        </p>}

      {id === null && <form className={s.form} aria-labelledby="create-preparation-title" onSubmit={(event) => {
        event.preventDefault()
        if (vm.selectedForm) void vm.create()
      }}>
        <ol className={s.steps} aria-label="신청 문서 작성 준비 단계">
          <li className={vm.creationStep === 'PROGRAM' ? s.activeStep : s.inactiveStep} aria-current={vm.creationStep === 'PROGRAM' ? 'step' : undefined}>1. 지원 공고 선택</li>
          <li className={vm.creationStep === 'FORM' ? s.activeStep : s.inactiveStep} aria-current={vm.creationStep === 'FORM' ? 'step' : undefined}>2. 신청 문서 확인</li>
        </ol>

        {vm.creationStep === 'PROGRAM' && <>
        {vm.selectedProgram && <section className={s.card} aria-labelledby="selected-application-program-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className={s.cardTitle} id="selected-application-program-title">선택한 공고</h2>
              <strong>{vm.selectedProgram.title}</strong>
              <p className={s.muted}>{catalogSourceLabels[vm.selectedProgram.sourceCode as keyof typeof catalogSourceLabels] ?? vm.selectedProgram.sourceName} · {vm.selectedProgram.organization} · {programStatusLabels[vm.selectedProgram.status]}</p>
              <p className={s.muted}>{vm.selectedProgram.applicationPeriod}</p>
            </div>
            <button className={s.primary} disabled={vm.discovering || vm.submitting} type="button" onClick={() => { void vm.discoverForms() }}>
              {vm.discovering ? '공식 첨부 분석 중…' : '신청 문서 찾기'}
            </button>
          </div>
          {vm.discovering && <p className={s.status} role="status" aria-live="polite">공식 페이지의 PDF/HWP/HWPX 첨부를 수집하고 작성 문항을 찾고 있습니다.</p>}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className={`${s.muted} min-w-0 flex-1`}>선택만으로 분석하지 않습니다. 버튼을 누르면 공식 첨부의 작성 문항을 찾습니다.</p>
            <button className={`${s.button} ml-auto shrink-0`} disabled={vm.discovering || vm.submitting} type="button" onClick={vm.clearProgramSelection}>선택 취소</button>
          </div>
        </section>}

        <section className={s.card}>
          <h2 className={s.cardTitle} id="create-preparation-title">전체 공고 검색</h2>
          <button ref={savedProgramsButtonRef} type="button" className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-slate-300 bg-white px-4 py-3 text-left text-sm font-semibold hover:border-emerald-400 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700" aria-label="관심 공고함에서 선택" aria-haspopup="dialog" aria-expanded={savedProgramsOpen} onClick={() => setSavedProgramsOpen(true)}><span>관심 공고함에서 선택</span><span className="text-emerald-800">열기 ›</span></button>
          <SavedSupportProgramPickerDialog
            open={savedProgramsOpen}
            phase={vm.savedProgramChoices.phase}
            programs={vm.savedProgramChoices.programs}
            selectedProgramKeys={vm.selectedProgram ? [`${vm.selectedProgram.sourceCode}:${vm.selectedProgram.id}`] : []}
            selectionLimit={1}
            description="신청 문서를 작성할 공고를 1개 선택하세요."
            listLabel="신청 문서 관심 공고 목록"
            isSupported={(program) => supportedDocumentSources.includes(program.sourceCode)}
            unsupportedLabel="문서 지원 준비 중"
            onToggle={(program) => {
              const selected = vm.selectedProgram?.sourceCode === program.sourceCode && vm.selectedProgram.id === program.id
              if (selected) vm.clearProgramSelection()
              else vm.selectProgram(program)
            }}
            onRetry={vm.savedProgramChoices.retry}
            onClose={closeSavedPrograms}
          />
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1 text-sm font-bold text-app-ink" htmlFor="application-program-search">
              공고명·기관명
              <input
                className={`${s.input} mt-2`}
                disabled={vm.catalogLoading || vm.discovering || vm.submitting}
                id="application-program-search"
                maxLength={100}
                value={vm.catalogKeyword}
                onChange={(event) => vm.setCatalogKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void vm.searchPrograms()
                  }
                }}
              />
            </label>
            <button className={s.button} disabled={vm.catalogLoading || vm.discovering || vm.submitting} type="button" onClick={() => { void vm.searchPrograms() }}>
              {vm.catalogLoading ? '공고 검색 중…' : '공고 검색'}
            </button>
          </div>
          <p className={s.muted}>공고명이나 기관명으로 모든 제공처를 검색하고 공식 PDF/HWP/HWPX를 분석할 수 있습니다.</p>
          {vm.catalogLoading && <p className={s.status} role="status" aria-live="polite">전체 제공처의 공고를 검색하고 있습니다.</p>}
          {vm.catalogError && <ErrorNotice message={vm.catalogError.message} retryLabel="공고 다시 검색" onRetry={() => { void vm.searchPrograms(vm.catalog?.page ?? 1, vm.appliedCatalogKeyword || vm.catalogKeyword) }} />}
          {vm.catalog?.programs.length === 0 && <p className={s.notice}>검색 결과가 없습니다. 다른 검색어를 입력하거나 아래에서 공식 URL·공고 ID를 직접 입력해 주세요.</p>}
          {vm.catalog && vm.catalog.programs.length > 0 && <>
            <p className={s.muted}>검색 결과 {vm.catalog.total}건 · {vm.catalog.page}/{vm.catalog.totalPages}페이지</p>
            <ul className="divide-y divide-slate-200" aria-label="신청 문서 공고 검색 결과">
              {vm.catalog.programs.map((program) => {
                const selected = vm.selectedProgram?.sourceCode === program.sourceCode && vm.selectedProgram.id === program.id
                const supported = supportedDocumentSources.includes(program.sourceCode)
                return <li className="py-3" key={`${program.sourceCode}:${program.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <strong>{program.title}</strong>
                      <p className={s.muted}>{catalogSourceLabels[program.sourceCode as keyof typeof catalogSourceLabels] ?? program.sourceName} · {program.organization} · {programStatusLabels[program.status]}</p>
                      <p className={s.muted}>{program.applicationPeriod}</p>
                    </div>
                    <button className={s.button} disabled={!supported || selected || vm.discovering || vm.submitting} type="button" onClick={() => vm.selectProgram(program)}>
                      {!supported ? '문서 지원 준비 중' : selected ? '선택됨' : '선택'}
                    </button>
                  </div>
                </li>
              })}
            </ul>
            {vm.catalog.totalPages > 1 && <div className={s.moreActions}>
              <button className={s.button} disabled={vm.catalogLoading || vm.catalog.page <= 1} type="button" onClick={() => { void vm.searchPrograms(vm.catalog!.page - 1, vm.appliedCatalogKeyword) }}>이전</button>
              <button className={s.button} disabled={vm.catalogLoading || vm.catalog.page >= vm.catalog.totalPages} type="button" onClick={() => { void vm.searchPrograms(vm.catalog!.page + 1, vm.appliedCatalogKeyword) }}>다음</button>
            </div>}
          </>}
        </section>

        <details className={s.card}>
          <summary className="cursor-pointer text-sm font-bold text-app-ink">검색에서 공고를 찾지 못했나요?</summary>
          <label className={s.label} htmlFor="application-program">
            {directInputLabels[vm.discoverySourceCode] ?? directInputLabels.BIZINFO}
          </label>
          <input
            className={s.input}
            disabled={vm.discovering || vm.submitting}
            id="application-program"
            value={vm.discoveryInput}
            onChange={(event) => vm.setManualDiscoveryInput(event.target.value)}
            placeholder={vm.discoverySourceCode && vm.discoverySourceCode !== 'BIZINFO' ? '예: 177911' : 'https://www.bizinfo.go.kr/…?pblancId=PBLN_… 또는 PBLN_…'}
          />
        </details>

        {!vm.selectedProgram && vm.discoveryInput.trim() && <section className={s.card} aria-label="입력한 공고 분석">
          <button className={s.primary} disabled={vm.discovering || vm.submitting || !vm.discoveryInput.trim()} type="button" onClick={() => { void vm.discoverForms() }}>
            {vm.discovering ? '공식 첨부 분석 중…' : '신청 문서 찾기'}
          </button>
          {vm.discovering && <p className={s.status} role="status" aria-live="polite">공식 페이지의 PDF/HWP/HWPX 첨부를 수집하고 작성 문항을 찾고 있습니다.</p>}
          <p className={s.muted}>공식 페이지가 직접 연결한 PDF/HWP/HWPX만 분석합니다. 분석 결과는 확인 전 AI 제안이며 자동 제출되지 않습니다.</p>
        </section>}
        </>}

        {vm.creationStep === 'FORM' && <>
        <section className={s.card} aria-labelledby="discovered-application-forms-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className={s.cardTitle} id="discovered-application-forms-title" ref={resultHeading} tabIndex={-1}>신청 문서를 찾았습니다</h2>
              <p className={s.muted}>발견한 공식 첨부와 작성 문항을 확인한 뒤 작성을 시작하세요.</p>
            </div>
            <button className={s.button} disabled={vm.submitting} type="button" onClick={vm.backToProgramSelection}>공고 다시 선택</button>
          </div>
        </section>

        {vm.discoveryWarnings.length > 0 && <section className={s.notice} aria-label="공고 분석 안내">
          <ul className="list-disc space-y-1 pl-5">{vm.discoveryWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </section>}

        {vm.selectedForm && <>
        <section className={s.card}>
          <h2 className={s.cardTitle}>작성 문서 선택</h2>
          <label className={s.label} htmlFor="application-form">작성할 공식 첨부</label>
          <select
            aria-describedby="application-form-hint"
            className={s.input}
            disabled={vm.submitting}
            id="application-form"
            value={vm.selectedFormVersionId}
            onChange={(event) => vm.selectForm(event.target.value)}
          >
            {vm.forms.map((form) => <option value={form.formVersionId} key={form.formVersionId}>
              {form.programTitle} — {form.formTitle}
            </option>)}
          </select>
          <p className={s.muted} id="application-form-hint">발견한 문서와 문항 위치를 원문에서 확인한 뒤 시작해 주세요.</p>
        </section>

        <OfficialFormSummary form={vm.selectedForm} />

        <section className={s.card} aria-labelledby="service-field-title">
          <h2 className={s.cardTitle} id="service-field-title">작성 시작</h2>
          {!(vm.selectedForm.supportedServiceFields.length === 1 && vm.selectedForm.supportedServiceFields[0] === 'GENERAL') && <>
          <label className={s.label} htmlFor="application-service-field">작성할 지원 분야</label>
          <select
            className={s.input}
            disabled={vm.submitting}
            id="application-service-field"
            value={vm.serviceField}
            onChange={(event) => vm.setServiceField(event.target.value as typeof vm.serviceField)}
          >
            {vm.selectedForm.supportedServiceFields.map((field) => <option value={field} key={field}>
              {applicationServiceFieldLabels[field]}
            </option>)}
          </select>
          </>}
          <p className={s.muted}>추출된 문항을 확인했습니다. 작성 시작은 신청 준비 건만 만들며 추가 AI 호출은 하지 않습니다.</p>
          <button className={s.primary} disabled={vm.submitting} type="submit">
            {vm.submitting ? '신청 준비 생성 중…' : '신청 문서 작성 시작'}
          </button>
          {vm.submitting && <p className={s.status} role="status" aria-live="polite">신청 준비를 생성하고 있습니다. 잠시만 기다려 주세요.</p>}
        </section>
        </>}
        </>}
      </form>}

      {detail && <>
        <OfficialFormSummary form={detail.form} />
        <section className={s.card} aria-labelledby="preparation-info-title">
          <h2 className={s.cardTitle} id="preparation-info-title">신청 준비 정보</h2>
          <dl className={s.details}>
            <div><dt>선택 분야</dt><dd>{applicationServiceFieldLabels[detail.serviceField]}</dd></div>
            <div><dt>입력 버전</dt><dd>{detail.inputRevision}</dd></div>
            <div><dt>신청 준비 번호</dt><dd>{detail.id}</dd></div>
          </dl>
        </section>
        <SectionWritingWorkspace key={detail.id} vm={vm} />
      </>}
    </main>
  </>
}
