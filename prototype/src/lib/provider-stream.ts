export type ProviderStreamLimits = { wireBytes: number; lineBytes: number; eventBytes: number; eventCount: number; contentBytes: number }
export type ProviderUsage = { prompt_tokens: number; completion_tokens: number; total_tokens: number; [key: string]: unknown }
export type ProviderStreamDiagnostics = { finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'unknown'; usage?: ProviderUsage }
export class ProviderStreamError extends Error {
  readonly code = 'provider_stream_invalid'
  constructor(message: string, readonly diagnostics?: ProviderStreamDiagnostics) { super(message); this.name = 'ProviderStreamError' }
}
const defaults: ProviderStreamLimits = { wireBytes: 12 * 1024 * 1024, lineBytes: 65536, eventBytes: 65536, eventCount: 32768, contentBytes: 196608 }
function invalid(reason: string): never { throw new ProviderStreamError(reason) }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
function usageValue(value: unknown): ProviderUsage {
  if (!object(value)) return invalid('Missing final token usage')
  const { prompt_tokens: prompt, completion_tokens: completion, total_tokens: total } = value
  if (![prompt, completion, total].every(v => Number.isSafeInteger(v) && (v as number) >= 0) || (prompt as number) + (completion as number) !== total) return invalid('Invalid final token usage')
  const result: ProviderUsage = { prompt_tokens: prompt as number, completion_tokens: completion as number, total_tokens: total as number }
  for (const key of ['prompt_cache_hit_tokens', 'prompt_cache_miss_tokens', 'reasoning_tokens']) {
    if (key in value) { if (!Number.isSafeInteger(value[key]) || (value[key] as number) < 0 || (value[key] as number) > (key === 'reasoning_tokens' ? completion as number : prompt as number)) invalid('Invalid final token usage'); result[key] = value[key] }
  }
  if (typeof result.prompt_cache_hit_tokens === 'number' && typeof result.prompt_cache_miss_tokens === 'number' && result.prompt_cache_hit_tokens + result.prompt_cache_miss_tokens > (prompt as number)) invalid('Invalid final token usage')
  for (const [key, allowed] of [['prompt_tokens_details', ['cached_tokens']], ['completion_tokens_details', ['reasoning_tokens']]] as const) {
    if (!(key in value)) continue
    const details = value[key]
    if (!object(details)) invalid('Invalid final token usage')
    const safe: Record<string, number> = {}
    for (const item of allowed) if (item in details) { if (!Number.isSafeInteger(details[item]) || (details[item] as number) < 0 || (details[item] as number) > (key === 'prompt_tokens_details' ? prompt as number : completion as number)) invalid('Invalid final token usage'); safe[item] = details[item] as number }
    result[key] = safe
  }
  return result
}

