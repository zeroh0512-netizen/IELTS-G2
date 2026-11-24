import './style.css'
import { Glasses, type InputKind } from './glasses'
import { generateQuestions, type QuestionSet } from './questions'
import { buildSteps, headerFor, fmt, type Step, type Answer, type PartChoice } from './session'
import { PcmRecorder, analyze } from './audio'
import { SonioxStream } from './soniox'
import { getFeedback, sessionText, CLAUDE_APP_PROMPT, type Feedback } from './feedback'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const glasses = new Glasses()

let questions: QuestionSet | null = null
let steps: Step[] = []
let idx = -1                   // -1 = ready screen, steps.length = finished
let startedAt = 0
let ticker: number | undefined
let recorder: PcmRecorder | null = null
let stt: SonioxStream | null = null
let answers: Answer[] = []
let photo: { base64: string; mimeType: string } | null = null

// ---------- storage (bridge storage persists in the Even app; localStorage elsewhere) ----------
async function load(key: string) {
  try { if (glasses.bridge) return (await glasses.bridge.getLocalStorage(key)) || '' } catch { /* fall through */ }
  try { return localStorage.getItem(key) || '' } catch { return '' }
}
async function save(key: string, val: string) {
  try { if (glasses.bridge) await glasses.bridge.setLocalStorage(key, val) } catch { /* ignore */ }
  try { localStorage.setItem(key, val) } catch { /* ignore */ }
}

// ---------- glasses screens ----------
function idleScreen() {
  glasses.show('IELTS SPEAKING', questions
    ? `Topic: ${questions.topic}\n\nTap to start.\nDouble-tap to exit.`
    : 'Take a photo of a topic\non your phone to begin.\n\nDouble-tap to exit.')
}

function readyScreen() {
  const parts = [...new Set(steps.map((s) => s.part))].map((p) => `Part ${p}`).join(', ')
  glasses.show(`IELTS  ${questions!.topic}`.slice(0, 60),
    `${parts}  -  ${steps.length} steps\n\nTap: start / next question\nDouble-tap: end session\n\nTap when ready.`)
}

function renderStep() {
  const step = steps[idx]
  const elapsed = (Date.now() - startedAt) / 1000
  const body = step.label === 'PREP'
    ? `${step.text}\n\n(Prepare - notes allowed. Tap to start speaking early.)`
    : step.text
  glasses.show(headerFor(step, elapsed), body)
  $('timer').textContent = step.mode === 'countdown' ? fmt(Math.max(0, Math.ceil(step.seconds - elapsed))) : fmt(elapsed)
  $('timer').classList.toggle('over', step.mode === 'countdown' ? elapsed >= step.seconds : elapsed > step.seconds)
  if (step.mode === 'countdown' && step.autoNext && elapsed >= step.seconds) next()
}

// ---------- session flow ----------
function startSession(choice: PartChoice) {
  if (!questions) return
  steps = buildSteps(questions, choice)
  answers = []
  idx = -1
  showView('practice')
  $('stepInfo').textContent = 'Ready'
  $('timer').textContent = '0:00'
  readyScreen()
}

async function finishStep() {
  clearInterval(ticker)
  const step = steps[idx]
  if (!step) return
  const elapsed = (Date.now() - startedAt) / 1000
  let audio: Blob | undefined
  let metrics
  if (recorder) {
    await glasses.mic(false)
    if (!recorder.isEmpty) { audio = recorder.toWav(); metrics = analyze(recorder.joined()) }
    recorder = null
  }
  if (!step.record) return
  const answer: Answer = { step, elapsed, audio, metrics }
  answers.push(answer)
  if (stt) {
    const s = stt
    stt = null
    answer.pendingTranscript = s.finish().then((text) => {
      if (!answer.transcript?.trim()) answer.transcript = text
      if (!text && s.error) answer.sttError = s.error
      answer.pendingTranscript = undefined
      refreshTranscript(answer)
    })
  }
}

