import { z } from 'zod'

import type { AssistantAnswer } from '../../domain/entities/AssistantAnswer'

export const assistantIntentSchema = z.enum(['PRODUCT_HELP', 'ACCOUNT_STATE', 'SEARCH', 'PROGRAM_QUESTION', 'OUT_OF_SCOPE', 'UNCLEAR'])
export const assistantAccountTopicSchema = z.enum(['SAVED_PROGRAMS', 'RECEIVED_PROPOSALS', 'COMPANY_PROFILE'])

/** 이동 버튼의 경로는 Core가 `/app` 아래 내부 경로만 내려주지만, 화면은 한 번 더 절대 경로인지 확인합니다. */
export const assistantNavigationDtoSchema = z.object({
  label: z.string().trim().min(1).max(160),
  to: z.string().regex(/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/),
})

export const assistantAnswerDtoSchema = z.object({
  intent: assistantIntentSchema,
  answer: z.string().trim().min(1).max(600).nullable(),
  citations: z.array(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)).max(3),
  clarificationQuestion: z.string().trim().min(1).max(160).nullable(),
  searchQuery: z.string().trim().min(1).max(500).nullable(),
  accountTopic: assistantAccountTopicSchema.nullable(),
  navigation: assistantNavigationDtoSchema.nullable(),
})

export type AssistantAnswerDto = z.infer<typeof assistantAnswerDtoSchema>

export function toAssistantAnswer(dto: AssistantAnswerDto): AssistantAnswer {
  return {
    intent: dto.intent,
    answer: dto.answer,
    citations: [...dto.citations],
    clarificationQuestion: dto.clarificationQuestion,
    searchQuery: dto.searchQuery,
    accountTopic: dto.accountTopic,
    navigation: dto.navigation === null ? null : { label: dto.navigation.label, to: dto.navigation.to },
  }
}
