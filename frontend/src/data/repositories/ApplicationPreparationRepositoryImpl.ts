import { z } from 'zod'
import type {
  InterpretApplicationPreparation,
  NewApplicationPreparation,
  ReplaceApplicationPreparationInputs,
  UpdateApplicationProgress,
} from '../../domain/entities/ApplicationPreparation'
import type { ApplicationPreparationRepository } from '../../domain/repositories/ApplicationPreparationRepository'
import { ApplicationPreparationError } from '../../domain/errors/ApplicationPreparationError'
import { applicationPreparationRequest as request } from '../api/applicationPreparationApi'
import {
  applicationPreparationPageSchema,
  applicationPreparationSchema,
  supportedApplicationFormsSchema,
  applicationInterpretationSchema,
  applicationFormDiscoveryJobSchema,
} from '../models/ApplicationPreparationDto'

const cursor = (beforeId?: number) => `?size=20${beforeId === undefined ? '' : `&beforeId=${beforeId}`}`

export class ApplicationPreparationRepositoryImpl implements ApplicationPreparationRepository {
  async forms(signal?: AbortSignal) {
    return (await request('/forms', supportedApplicationFormsSchema, 'GET', undefined, signal)).items
  }
  async discover(sourceCode: string, sourceProgramId: string, signal?: AbortSignal, requestKey = crypto.randomUUID()) {
    const job = await request('/forms/discovery-jobs', applicationFormDiscoveryJobSchema, 'POST', { sourceCode, sourceProgramId, requestKey }, signal)
    if (job.sourceCode !== sourceCode || job.sourceProgramId !== sourceProgramId || (job.status === 'SUCCEEDED' && job.result === null)) {
      throw new ApplicationPreparationError(502, 'INVALID_RESPONSE')
    }
    return job
  }
  async discoveryJob(id: number, signal?: AbortSignal) {
    const job = await request(`/forms/discovery-jobs/${id}`, applicationFormDiscoveryJobSchema, 'GET', undefined, signal)
    if (job.id !== id || (job.status === 'SUCCEEDED' && job.result === null)) throw new ApplicationPreparationError(502, 'INVALID_RESPONSE')
    return job
  }
  discoveryJobs(signal?: AbortSignal) {
    return request('/forms/discovery-jobs', z.array(applicationFormDiscoveryJobSchema).max(20), 'GET', undefined, signal)
  }
  list(beforeId?: number, signal?: AbortSignal) {
    return request(cursor(beforeId), applicationPreparationPageSchema, 'GET', undefined, signal)
  }
  delete(id: number, signal?: AbortSignal) {
    return request(`/${id}`, z.undefined(), 'DELETE', undefined, signal, 'preparation')
  }
  async get(id: number, signal?: AbortSignal) {
    const result = await request(`/${id}`, applicationPreparationSchema, 'GET', undefined, signal, 'preparation')
    if (result.id !== id) throw new ApplicationPreparationError(502, 'INVALID_RESPONSE')
    return result
  }
  async create(input: NewApplicationPreparation, signal?: AbortSignal) {
    const result = await request('', applicationPreparationSchema, 'POST', input, signal)
    if (
      result.form.sourceCode !== input.sourceCode ||
      result.form.sourceProgramId !== input.sourceProgramId ||
      result.form.formVersionId !== input.formVersionId ||
      result.serviceField !== input.serviceField
    ) {
      throw new ApplicationPreparationError(502, 'INVALID_RESPONSE')
    }
    return result
  }
  async interpret(id: number, sectionKey: string, input: InterpretApplicationPreparation, signal?: AbortSignal) {
    const result = await request(`/${id}/sections/${encodeURIComponent(sectionKey)}/messages`, applicationInterpretationSchema, 'POST', input, signal, 'preparation')
    if (result.inputRevision !== input.expectedRevision || result.sectionKey !== sectionKey) {
      throw new ApplicationPreparationError(502, 'INVALID_RESPONSE')
    }
    return result
  }
  async replaceInputs(id: number, sectionKey: string, input: ReplaceApplicationPreparationInputs, signal?: AbortSignal) {
    const result = await request(`/${id}/sections/${encodeURIComponent(sectionKey)}/inputs`, applicationPreparationSchema, 'PUT', input, signal, 'preparation')
    if (result.id !== id || result.inputRevision !== input.expectedRevision + 1) {
      throw new ApplicationPreparationError(502, 'INVALID_RESPONSE')
    }
    return result
  }
  async updateProgress(id: number, input: UpdateApplicationProgress, signal?: AbortSignal) {
    const result = await request(`/${id}/progress-stage`, applicationPreparationSchema, 'PUT', input, signal, 'preparation')
    if (result.id !== id || result.progressRevision !== input.expectedProgressRevision + 1 || result.progressStage !== input.progressStage) {
      throw new ApplicationPreparationError(502, 'INVALID_RESPONSE')
    }
    return result
  }
}