async function next() {
  if (idx >= 0) await finishStep()
  idx++
  if (idx >= steps.length) return endSession()
  const step = steps[idx]
  startedAt = Date.now()
  $('stepInfo').textContent = `Part ${step.part} - ${step.label}`
  $('stepText').textContent = step.text
  $('liveText').textContent = ''
  if (step.record && glasses.bridge) {
    recorder = new PcmRecorder()
    const key = $<HTMLInputElement>('sonioxKey').value.trim()
    if (key) {
      stt = new SonioxStream(key, step.text)
      stt.onText = (t) => { $('liveText').textContent = t }
    }
    await glasses.mic(true)
  }
  renderStep()
  ticker = window.setInterval(renderStep, 250)
}

async function endSession() {
  if (idx >= 0 && idx < steps.length) await finishStep()
  idx = steps.length
  const total = answers.reduce((s, a) => s + a.elapsed, 0)
  glasses.show('SESSION COMPLETE', `${answers.length} answers  -  ${fmt(total)} speaking\n\nReview recordings on your phone.\n\nTap: new session\nDouble-tap: exit`)
  renderReview()
  showView('review')
}

function onInput(k: InputKind) {
  const view = currentView()
  if (view === 'practice') {
    if (k === 'tap') next()
    else if (k === 'double') endSession()
  } else if (view === 'review') {
    if (k === 'tap') { showView('home'); idleScreen() }
    else if (k === 'double') glasses.exit()
  } else {
    if (k === 'tap' && questions) startSession(selectedPart())
    else if (k === 'double') glasses.exit()
  }
}

// ---------- phone UI ----------
type View = 'home' | 'practice' | 'review'
function showView(v: View) {
  document.querySelectorAll<HTMLElement>('main[data-view]').forEach((el) => { el.hidden = el.dataset.view !== v })
  document.body.dataset.view = v
}
const currentView = () => document.body.dataset.view as View
const selectedPart = () => (document.querySelector<HTMLInputElement>('input[name=part]:checked')?.value || 'full') as PartChoice

function setPhoto(base64: string, mimeType: string) {
  photo = { base64, mimeType }
  $<HTMLImageElement>('preview').src = `data:${mimeType};base64,${base64}`
  $('preview').hidden = false
}

async function fileToBase64(file: Blob): Promise<{ base64: string; mimeType: string }> {
  // Downscale large camera photos to keep the request small.
  const img = await createImageBitmap(file)
  const scale = Math.min(1, 1568 / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return { base64: canvas.toDataURL('image/jpeg', 0.85).split(',')[1], mimeType: 'image/jpeg' }
}

function renderQuestions() {
  if (!questions) return
  const q = questions
  $('qTopic').textContent = q.topic
  $('qList').innerHTML = `
    <h3>Part 1</h3><ol>${q.part1.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
    <h3>Part 2</h3><p><b>${esc(q.part2.title)}</b></p><ul>${q.part2.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
    <p class="muted">Follow-up: ${esc(q.part2.followUp)}</p>
    <h3>Part 3</h3><ol>${q.part3.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>`
  $('questionsCard').hidden = false
  idleScreen()
}

function renderReview() {
  $('reviewList').innerHTML = ''
  $('feedbackOut').innerHTML = ''
  answers.forEach((a, i) => {
    const li = document.createElement('li')
    const over = a.elapsed > a.step.seconds && a.step.mode === 'countup'
    const short = a.step.label === 'SPEAK' && a.elapsed < 100
    const m = a.metrics
    li.innerHTML = `<div class="rmeta">Part ${a.step.part} - ${a.step.label}
      <span class="${over || short ? 'warn' : ''}">${fmt(a.elapsed)}${over ? ' (long)' : ''}${short ? ' (aim for 1:40-2:00)' : ''}</span></div>
      <div class="rq">${esc(a.step.text.split('\n')[0])}</div>
      ${m ? `<div class="muted small">Voice ${Math.round(m.speechSec)}s - pauses over 1.5s: ${m.pauseCount} - longest ${m.longestPause.toFixed(1)}s</div>` : ''}`
    if (a.audio) {
      const au = document.createElement('audio')
      au.controls = true; au.src = URL.createObjectURL(a.audio)
      li.appendChild(au)
    }
    const ta = document.createElement('textarea')
    ta.rows = 3
    ta.addEventListener('input', () => { a.transcript = ta.value })
    li.appendChild(ta)
    transcriptBoxes.set(a, ta)
    refreshTranscript(a)
    $('reviewList').appendChild(li)
  })
}

const transcriptBoxes = new WeakMap<Answer, HTMLTextAreaElement>()
function refreshTranscript(a: Answer) {
  const ta = transcriptBoxes.get(a)
  if (!ta) return
  if (document.activeElement !== ta) ta.value = a.transcript || ''
  ta.placeholder = a.pendingTranscript ? 'Transcribing...'
    : a.sttError ? `${a.sttError} Paste or type what you said.`
    : 'Paste or type what you said'
}

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { /* not a secure context */ }
  const ta = document.createElement('textarea')
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'
  document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length)
  const ok = document.execCommand('copy'); ta.remove()
  return ok
}

