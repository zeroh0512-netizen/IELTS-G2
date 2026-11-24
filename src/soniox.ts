/**
 * Live transcription with Soniox real-time STT over WebSocket.
 * Protocol (from the official @soniox/client SDK): API key as a WebSocket sub-protocol,
 * a JSON config message first, then raw audio frames, then an empty message to finish.
 */
const WS_URL = 'wss://stt-rt.soniox.com/transcribe-websocket'

interface Token { text: string; is_final?: boolean }

export class SonioxStream {
  private ws: WebSocket
  private pending: Uint8Array[] = []
  private pendingBytes = 0
  private finalText = ''
  private partial = ''
  private done: Promise<string>
  private resolveDone!: (t: string) => void
  private flushTimer: number | undefined
  error: string | null = null
  sentBytes = 0
  updates = 0
  onText: (text: string) => void = () => {}
  onStatus: (status: string) => void = () => {}

  private status(extra?: string) {
    const state = this.error ? `error: ${this.error}`
      : ['connecting', 'connected', 'closing', 'closed'][this.ws.readyState]
    this.onStatus(`Soniox ${state} - sent ${(this.sentBytes / 32000).toFixed(1)}s audio - ${this.updates} updates${extra ? ' - ' + extra : ''}`)
  }

  constructor(apiKey: string, question: string) {
    this.done = new Promise((r) => { this.resolveDone = r })
    this.ws = new WebSocket(WS_URL, ['soniox-api-key', apiKey])
    this.ws.binaryType = 'arraybuffer'
    this.status()
    this.ws.onopen = () => {
      this.status()
      this.ws.send(JSON.stringify({
        model: 'stt-rt-v6',
        audio_format: 'pcm_s16le',
        sample_rate: 16000,
        num_channels: 1,
        language_hints: ['en'],
        // Helps recognition of topic words; fillers are kept by default.
        context: { text: `IELTS Speaking test answer. Question: ${question}` },
      }))
      this.flush()
      this.flushTimer = window.setInterval(() => this.flush(), 100)
    }
    this.ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return
      const msg = JSON.parse(e.data) as { tokens?: Token[]; finished?: boolean; error_code?: number; error_message?: string }
      if (msg.error_message || msg.error_code) {
        this.error = `${msg.error_code ?? ''} ${msg.error_message ?? ''}`.trim()
        this.status(); this.close(); return
      }
      this.updates++
      let partial = ''
      for (const t of msg.tokens || []) {
        if (t.text === '<end>' || t.text === '<fin>') continue
        if (t.is_final) this.finalText += t.text
        else partial += t.text
      }
      this.partial = partial
      this.onText(this.text)
      this.status()
      if (msg.finished) this.close()
    }
    this.ws.onerror = () => { this.error ??= 'connection failed (check the API key / network)'; this.status() }
    this.ws.onclose = (e) => {
      if (!this.error && e.code !== 1000 && e.code !== 1005) this.error = `closed ${e.code}${e.reason ? ' ' + e.reason : ''}`
      this.status(); this.close()
    }
  }

  get text() { return (this.finalText + this.partial).replace(/\s+/g, ' ').trim() }

  push(pcm: Uint8Array) {
    this.pending.push(pcm.slice())
    this.pendingBytes += pcm.byteLength
  }

  private flush() {
    if (this.ws.readyState !== WebSocket.OPEN || !this.pendingBytes) return
    const buf = new Uint8Array(this.pendingBytes)
    let o = 0
    for (const c of this.pending) { buf.set(c, o); o += c.byteLength }
    this.pending = []; this.pendingBytes = 0
    this.ws.send(buf)
    this.sentBytes += buf.byteLength
    this.status()
  }

  /** Stop sending audio and wait (max ~8 s) for the final transcript. */
  finish(): Promise<string> {
    const send = () => { this.flush(); clearInterval(this.flushTimer); this.ws.send('') }
    if (this.ws.readyState === WebSocket.OPEN) send()
    else if (this.ws.readyState === WebSocket.CONNECTING) this.ws.addEventListener('open', () => setTimeout(send, 0), { once: true })
    else this.close()
    setTimeout(() => this.close(), 8000)
    return this.done
  }

  private close() {
    clearInterval(this.flushTimer)
    this.partial = ''
    this.resolveDone(this.text)
    if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) this.ws.close()
  }
}
