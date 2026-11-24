// G2 mic: 16 kHz, mono, signed 16-bit little-endian PCM.
const SAMPLE_RATE = 16000

export class PcmRecorder {
  private chunks: Uint8Array[] = []
  private bytes = 0
  push(chunk: Uint8Array) {
    this.chunks.push(chunk.slice())
    this.bytes += chunk.byteLength
  }
  get isEmpty() { return this.bytes === 0 }
  /** All PCM bytes concatenated. */
  joined(): Uint8Array {
    const out = new Uint8Array(this.bytes)
    let o = 0
    for (const c of this.chunks) { out.set(c, o); o += c.byteLength }
    return out
  }
  toWav(): Blob {
    const header = new ArrayBuffer(44)
    const v = new DataView(header)
    const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
    str(0, 'RIFF'); v.setUint32(4, 36 + this.bytes, true); str(8, 'WAVE')
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
    v.setUint32(24, SAMPLE_RATE, true); v.setUint32(28, SAMPLE_RATE * 2, true)
    v.setUint16(32, 2, true); v.setUint16(34, 16, true)
    str(36, 'data'); v.setUint32(40, this.bytes, true)
    return new Blob([header, ...this.chunks] as BlobPart[], { type: 'audio/wav' })
  }
}

export interface AudioMetrics {
  speechSec: number      // time with voice
  pauseCount: number     // silences >= 1.5 s between speech
  longestPause: number   // seconds
}

/** Rough fluency stats from 16 kHz PCM: 100 ms frames, adaptive silence threshold. */
export function analyze(pcm: Uint8Array | undefined): AudioMetrics | undefined {
  if (!pcm || pcm.byteLength < 3200) return undefined
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2))
  const frame = SAMPLE_RATE / 10
  const rms: number[] = []
  for (let i = 0; i + frame <= samples.length; i += frame) {
    let s = 0
    for (let j = i; j < i + frame; j++) s += samples[j] * samples[j]
    rms.push(Math.sqrt(s / frame))
  }
  const sorted = [...rms].sort((a, b) => a - b)
  const noise = sorted[Math.floor(sorted.length * 0.1)] || 0
  const loud = sorted[Math.floor(sorted.length * 0.9)] || 0
  const thr = Math.max(noise * 2, noise + (loud - noise) * 0.2, 200)
  let speechFrames = 0, pauseCount = 0, longest = 0, run = 0, seenSpeech = false
  for (const r of rms) {
    if (r >= thr) {
      if (seenSpeech && run >= 15) pauseCount++
      if (seenSpeech) longest = Math.max(longest, run)
      run = 0; seenSpeech = true; speechFrames++
    } else run++
  }
  return { speechSec: speechFrames / 10, pauseCount, longestPause: longest / 10 }
}
