import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { appContainer } from '../../../../app/appContainer'
import type {
  ApplicationForm,
  ApplicationPreparation,
  ApplicationFormSection,
  NewApplicationPreparationFact,
  ApplicationServiceField,
  ApplicationFormDiscoveryJob,
} from '../../../../domain/entities/ApplicationPreparation'
import { ApplicationPreparationError } from '../../../../domain/errors/ApplicationPreparationError'
import type { SupportProgram } from '../../../../domain/entities/SupportProgram'
import type { SupportProgramCatalog } from '../../../../domain/entities/SupportProgramCatalog'
import { appPaths } from '../../../shared/routes/appPaths'
import { useSavedSupportProgramChoices } from '../../../shared/support-program/useSavedSupportProgramChoices'

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error('신청 문서 정보를 처리하지 못했습니다.')
}

const supportedDocumentSources = ['BIZINFO', 'KSTARTUP', 'MSIT', 'CNTRADE_NOTICE']

export function useApplicationPreparationEditorViewModel(id: number | null, initialSourceCode = '', initialSourceProgramId = '', loadSavedPrograms = false) {
  const useCase = appContainer.resolve('applicationPreparationUseCase')
  const catalogUseCase = appContainer.resolve('browseSupportProgramsUseCase')
  const programDetailUseCase = appContainer.resolve('getSupportProgramDetailUseCase')
  const navigate = useNavigate()
  const savedProgramChoices = useSavedSupportProgramChoices(id === null && loadSavedPrograms)
  const [forms, setForms] = useState<ApplicationForm[]>([])
  const [selectedFormVersionId, setSelectedFormVersionId] = useState('')
  const [preparation, setPreparation] = useState<ApplicationPreparation | null>(null)
  const [serviceField, setServiceField] = useState<ApplicationServiceField>('GENERAL')
  const [discoveryInput, setDiscoveryInput] = useState(initialSourceProgramId)
  const [discovering, setDiscovering] = useState(false)
  const [discoveryWarnings, setDiscoveryWarnings] = useState<string[]>([])
  const [activeDiscoveryJob, setActiveDiscoveryJob] = useState<ApplicationFormDiscoveryJob | null>(null)
  const [discoveryPollingPaused, setDiscoveryPollingPaused] = useState(false)
  const [discoveryJobs, setDiscoveryJobs] = useState<ApplicationFormDiscoveryJob[]>([])
  const [discoveryJobsLoading, setDiscoveryJobsLoading] = useState(false)
  const [discoveryJobsError, setDiscoveryJobsError] = useState<Error | null>(null)
  const discoveryRequestKey = useRef<string | null>(null)
  const discoveryLookupId = useRef<number | null>(null)
  const discoveryRestoreAllowed = useRef(true)
  const [catalog, setCatalog] = useState<SupportProgramCatalog | null>(null)
  const [catalogKeyword, setCatalogKeyword] = useState('')
  const [appliedCatalogKeyword, setAppliedCatalogKeyword] = useState('')
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<Error | null>(null)
  const [selectedProgram, setSelectedProgram] = useState<SupportProgram | null>(null)
  const [discoverySourceCode, setDiscoverySourceCode] = useState(initialSourceCode)
  const [creationStep, setCreationStep] = useState<'PROGRAM' | 'FORM'>('PROGRAM')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const loadController = useRef<AbortController | null>(null)
  const createController = useRef<AbortController | null>(null)
  const discoveryController = useRef<AbortController | null>(null)
  const discoveryJobsController = useRef<AbortController | null>(null)
  const catalogController = useRef<AbortController | null>(null)
  const loadSequence = useRef(0)
  const submittingGuard = useRef(false)
  const actionController = useRef<AbortController | null>(null)
  const [sectionMessages, setSectionMessages] = useState<Record<string, string>>({})
  const [busySection, setBusySection] = useState<{ key: string; action: 'save' } | null>(null)

  const selectedForm = useMemo(
    () => forms.find(({ formVersionId }) => formVersionId === selectedFormVersionId) ?? null,
    [forms, selectedFormVersionId],
  )

  const load = useCallback(() => {
    loadController.current?.abort()
    const controller = new AbortController()
    const sequence = ++loadSequence.current
    loadController.current = controller
    if (id === null) return controller
    setLoading(true)
    setError(null)

    const request = useCase.get(id, controller.signal)
    void request.then((result) => {
      if (controller.signal.aborted || sequence !== loadSequence.current) return
      setPreparation(result as ApplicationPreparation)
    }).catch((caught: unknown) => {
      if (controller.signal.aborted || sequence !== loadSequence.current) return
      setError(asError(caught))
    }).finally(() => {
      if (controller.signal.aborted || sequence !== loadSequence.current) return
      loadController.current = null
      setLoading(false)
    })

    return controller
  }, [id, useCase])

  useEffect(() => {
    const controller = load()
    return () => {
      controller.abort()
      if (loadController.current === controller) loadController.current = null
      loadSequence.current += 1
    }
  }, [load])

  useEffect(() => () => {
    createController.current?.abort()
    discoveryController.current?.abort()
    discoveryJobsController.current?.abort()
    catalogController.current?.abort()
    actionController.current?.abort()
    submittingGuard.current = false
  }, [])

  const searchPrograms = useCallback(async (page = 1, keyword = catalogKeyword) => {
    catalogController.current?.abort()
    const controller = new AbortController()
    catalogController.current = controller
    setCatalogLoading(true)
    setCatalogError(null)
    try {
      const result = await catalogUseCase.execute({
        keyword: keyword.trim(),
        region: '',
        category: '',
        sourceCode: '',
        startupStage: '',
        applicantType: '',
        founderAge: '',
        status: 'ALL',
        sort: 'RECENT',
        page,
        pageSize: 10,
      }, controller.signal)
      if (controller.signal.aborted || catalogController.current !== controller) return
      setCatalog(result)
      setAppliedCatalogKeyword(keyword)
    } catch (caught) {
      if (!controller.signal.aborted && catalogController.current === controller) setCatalogError(asError(caught))
    } finally {
      if (catalogController.current === controller) {
        catalogController.current = null
        setCatalogLoading(false)
      }
    }
  }, [catalogKeyword, catalogUseCase])

  const applyProgramSelection = useCallback((program: SupportProgram, preserveDiscoveryRequestKey = false) => {
    setSelectedProgram(program)
    setDiscoverySourceCode(program.sourceCode)
    setDiscoveryInput(program.id)
    setCreationStep('PROGRAM')
    setForms([])
    setSelectedFormVersionId('')
    setDiscoveryWarnings([])
    setError(null)
    setActiveDiscoveryJob(null)
    setDiscoveryPollingPaused(false)
    if (!preserveDiscoveryRequestKey) discoveryRequestKey.current = null
    discoveryLookupId.current = null
  }, [])

  const selectProgram = useCallback((program: SupportProgram) => {
    if (discoveryController.current || (activeDiscoveryJob && ['QUEUED', 'RUNNING'].includes(activeDiscoveryJob.status) && !discoveryPollingPaused)) return
    if (!supportedDocumentSources.includes(program.sourceCode)) return
    discoveryRestoreAllowed.current = false
    applyProgramSelection(program)
  }, [activeDiscoveryJob, applyProgramSelection, discoveryPollingPaused])

  const setManualDiscoveryInput = useCallback((value: string) => {
    if (discoveryController.current || (activeDiscoveryJob && ['QUEUED', 'RUNNING'].includes(activeDiscoveryJob.status) && !discoveryPollingPaused)) return
    discoveryRestoreAllowed.current = false
    setSelectedProgram(null)
    setDiscoveryInput(value)
    setCreationStep('PROGRAM')
    setForms([])
    setSelectedFormVersionId('')
    setDiscoveryWarnings([])
    setActiveDiscoveryJob(null)
    setDiscoveryPollingPaused(false)
    discoveryRequestKey.current = null
    discoveryLookupId.current = null
  }, [activeDiscoveryJob, discoveryPollingPaused])

  const clearProgramSelection = useCallback(() => {
    if (submittingGuard.current || discoveryController.current || (activeDiscoveryJob && ['QUEUED', 'RUNNING'].includes(activeDiscoveryJob.status) && !discoveryPollingPaused)) return
    setManualDiscoveryInput('')
    setDiscoverySourceCode('')
    setServiceField('GENERAL')
    setError(null)
  }, [activeDiscoveryJob, discoveryPollingPaused, setManualDiscoveryInput])

  const acceptDiscoveryJob = useCallback((job: ApplicationFormDiscoveryJob) => {
    setActiveDiscoveryJob(job)
    setDiscoveryJobs((current) => [job, ...current.filter(({ id }) => id !== job.id)]
      .sort((left, right) => right.id - left.id).slice(0, 20))
    if (job.status === 'SUCCEEDED' && job.result) {
      const result = job.result
      const firstForm = result.items[0]
      setForms(result.items)
      setSelectedFormVersionId(firstForm?.formVersionId ?? '')
      if (firstForm?.supportedServiceFields[0]) setServiceField(firstForm.supportedServiceFields[0])
      setDiscoveryWarnings(result.warnings)
      if (firstForm) setCreationStep('FORM')
    } else if (job.status === 'FAILED' || job.status === 'UNKNOWN') {
      setError(new ApplicationPreparationError(422, job.failureCode ?? 'DISCOVERY_FAILED'))
    }
  }, [])

  const loadDiscoveryJob = useCallback(async (jobId: number) => {
    if (discoveryController.current) return
    discoveryLookupId.current = jobId
    setActiveDiscoveryJob(null)
    const controller = new AbortController()
    discoveryController.current = controller
    setDiscovering(true)
    setError(null)
    setDiscoveryPollingPaused(true)
    setForms([])
    setSelectedFormVersionId('')
    setDiscoveryWarnings([])
    setCreationStep('PROGRAM')
    try {
      const job = await useCase.discoveryJob(jobId, controller.signal)
      if (controller.signal.aborted) return
      setSelectedProgram(null)
      setDiscoverySourceCode(job.sourceCode)
      setDiscoveryInput(job.sourceProgramId)
      setCreationStep('PROGRAM')
      acceptDiscoveryJob(job)
      setDiscoveryPollingPaused(false)
    } catch (caught) {
      if (!controller.signal.aborted) setError(asError(caught))
    } finally {
      if (discoveryController.current === controller) {
        discoveryController.current = null
        setDiscovering(false)
      }
    }
  }, [useCase, acceptDiscoveryJob])

  const loadDiscoveryJobs = useCallback((restoreLatest = false) => {
    discoveryJobsController.current?.abort()
    const controller = new AbortController()
    discoveryJobsController.current = controller
    setDiscoveryJobsLoading(true)
    setDiscoveryJobsError(null)

    void (async () => {
      let jobs: ApplicationFormDiscoveryJob[] | null = null
      try {
        jobs = await useCase.discoveryJobs(controller.signal)
        if (controller.signal.aborted || discoveryJobsController.current !== controller) return
        setDiscoveryJobs(jobs)
      } catch (caught) {
        if (!controller.signal.aborted && discoveryJobsController.current === controller) setDiscoveryJobsError(asError(caught))
      }

      if (controller.signal.aborted || !restoreLatest || !discoveryRestoreAllowed.current) return
      const matchingJob = initialSourceCode && initialSourceProgramId
        ? jobs?.find((job) => job.sourceCode === initialSourceCode && job.sourceProgramId === initialSourceProgramId)
        : jobs?.[0]
      if (matchingJob) {
        await loadDiscoveryJob(matchingJob.id)
        return
      }
      if (!initialSourceCode || !initialSourceProgramId) return

      setLoading(true)
      setError(null)
      try {
        const program = await programDetailUseCase.execute({ sourceCode: initialSourceCode, sourceProgramId: initialSourceProgramId }, controller.signal)
        if (!controller.signal.aborted && discoveryJobsController.current === controller && program) applyProgramSelection(program, true)
      } catch (caught) {
        if (!controller.signal.aborted && discoveryJobsController.current === controller) setError(asError(caught))
      } finally {
        if (!controller.signal.aborted && discoveryJobsController.current === controller) setLoading(false)
      }
    })().finally(() => {
      if (discoveryJobsController.current === controller) {
        discoveryJobsController.current = null
        if (!controller.signal.aborted) setDiscoveryJobsLoading(false)
      }
    })

    return controller
  }, [applyProgramSelection, initialSourceCode, initialSourceProgramId, loadDiscoveryJob, programDetailUseCase, useCase])

  useEffect(() => {
    if (id !== null) return
    discoveryRestoreAllowed.current = true
    const controller = loadDiscoveryJobs(true)
    return () => controller.abort()
  }, [id, loadDiscoveryJobs])

  const activeDiscoveryId = activeDiscoveryJob && ['QUEUED', 'RUNNING'].includes(activeDiscoveryJob.status) ? activeDiscoveryJob.id : null
  useEffect(() => {
    if (!activeDiscoveryId || discoveryPollingPaused) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const job = await useCase.discoveryJob(activeDiscoveryId, controller.signal)
        if (controller.signal.aborted) return
        acceptDiscoveryJob(job)
        if (['QUEUED', 'RUNNING'].includes(job.status)) timer = setTimeout(() => void poll(), 3000)
      } catch (caught) {
        if (!controller.signal.aborted) {
          setDiscoveryPollingPaused(true)
          setError(asError(caught))
        }
      }
    }
    timer = setTimeout(() => void poll(), 3000)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [activeDiscoveryId, discoveryPollingPaused, useCase, acceptDiscoveryJob])

  const discoverForms = useCallback(async () => {
    discoveryRestoreAllowed.current = false
    const lookupId = discoveryLookupId.current ?? activeDiscoveryJob?.id
    if (lookupId) { await loadDiscoveryJob(lookupId); return }
    if (discoveryController.current) return
    if (discovering || !discoveryInput.trim()) {
      if (!discoveryInput.trim()) setError(new Error('기업마당 공식 공고 URL 또는 PBLN 공고 ID를 입력해 주세요.'))
      return
    }
    const controller = new AbortController()
    discoveryController.current = controller
    setDiscovering(true)
    setError(null)
    setDiscoveryWarnings([])
    try {
      // 응답 유실 후 재시도에도 동일 키를 사용한다. 공고를 바꿀 때만 새 요청을 만든다.
      discoveryRequestKey.current ??= crypto.randomUUID()
      const job = selectedProgram || discoverySourceCode
        ? await useCase.discover(discoverySourceCode, discoveryInput, controller.signal, discoveryRequestKey.current)
        : await useCase.discoverBizInfo(discoveryInput, controller.signal, discoveryRequestKey.current)
      if (controller.signal.aborted || discoveryController.current !== controller) return
      acceptDiscoveryJob(job)
    } catch (caught) {
      if (!controller.signal.aborted && discoveryController.current === controller) {
        setForms([])
        setSelectedFormVersionId('')
        setError(asError(caught))
      }
    } finally {
      if (discoveryController.current === controller) {
        discoveryController.current = null
        setDiscovering(false)
      }
    }
  }, [activeDiscoveryJob, loadDiscoveryJob, discovering, discoveryInput, discoverySourceCode, selectedProgram, useCase, acceptDiscoveryJob])

  const backToProgramSelection = useCallback(() => {
    setCreationStep('PROGRAM')
    setError(null)
  }, [])

  const selectForm = useCallback((formVersionId: string) => {
    const form = forms.find((candidate) => candidate.formVersionId === formVersionId)
    if (!form) return
    setSelectedFormVersionId(formVersionId)
    setServiceField((current) => form.supportedServiceFields.includes(current)
      ? current
      : form.supportedServiceFields[0])
  }, [forms])

  const create = useCallback(async () => {
    if (submittingGuard.current) return
    if (!selectedForm || !selectedForm.supportedServiceFields.includes(serviceField)) {
      setError(new Error('지원 공고와 공식 양식, 작성 분야를 다시 선택해 주세요.'))
      return
    }

    submittingGuard.current = true
    const controller = new AbortController()
    createController.current = controller
    setSubmitting(true)
    setError(null)
    try {
      const created = await useCase.create({
        sourceCode: selectedForm.sourceCode,
        sourceProgramId: selectedForm.sourceProgramId,
        formVersionId: selectedForm.formVersionId,
        serviceField,
      }, controller.signal)
      if (!controller.signal.aborted && createController.current === controller) {
        navigate(`${appPaths.applicationPreparations}/${created.id}`, { replace: true })
      }
    } catch (caught) {
      if (!controller.signal.aborted && createController.current === controller) setError(asError(caught))
    } finally {
      if (!controller.signal.aborted && createController.current === controller) {
        createController.current = null
        submittingGuard.current = false
        setSubmitting(false)
      }
    }
  }, [navigate, selectedForm, serviceField, useCase])

  const setSectionMessage = useCallback((sectionKey: string, message: string) => {
    setSectionMessages((current) => ({ ...current, [sectionKey]: message }))
  }, [])

  async function saveDocumentAnswers(section: ApplicationFormSection) {
    if (!preparation || busySection || actionController.current) return
    const answers = section.fields.map((field) => ({ field, value: (sectionMessages[`${section.key}:${field.key}`] ?? '').trim() })).filter(({ value }) => value)
    if (answers.length === 0) return
    const invalid = answers.find(({ field, value }) => [...value].length > 2000 || (field.options?.length && value !== '미정' && !field.options.includes(value)))
    if (invalid) {
      setError(new Error(`${invalid.field.label}: 답변은 2,000자 이내로 입력하고 선택형 질문은 공식 선택지를 선택해 주세요.`))
      return
    }
    const merged = new Map<string, NewApplicationPreparationFact>(section.facts.map((fact) => [fact.fieldKey, {
      fieldKey: fact.fieldKey, status: fact.status, value: fact.value, sourceText: fact.sourceText,
    }]))
    for (const { field, value } of answers) {
      merged.set(field.key, { fieldKey: field.key, status: value === '미정' ? 'UNKNOWN' : 'PROVIDED',
        value: value === '미정' ? null : value, sourceText: `${field.label}: ${value}` })
    }
    const controller = new AbortController()
    actionController.current = controller
    setBusySection({ key: section.key, action: 'save' })
    setError(null)
    try {
      const updated = await useCase.replaceInputs(preparation.id, section.key, {
        expectedRevision: preparation.inputRevision, facts: [...merged.values()],
      }, controller.signal)
      if (controller.signal.aborted || actionController.current !== controller) return
      setPreparation(updated)
      setSectionMessages((current) => {
        const remaining = { ...current }
        for (const { field } of answers) delete remaining[`${section.key}:${field.key}`]
        return remaining
      })
    } catch (caught) {
      if (!controller.signal.aborted && actionController.current === controller) setError(asError(caught))
    } finally {
      if (actionController.current === controller) {
        actionController.current = null
        setBusySection(null)
      }
    }
  }

  return {
    forms,
    selectedForm,
    selectedFormVersionId,
    preparation,
    serviceField,
    discoveryInput,
    discovering: discovering || (activeDiscoveryId !== null && !discoveryPollingPaused),
    activeDiscoveryJob,
    loadDiscoveryJob,
    discoveryJobs,
    discoveryJobsLoading,
    discoveryJobsError,
    loadDiscoveryJobs,
    discoveryPollingPaused,
    discoveryWarnings,
    catalog,
    catalogKeyword,
    appliedCatalogKeyword,
    catalogLoading,
    catalogError,
    savedProgramChoices,
    selectedProgram,
    discoverySourceCode,
    creationStep,
    loading,
    submitting,
    error,
    setServiceField,
    setCatalogKeyword,
    searchPrograms,
    selectProgram,
    clearProgramSelection,
    setManualDiscoveryInput,
    discoverForms,
    backToProgramSelection,
    selectForm,
    load,
    create,
    sectionMessages,
    busySection,
    setSectionMessage,
    saveDocumentAnswers,
  }
}
