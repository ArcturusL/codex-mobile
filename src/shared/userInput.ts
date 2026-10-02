export type UserInputQuestion = {
  id: string
  header: string
  question: string
  isSecret: boolean
  options: Array<{ label: string; description: string }>
}

export type UserInputResponse = { answers: Record<string, { answers: string[] }> }

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function readUserInputQuestions(params: unknown): UserInputQuestion[] {
  const questions = record(params).questions
  if (!Array.isArray(questions)) return []
  return questions.flatMap((value) => {
    const question = record(value)
    if (typeof question.id !== 'string' || !question.id.trim()) return []
    const options = Array.isArray(question.options) ? question.options : []
    return [{
      id: question.id,
      header: typeof question.header === 'string' ? question.header : '',
      question: typeof question.question === 'string' ? question.question : '',
      isSecret: question.isSecret === true,
      options: options.flatMap((value) => {
        const option = record(value)
        return typeof option.label === 'string' && option.label.trim()
          ? [{ label: option.label, description: typeof option.description === 'string' ? option.description : '' }]
          : []
      }),
    }]
  })
}

export function userInputTimeoutMs(params: unknown): number | null {
  const request = record(params)
  if (readUserInputQuestions(params).length === 0 || request.isBlocking === true) return null
  // Codex CLI 0.153.4: 60s grace + 60s countdown; isBlocking replaces autoResolutionMs.
  if (request.isBlocking === false) return 120_000
  if (request.autoResolutionMs === null) return null
  if (request.autoResolutionMs !== undefined) {
    return typeof request.autoResolutionMs === 'number'
      && Number.isSafeInteger(request.autoResolutionMs)
      && request.autoResolutionMs >= 0
      && request.autoResolutionMs <= 2_147_483_647
      ? request.autoResolutionMs : null
  }
  // Mobile compatibility policy for older requests without either timeout field.
  return 60_000
}

export function defaultUserInputResponse(params: unknown): UserInputResponse {
  return {
    answers: Object.fromEntries(readUserInputQuestions(params).flatMap((question) => {
      const first = question.options[0]
      // Free-text/secret questions have no default: leave them unanswered, as Codex does.
      return first && !question.isSecret ? [[question.id, { answers: [first.label] }]] : []
    })),
  }
}
