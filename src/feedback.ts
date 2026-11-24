import Anthropic from '@anthropic-ai/sdk'
import type { Answer } from './session'
import { fmt } from './session'

export interface Feedback {
  overall: { fluency: number; lexical: number; grammar: number; estimate: number; summary: string; priorities: string[] }
  answers: { index: number; strengths: string; issues: string[]; corrections: { original: string; better: string }[]; modelAnswer: string }[]
}

const band = { type: 'number', description: 'IELTS band 0-9 in 0.5 steps' }
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['overall', 'answers'],
  properties: {
    overall: {
      type: 'object', additionalProperties: false,
      required: ['fluency', 'lexical', 'grammar', 'estimate', 'summary', 'priorities'],
      properties: {
        fluency: band, lexical: band, grammar: band,
        estimate: { type: 'number', description: 'Overall estimate from the three criteria (pronunciation not assessed)' },
        summary: { type: 'string', description: '2-3 sentences in Korean' },
        priorities: { type: 'array', items: { type: 'string' }, description: 'Top 3 things to fix next, in Korean, concrete' },
      },
    },
    answers: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['index', 'strengths', 'issues', 'corrections', 'modelAnswer'],
        properties: {
          index: { type: 'integer', description: 'Answer number as given, starting at 1' },
          strengths: { type: 'string', description: 'One sentence, Korean' },
          issues: { type: 'array', items: { type: 'string' }, description: '1-3 issues in Korean (length, development, coherence, range, accuracy)' },
          corrections: {
            type: 'array', description: 'Up to 4 concrete fixes quoted from the answer',
            items: { type: 'object', additionalProperties: false, required: ['original', 'better'], properties: { original: { type: 'string' }, better: { type: 'string' } } },
          },
          modelAnswer: { type: 'string', description: 'Band 7.5-8 answer in English that keeps the candidate\'s ideas; natural spoken style, right length for the part' },
        },
      },
    },
  },
} as const

const SYSTEM = `You are a strict but encouraging IELTS Speaking examiner. Assess transcripts against the public band descriptors for Fluency and Coherence, Lexical Resource, and Grammatical Range and Accuracy.
Pronunciation cannot be judged from a transcript: do not score it.
Use the timing and pause data: Part 1 answers should be about 2-4 sentences (15-30 s); the Part 2 long turn should run 1:40-2:00 and cover all cue-card points; Part 3 answers should be developed with reasons and examples (40-60 s). Many long pauses or a short Part 2 lower Fluency.
Transcripts come from speech recognition, so ignore obvious transcription glitches and punctuation. Do not inflate scores.
Write the summary, priorities, strengths and issues in Korean; keep corrections and model answers in English.`

/** Plain-text bundle: used both for the API call and for pasting into the Claude app. */
export function sessionText(topic: string, answers: Answer[]): string {
  return [`Topic: ${topic}`, '', ...answers.map((a, i) => {
    const m = a.metrics
    const timing = `${fmt(a.elapsed)} (target ${a.step.mode === 'countdown' ? fmt(a.step.seconds) : 'about ' + fmt(a.step.seconds)})`
    const pauses = m ? `, voice ${Math.round(m.speechSec)}s, pauses>1.5s: ${m.pauseCount}, longest pause ${m.longestPause.toFixed(1)}s` : ''
    return `[${i + 1}] Part ${a.step.part} ${a.step.label} - ${timing}${pauses}\nQ: ${a.step.text}\nA: ${a.transcript?.trim() || '(no transcript)'}\n`
  })].join('\n')
}

export const CLAUDE_APP_PROMPT = `I'm practising IELTS Speaking. Act as an IELTS examiner and assess my answers below (transcribed from speech).
1. Estimate band scores for Fluency & Coherence, Lexical Resource, and Grammatical Range & Accuracy (pronunciation can't be judged from text).
2. For each answer: what was good, the main problems, and corrections quoting my words.
3. Give a band 7.5-8 model answer for each question that keeps my ideas.
4. Finish with the top 3 things I should practise next. Explanations in Korean, corrections in English.

`

export async function getFeedback(apiKey: string, topic: string, answers: Answer[]): Promise<Feedback> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: sessionText(topic, answers) }],
  } as Anthropic.Beta.MessageCreateParamsNonStreaming)
  if (response.stop_reason === 'refusal') throw new Error('Claude declined this request.')
  if (response.stop_reason === 'max_tokens') throw new Error('Feedback was cut off. Try fewer answers.')
  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  return JSON.parse(text) as Feedback
}
