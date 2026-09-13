import { z } from 'zod'
import type {
  InterpretApplicationPreparation,
  NewApplicationPreparation,
  ReplaceApplicationPreparationInputs,
  GenerateApplicationDraft,
  SaveApplicationContent,
  ConfirmApplicationContent,
  UpdateApplicationProgress,
} from '../../domain/entities/ApplicationPreparation'
import type { ApplicationPreparationRepository } from '../../domain/repositories/ApplicationPreparationRepository'
import { ApplicationPreparationError } from '../../domain/errors/ApplicationPreparationError'
import { applicationPreparationRequest as request, downloadApplicationDocument } from '../api/applicationPreparationApi'
import {
  applicationPreparationPageSchema,
  applicationPreparationSchema,
  supportedApplicationFormsSchema,
  applicationInterpretationSchema,
  applicationFormDiscoveryJobSchema,
} from '../models/ApplicationPreparationDto'

const cursor = (beforeId?: number) => `?size=20${beforeId === undefined ? '' : `&beforeId=${beforeId}`}`
const documentsSchema = z.array(z.object({
  id: z.number().int().positive(), inputRevision: z.number().int().positive(),
  fileName: z.string().min(1).max(500).regex(/^[^\\/]+\.(hwp|hwpx|pdf)$/i).refine((name) => [...name].every((character) => character.charCodeAt(0) >= 32)),
  mediaType: z.enum(['application/pdf', 'application/x-hwp', 'application/hwp+zip']),
  size: z.number().int().positive().max(32 * 1024 * 1024),
})).max(20)

export class ApplicationPreparationRepositoryImpl implements ApplicationPreparationRepository {
  documents(id: number, signal?: AbortSignal) { return request(`/${id}/documents`, documentsSchema, 'GET', undefined, signal, 'preparation') }
  async generateDocuments(id: number, expectedRevision: number, signal?: AbortSignal) {
    const files = await request(`/${id}/documents`, documentsSchema, 'POST', { expectedRevision }, signal, 'preparation')
    if (files.length === 0 || files.some((file) => file.inputRevision !== expectedRevision)) throw new ApplicationPreparationError(502, 'INVALID_RESPONSE')
    return files
  }
  downloadDocument(id: number, fileId: number, signal?: AbortSignal) { return downloadApplicationDocument(id, fileId, signal) }
  async generateDraft(id: number, sectionKey: string, input: GenerateApplicationDraft, signal?: AbortSignal) {
    const result = await request(`/${id}/sections/${encodeURIComponent(sectionKey)}/drafts`, applicationPreparationSchema, 'POST', input, signal, 'preparation')
    if (result.id !== id || !result.contents.some((version) => version.sectionKey === sectionKey)) throw new ApplicationPreparationError(502, 'INVALID_RESPONSE')
    return result
  }
  async saveContent(id: number, sectionKey: string, input: SaveApplicationContent, signal?: AbortSignal) {
    const result = await request(`/${id}/sections/${encodeURIComponent(sectionKey)}/content`, applicationPreparationSchema, 'PUT', input, signal, 'preparation')
    if (result.id !== id || !result.contents.some((version) => version.sectionKey === sectionKey && version.id > input.expectedVersionId && version.content === input.content && version.kind === 'USER_EDIT')) throw new ApplicationPreparationError(502, 'INVALID_RESPONSE')
    return result
  }
  async confirmContent(id: number, sectionKey: string, input: ConfirmApplicationContent, signal?: AbortSignal) {
    const result = await request(`/${id}/sections/${encodeURIComponent(sectionKey)}/confirmations`, applicationPreparationSchema, 'POST', input, signal, 'preparation')
    if (result.id !== id || !result.contents.some((version) => version.id === input.expectedVersionId && version.sectionKey === sectionKey && version.confirmedAt !== null)) throw new ApplicationPreparationError(502, 'INVALID_RESPONSE')
    return result
  }
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
