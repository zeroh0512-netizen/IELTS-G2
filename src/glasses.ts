import {
  waitForEvenAppBridge, EvenAppBridge, CreateStartUpPageContainer, TextContainerProperty,
  TextContainerUpgrade, OsEventTypeList, StartUpPageCreateResult, AudioInputSource, type EvenHubEvent,
} from '@evenrealities/even_hub_sdk'

export type InputKind = 'tap' | 'double' | 'up' | 'down'

const HEADER = { id: 1, name: 'header' }
const BODY = { id: 2, name: 'body' }

/** Thin wrapper over the Even Hub bridge. Works as a no-op in a normal browser. */
export class Glasses {
  bridge: EvenAppBridge | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private last = { header: '', body: '' }
  private lastInputAt = 0
  onInput: (k: InputKind) => void = () => {}
  onAudio: (pcm: Uint8Array) => void = () => {}
  onPreview: (header: string, body: string) => void = () => {}

  async connect(timeoutMs = 2500): Promise<boolean> {
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))
    this.bridge = await Promise.race([waitForEvenAppBridge(), timeout])
    if (!this.bridge) return false

    const header = new TextContainerProperty({
      xPosition: 0, yPosition: 0, width: 576, height: 48,
      containerID: HEADER.id, containerName: HEADER.name,
      borderWidth: 0, paddingLength: 6, isEventCapture: 0, content: ' ',
    })
    const body = new TextContainerProperty({
      xPosition: 0, yPosition: 52, width: 576, height: 236,
      containerID: BODY.id, containerName: BODY.name,
      borderWidth: 1, borderColor: 6, borderRadius: 6, paddingLength: 10,
      isEventCapture: 1, content: ' ',
    })
    // The bridge object also exists in a plain browser, but host calls return null (or hang) there.
    // Anything but a success result means "not running inside the Even app".
    const created = await Promise.race([
      this.bridge.createStartUpPageContainer(
        new CreateStartUpPageContainer({ containerTotalNum: 2, textObject: [header, body] }),
      ).then((r) => r === StartUpPageCreateResult.success, () => false),
      new Promise<false>((r) => setTimeout(() => r(false), 4000)),
    ])
    if (!created) { this.bridge = null; return false }
    this.bridge.onEvenHubEvent((e) => this.handle(e))
    return true
  }

  private handle(e: EvenHubEvent) {
    if (e.audioEvent?.audioPcm) { this.onAudio(e.audioEvent.audioPcm); return }
    const src = e.textEvent ?? e.listEvent ?? e.sysEvent
    if (!src) return
    const t = OsEventTypeList.fromJson((src as { eventType?: unknown }).eventType)
    let kind: InputKind | null = null
    if (t === undefined || t === OsEventTypeList.CLICK_EVENT) kind = 'tap'
    else if (t === OsEventTypeList.DOUBLE_CLICK_EVENT) kind = 'double'
    else if (t === OsEventTypeList.SCROLL_TOP_EVENT) kind = 'up'
    else if (t === OsEventTypeList.SCROLL_BOTTOM_EVENT) kind = 'down'
    if (!kind) return
    const now = Date.now() // de-dupe duplicate events / rapid scroll
    if (now - this.lastInputAt < 300) return
    this.lastInputAt = now
    this.onInput(kind)
  }

  /** Update the screen. Only changed containers are sent; calls are serialized. */
  show(header: string, body?: string) {
    const h = header !== this.last.header
    const b = body !== undefined && body !== this.last.body
    if (h) this.last.header = header
    if (b) this.last.body = body!
    if (!h && !b) return
    this.onPreview(this.last.header, this.last.body)
    const bridge = this.bridge
    if (!bridge) return
    this.queue = this.queue.then(async () => {
      if (h) await bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: HEADER.id, containerName: HEADER.name, content: header }))
      if (b) await bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: BODY.id, containerName: BODY.name, content: body }))
    }).catch((err) => console.warn('display update failed', err))
  }

  async mic(on: boolean) {
    if (!this.bridge) return
    try { await this.bridge.audioControl(on, AudioInputSource.Glasses) } catch (err) { console.warn('mic', err) }
  }

  exit() { this.bridge?.shutDownPageContainer(1) }
}
