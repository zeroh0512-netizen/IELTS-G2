import type { QuestionSet } from './questions'

export type PartChoice = 'full' | 'p1' | 'p2' | 'p3'

export interface Step {
  part: 1 | 2 | 3
  label: string          // e.g. "Q2/5", "PREP", "SPEAK"
  text: string           // shown in the body
  mode: 'countdown' | 'countup'
  seconds: number        // countdown length, or target time for countup
  record: boolean
  autoNext?: boolean     // move on automatically when the countdown hits 0
}

export interface Answer { step: Step; elapsed: number; audio?: Blob; metrics?: import("./audio").AudioMetrics; transcript?: string; pendingTranscript?: Promise<void>; sttError?: string }

export function buildSteps(q: QuestionSet, choice: PartChoice): Step[] {
  const steps: Step[] = []
  if (choice === 'full' || choice === 'p1') {
    q.part1.forEach((t, i) => steps.push({
      part: 1, label: `Q${i + 1}/${q.part1.length}`, text: t, mode: 'countup', seconds: 30, record: true,
    }))
  }
  if (choice === 'full' || choice === 'p2') {
    const card = `${q.part2.title}\n\nYou should say:\n${q.part2.bullets.map((b) => `- ${b}`).join('\n')}`
    steps.push({ part: 2, label: 'PREP', text: card, mode: 'countdown', seconds: 60, record: false, autoNext: true })
    steps.push({ part: 2, label: 'SPEAK', text: card, mode: 'countdown', seconds: 120, record: true })
    steps.push({ part: 2, label: 'FOLLOW-UP', text: q.part2.followUp, mode: 'countup', seconds: 30, record: true })
  }
  if (choice === 'full' || choice === 'p3') {
    q.part3.forEach((t, i) => steps.push({
      part: 3, label: `Q${i + 1}/${q.part3.length}`, text: t, mode: 'countup', seconds: 60, record: true,
    }))
  }
  return steps
}

export const fmt = (s: number) => `${Math.floor(Math.abs(s) / 60)}:${String(Math.floor(Math.abs(s)) % 60).padStart(2, '0')}`

/** Header line for the glasses: "PART 2  SPEAK        1:23 left" */
export function headerFor(step: Step, elapsed: number): string {
  const left = `PART ${step.part}  ${step.label}`
  let right: string
  if (step.mode === 'countdown') {
    const remain = step.seconds - elapsed
    if (remain > 0) right = `${fmt(Math.ceil(remain))} left${step.label === 'SPEAK' && remain <= 15 ? ' - WRAP UP' : ''}`
    else right = step.autoNext ? 'GO' : `TIME UP +${fmt(-remain)}`
  } else {
    right = `${fmt(elapsed)} / ${fmt(step.seconds)}${elapsed > step.seconds ? ' OVER' : ''}`
  }
  return `${left}   |   ${right}`
}