async function copyForClaude() {
  await Promise.all(answers.map((a) => a.pendingTranscript))
  const text = CLAUDE_APP_PROMPT + sessionText(questions?.topic || '', answers)
  const ok = await copyText(text)
  $<HTMLTextAreaElement>('exportText').value = text
  $('exportBox').hidden = ok
  $('reviewStatus').textContent = ok ? 'Copied. Paste it into the Claude app.' : 'Copy blocked here: select the text below and copy it.'
}

async function runFeedback() {
  const key = $<HTMLInputElement>('apiKey').value.trim()
  if (!key) { $('reviewStatus').textContent = 'Enter your Anthropic API key in settings first.'; return }
  if (answers.some((a) => a.pendingTranscript)) {
    $('reviewStatus').textContent = 'Finishing transcription...'
    await Promise.all(answers.map((a) => a.pendingTranscript))
  }
  if (!answers.some((a) => a.transcript?.trim())) { $('reviewStatus').textContent = 'Add at least one transcript first (paste or Transcribe).'; return }
  $<HTMLButtonElement>('feedbackBtn').disabled = true
  $('reviewStatus').textContent = 'Claude is assessing your answers...'
  glasses.show('FEEDBACK', 'Assessing your answers...')
  try {
    const fb = await getFeedback(key, questions?.topic || '', answers)
    renderFeedback(fb)
    $('reviewStatus').textContent = ''
    glasses.show(`FEEDBACK  ~Band ${fb.overall.estimate}`,
      `Fluency ${fb.overall.fluency}  Vocab ${fb.overall.lexical}  Grammar ${fb.overall.grammar}\n\n` +
      fb.overall.priorities.map((p, i) => `${i + 1}. ${p}`).join('\n') + '\n\nTap: new session')
  } catch (err) {
    $('reviewStatus').textContent = `Error: ${(err as Error).message}`
  } finally { $<HTMLButtonElement>('feedbackBtn').disabled = false }
}

