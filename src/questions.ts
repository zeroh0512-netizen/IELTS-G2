import Anthropic from '@anthropic-ai/sdk'

export interface QuestionSet {
  topic: string
  part1: string[]
  part2: { title: string; bullets: string[]; followUp: string }
  part3: string[]
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['topic', 'part1', 'part2', 'part3'],
  properties: {
    topic: { type: 'string', description: 'Short topic label, max 40 chars' },
    part1: { type: 'array', items: { type: 'string' }, description: '4-5 short Part 1 interview questions' },
    part2: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'bullets', 'followUp'],
      properties: {
        title: { type: 'string', description: 'Cue card prompt, e.g. "Describe a place you visited recently."' },
        bullets: { type: 'array', items: { type: 'string' }, description: '3-4 "You should say:" points; last one starts with "and explain"' },
        followUp: { type: 'string', description: 'One short rounding-off question asked after the long turn' },
      },
    },
    part3: { type: 'array', items: { type: 'string' }, description: '4-5 abstract Part 3 discussion questions linked to the Part 2 theme' },
  },
} as const

const SYSTEM = `You are an IELTS Speaking examiner. The user gives you a photo (or text) of a speaking topic: it may be a printed cue card, a list of Part 1 questions, a textbook page, or just a theme.
Read the image carefully. If it already contains real exam questions or a cue card, keep their wording exactly and only fill in the missing parts. Otherwise write authentic, exam-style questions on that theme.
Rules: Part 1 questions are personal and everyday (about the candidate). Part 2 is one cue card in the official format. Part 3 questions are abstract and societal, linked to the Part 2 theme.
Keep every question under 120 characters - it is shown on a small smart-glasses display. Plain ASCII punctuation only (no curly quotes or emoji).`

export async function generateQuestions(
  apiKey: string,
  input: { imageBase64?: string; mimeType?: string; text?: string },
): Promise<QuestionSet> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const content: Anthropic.Beta.BetaContentBlockParam[] = []
  if (input.imageBase64) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: (input.mimeType || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: input.imageBase64,
      },
    })
  }
  content.push({
    type: 'text',
    text: input.text?.trim()
      ? `Topic / notes from the user: ${input.text.trim()}\nCreate the full IELTS Speaking question set.`
      : 'Create the full IELTS Speaking question set from this photo.',
  })

  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  } as Anthropic.Beta.MessageCreateParamsNonStreaming)

  if (response.stop_reason === 'refusal') throw new Error('Claude declined this request. Try another photo.')
  if (response.stop_reason === 'max_tokens') throw new Error('Response was cut off. Please try again.')
  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  const parsed = JSON.parse(text) as QuestionSet
  if (!parsed.part1?.length || !parsed.part2?.title || !parsed.part3?.length) throw new Error('Incomplete question set.')
  return parsed
}