export async function readProviderStream(body: ReadableStream<Uint8Array>, signal: AbortSignal, overrides: Partial<ProviderStreamLimits> = {}): Promise<{ content: string; usage: ProviderUsage; wireBytes: number; eventCount: number }> {
  const limits = { ...defaults, ...overrides }
  if (Object.values(limits).some(value => !Number.isSafeInteger(value) || value < 1)) invalid('Invalid stream limits')
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let wireBytes = 0, eventCount = 0, contentBytes = 0, eventBytes = 0
  let pending = '', content = '', data: string[] = []
  let finished = false, done = false, usage: ProviderUsage | undefined
  let abortReject: (reason: unknown) => void = () => {}
  const aborted = new Promise<never>((_resolve, reject) => { abortReject = reject })
  const abort = () => { abortReject(signal.reason); void reader.cancel(signal.reason).catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  function dispatch() {
    if (!data.length) { eventBytes = 0; return }
    if (++eventCount > limits.eventCount) invalid('Stream event count exceeded')
    const raw = data.join('\n')
    data = []; eventBytes = 0
    if (done) invalid('Data after stream completion')
    if (raw === '[DONE]') { if (!finished || !usage || !content.trim()) invalid('Premature stream completion'); done = true; return }
    let value: unknown
    try { value = JSON.parse(raw) } catch { return invalid('Invalid stream JSON') }
    if (!object(value) || 'error' in value || !Array.isArray(value.choices) || value.choices.length !== 1) invalid('Invalid stream envelope')
    const choice: unknown = value.choices[0]
    if (!object(choice) || choice.index !== 0 || !object(choice.delta) || !('finish_reason' in choice)) invalid('Invalid stream choice')
    const delta = choice.delta
    if ('tool_calls' in delta || 'function_call' in delta || ('role' in delta && delta.role !== null && delta.role !== 'assistant')) invalid('Unsupported stream delta')
    for (const key of ['content', 'reasoning_content']) if (key in delta && delta[key] !== null && typeof delta[key] !== 'string') invalid('Invalid stream delta text')
    const piece = typeof delta.content === 'string' ? delta.content : ''
    if (finished) invalid('Event after final stream choice')
    contentBytes += Buffer.byteLength(piece, 'utf8')
    if (contentBytes > limits.contentBytes) invalid('Stream content bound exceeded')
    content += piece
    // Reasoning text is discarded with this event and never returned or logged.
    if (choice.finish_reason !== null) {
      if (choice.finish_reason !== 'stop') {
        const finishReason: ProviderStreamDiagnostics['finishReason'] = ['length', 'content_filter', 'tool_calls'].includes(choice.finish_reason as string) ? choice.finish_reason as ProviderStreamDiagnostics['finishReason'] : 'unknown'
        let safeUsage: ProviderUsage | undefined
        try { safeUsage = usageValue(value.usage) } catch { /* Invalid usage never becomes operator evidence. */ }
        throw new ProviderStreamError('Incomplete stream finish', { finishReason, ...(safeUsage ? { usage: safeUsage } : {}) })
      }
      usage = usageValue(value.usage)
      finished = true
    } else if (value.usage !== undefined && value.usage !== null) invalid('Token usage before final choice')
  }
  function line(value: string) {
    if (Buffer.byteLength(value, 'utf8') > limits.lineBytes) invalid('Stream line bound exceeded')
    if (!value) { dispatch(); return }
    if (value.startsWith(':')) return
    if (done) invalid('Data after stream completion')
    eventBytes += Buffer.byteLength(value, 'utf8') + 1
    if (eventBytes > limits.eventBytes) invalid('Stream event bound exceeded')
    if (value === 'data') data.push('')
    else if (value.startsWith('data:')) data.push(value.slice(5).replace(/^ /, ''))
    else invalid('Unsupported stream event field')
  }
  function consume(value: string) {
    pending += value
    let end: number
    while ((end = pending.indexOf('\n')) !== -1) { const next = pending.slice(0, end).replace(/\r$/, ''); pending = pending.slice(end + 1); line(next) }
    if (Buffer.byteLength(pending.replace(/\r$/, ''), 'utf8') > limits.lineBytes) invalid('Stream line bound exceeded')
  }
  try {
    if (signal.aborted) throw signal.reason
    while (true) {
      const chunk = await Promise.race([reader.read(), aborted])
      if (chunk.done) break
      if (!(chunk.value instanceof Uint8Array)) invalid('Invalid stream bytes')
      wireBytes += chunk.value.byteLength
      if (wireBytes > limits.wireBytes) invalid('Stream wire bound exceeded')
      let decoded: string
      try { decoded = decoder.decode(chunk.value, { stream: true }) } catch { return invalid('Invalid stream UTF-8') }
      consume(decoded)
    }
    try { consume(decoder.decode()) } catch (error) { if (error instanceof ProviderStreamError) throw error; return invalid('Invalid stream UTF-8') }
    if (pending || data.length || !done || !finished || !usage || !content.trim()) invalid('Truncated stream')
    return { content, usage, wireBytes, eventCount }
  } finally {
    signal.removeEventListener('abort', abort)
    // The underlying transport's cancellation may never settle. Cancellation
    // closes pending reads synchronously, and must not extend the caller deadline.
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