function renderFeedback(fb: Feedback) {
  const o = fb.overall
  $('feedbackOut').innerHTML = `
    <div class="bands">
      <div><b>${o.estimate}</b><span>Estimate*</span></div>
      <div><b>${o.fluency}</b><span>Fluency</span></div>
      <div><b>${o.lexical}</b><span>Vocabulary</span></div>
      <div><b>${o.grammar}</b><span>Grammar</span></div>
    </div>
    <p>${esc(o.summary)}</p>
    <h3>Practise next</h3><ol>${o.priorities.map((p) => `<li>${esc(p)}</li>`).join('')}</ol>
    ${fb.answers.map((f) => {
      const a = answers[f.index - 1]
      return `<details class="fb"><summary>[${f.index}] ${a ? `Part ${a.step.part} ${a.step.label}` : ''}: ${esc(a?.step.text.split('\n')[0] || '')}</summary>
        <p>👍 ${esc(f.strengths)}</p>
        <ul>${f.issues.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        ${f.corrections.map((c) => `<p class="corr"><s>${esc(c.original)}</s><br>→ ${esc(c.better)}</p>`).join('')}
        <p class="model"><b>Model answer</b><br>${esc(f.modelAnswer)}</p></details>`
    }).join('')}
    <p class="muted small">*Pronunciation isn't scored, so this estimate is based on the transcript only.</p>`
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

function setBusy(on: boolean, msg = '') {
  $<HTMLButtonElement>('generate').disabled = on
  $('status').textContent = msg
}

async function init() {
  showView('home')
  glasses.onInput = onInput
  glasses.onAudio = (pcm) => { recorder?.push(pcm); stt?.push(pcm) }
  glasses.onPreview = (h, b) => { $('hudHeader').textContent = h; $('hudBody').textContent = b }

  const connected = await glasses.connect()
  $('conn').textContent = connected ? 'G2 connected' : 'Browser preview (no glasses)'
  $('conn').classList.toggle('ok', connected)
  idleScreen()

  $<HTMLInputElement>('apiKey').value = await load('anthropic_key')
  const saved = await load('questions')
  if (saved) { try { questions = JSON.parse(saved); renderQuestions() } catch { /* ignore */ } }

  $<HTMLInputElement>('sonioxKey').value = await load('soniox_key')
  $('sonioxKey').addEventListener('change', (e) => save('soniox_key', (e.target as HTMLInputElement).value.trim()))

  // Paste a screenshot / copied image of the topic straight into the topic box.
  $('topicText').addEventListener('paste', async (e) => {
    const item = [...((e as ClipboardEvent).clipboardData?.items || [])].find((it) => it.type.startsWith('image/'))
    const file = item?.getAsFile()
    if (file) { e.preventDefault(); const p = await fileToBase64(file); setPhoto(p.base64, p.mimeType) }
  })
  $('pasteBtn').addEventListener('click', async () => {
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith('image/'))
        if (type) { const p = await fileToBase64(await item.getType(type)); return setPhoto(p.base64, p.mimeType) }
        if (item.types.includes('text/plain')) {
          $<HTMLTextAreaElement>('topicText').value = await (await item.getType('text/plain')).text()
          return
        }
      }
    } catch {
      $('topicText').focus()
      $('status').textContent = 'Long-press the text box and choose Paste.'
    }
  })

  $('feedbackBtn').addEventListener('click', () => runFeedback())
  $('copyBtn').addEventListener('click', () => copyForClaude())

  $('apiKey').addEventListener('change', (e) => save('anthropic_key', (e.target as HTMLInputElement).value.trim()))

  $('camera').addEventListener('click', async () => {
    if (glasses.bridge) {
      const img = await glasses.bridge.captureImageFromCamera().catch(() => null)
      if (img) return setPhoto(img.base64.replace(/^data:[^,]+,/, ''), img.mimeType || 'image/jpeg')
      return
    }
    $<HTMLInputElement>('fileCam').click()
  })
  $('album').addEventListener('click', async () => {
    if (glasses.bridge) {
      const img = await glasses.bridge.pickImageFromAlbum().catch(() => null)
      if (img) return setPhoto(img.base64.replace(/^data:[^,]+,/, ''), img.mimeType || 'image/jpeg')
      return
    }
    $<HTMLInputElement>('fileAlbum').click()
  })
  for (const id of ['fileCam', 'fileAlbum']) {
    $(id).addEventListener('change', async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0]
      if (f) { const p = await fileToBase64(f); setPhoto(p.base64, p.mimeType) }
    })
  }

  $('generate').addEventListener('click', async () => {
    const key = $<HTMLInputElement>('apiKey').value.trim()
    const text = $<HTMLTextAreaElement>('topicText').value
    if (!key) return setBusy(false, 'Enter your Anthropic API key first.')
    if (!photo && !text.trim()) return setBusy(false, 'Take a photo or type a topic.')
    await save('anthropic_key', key)
    setBusy(true, 'Reading the topic and writing questions...')
    glasses.show('IELTS SPEAKING', 'Generating questions...')
    try {
      questions = await generateQuestions(key, { imageBase64: photo?.base64, mimeType: photo?.mimeType, text })
      await save('questions', JSON.stringify(questions))
      renderQuestions()
      setBusy(false, '')
    } catch (err) {
      setBusy(false, `Error: ${(err as Error).message}`)
      idleScreen()
    }
  })

  $('start').addEventListener('click', () => startSession(selectedPart()))
  $('nextBtn').addEventListener('click', () => next())
  $('endBtn').addEventListener('click', () => endSession())
  $('againBtn').addEventListener('click', () => { showView('home'); idleScreen() })
  document.addEventListener('keydown', (e) => {   // keyboard shortcuts for browser testing
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onInput('tap') }
    if (e.key === 'Escape') onInput('double')
  })
}

init()
