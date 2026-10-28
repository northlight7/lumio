import { describe, expect, it } from 'vitest'
import { ProviderStreamError, readProviderStream } from '../src/lib/provider-stream'

const enc = new TextEncoder()
const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, completion_tokens_details: { reasoning_tokens: 3 } }
const chunk = (delta: Record<string, unknown>, finish: unknown = null, tokenUsage: unknown = null) => ({ choices: [{ index: 0, delta, finish_reason: finish }], usage: tokenUsage })
const event = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`
const final = (text = '{}', tokenUsage: unknown = usage) => event(chunk({ content: text }, 'stop', tokenUsage))
const done = 'data: [DONE]\n\n'
function body(text: string, split = 1000000) {
  const bytes = enc.encode(text)
  return new ReadableStream<Uint8Array>({ start(controller) { for (let i = 0; i < bytes.length; i += split) controller.enqueue(bytes.slice(i, i + split)); controller.close() } })
}
const read = (text: string, limits = {}) => readProviderStream(body(text), new AbortController().signal, limits)

describe('bounded provider SSE reader', () => {
  it('assembles content, ignores keepalives and discards all reasoning while retaining safe usage', async () => {
    const text = ':keep-alive\n\n' + event(chunk({ role: 'assistant', reasoning_content: 'PRIVATE_REASONING' })) + event(chunk({ content: '{"ok":' })) + final('true}', { ...usage, reasoning_content: 'PRIVATE_USAGE_REASONING', completion_tokens_details: { reasoning_tokens: 3, reasoning_content: 'PRIVATE_NESTED_REASONING' } }) + done + ':keep-alive\n\n'
    const result = await read(text)
    expect(result).toEqual({ content: '{"ok":true}', usage, wireBytes: enc.encode(text).length, eventCount: 4 })
    expect(JSON.stringify(result)).not.toContain('PRIVATE')
  })
  it('decodes split multibyte UTF-8 and split CRLF incrementally', async () => {
    const text = (event(chunk({ content: '繁體中文' })) + final('✓') + done).replace(/\n/g, '\r\n')
    expect((await readProviderStream(body(text, 1), new AbortController().signal)).content).toBe('繁體中文✓')
  })
  it('accepts null text/role deltas and multi-line JSON data', async () => {
    const first = 'data: {"choices":[\ndata: {"index":0,"delta":{"content":null,"reasoning_content":null,"role":null},"finish_reason":null}],"usage":null}\n\n'
    expect((await read(first + final() + done)).content).toBe('{}')
  })
  it.each([
    ['missing DONE', final()],
    ['missing finish', event(chunk({ content: '{}' })) + done],
    ['unknown finish', event(chunk({ content: '{}' }, 'length', usage)) + done],
    ['empty content', final('') + done],
    ['whitespace content', final('   ') + done],
    ['truncated event', final() + 'data: [DONE]'],
    ['invalid JSON', 'data: {bad}\n\n' + done],
    ['invalid envelope', event({ error: { message: 'no' } }) + done],
    ['usage-only empty choices', final() + event({ choices: [], usage }) + done],
    ['multiple choices', event({ choices: [chunk({}).choices[0], chunk({}).choices[0]] }) + done],
    ['wrong index', event({ choices: [{ index: 1, delta: {}, finish_reason: null }] }) + done],
    ['nonassistant role', event(chunk({ role: 'user' })) + final() + done],
    ['invalid delta', event(chunk({ content: 1 })) + final() + done],
    ['invalid reasoning delta', event(chunk({ reasoning_content: {} })) + final() + done],
    ['tools', event(chunk({ tool_calls: [] })) + final() + done],
    ['error event', 'event: error\ndata: {}\n\n'],
    ['post-finish content', final() + event(chunk({ content: 'more' })) + done],
    ['second finish', final() + final() + done],
    ['post-DONE data', final() + done + event(chunk({ content: 'more' }))],
    ['repeated DONE', final() + done + done],
    ['missing usage', final('{}', null) + done],
    ['early usage', event(chunk({ content: '{}' }, null, usage)) + final() + done],
    ['negative usage', final('{}', { ...usage, prompt_tokens: -1 }) + done],
    ['fractional usage', final('{}', { ...usage, completion_tokens: 1.5 }) + done],
    ['inconsistent usage', final('{}', { ...usage, total_tokens: 99 }) + done],
    ['invalid optional usage', final('{}', { ...usage, prompt_cache_hit_tokens: 'secret' }) + done],
    ['excess cache hits', final('{}', { ...usage, prompt_cache_hit_tokens: 11 }) + done],
    ['excess cache misses', final('{}', { ...usage, prompt_cache_miss_tokens: 11 }) + done],
    ['excess combined cache', final('{}', { ...usage, prompt_cache_hit_tokens: 8, prompt_cache_miss_tokens: 3 }) + done],
    ['excess reasoning', final('{}', { ...usage, reasoning_tokens: 6 }) + done],
    ['excess cached detail', final('{}', { ...usage, prompt_tokens_details: { cached_tokens: 11 } }) + done],
    ['excess reasoning detail', final('{}', { ...usage, completion_tokens_details: { reasoning_tokens: 6 } }) + done],
  ])('rejects %s', async (_name, text) => { await expect(read(text)).rejects.toBeInstanceOf(ProviderStreamError) })
  it.each([
    ['wire', { wireBytes: 1 }], ['line', { lineBytes: 3 }], ['event', { eventBytes: 3 }],
    ['count', { eventCount: 1 }], ['content', { contentBytes: 1 }],
  ])('rejects the %s bound', async (_name, limits) => { await expect(read(final() + done, limits)).rejects.toBeInstanceOf(ProviderStreamError) })
  it('counts UTF-8 bytes rather than characters for final content', async () => { await expect(read(final('繁體') + done, { contentBytes: 5 })).rejects.toBeInstanceOf(ProviderStreamError) })
  it('retains validated token metrics for an explicit length finish without retaining reasoning', async () => {
    const tokenUsage = { ...usage, reasoning_content: 'PRIVATE_USAGE', completion_tokens_details: { reasoning_tokens: 3, reasoning_content: 'PRIVATE_NESTED_USAGE' } }
    const stream = event(chunk({ reasoning_content: 'PRIVATE_REASONING', content: '{' }, 'length', tokenUsage)) + done
    const error = await read(stream).catch(error => error)
    expect(error).toBeInstanceOf(ProviderStreamError)
    expect(error.diagnostics).toEqual({ finishReason: 'length', usage })
    expect(JSON.stringify(error)).not.toContain('PRIVATE')
  })
  it.each(['content_filter', 'tool_calls'])('retains only a known %s finish reason', async reason => {
    const error = await read(event(chunk({ content: '{' }, reason, usage)) + done).catch(error => error)
    expect(error.diagnostics).toEqual({ finishReason: reason, usage })
  })
  it('masks unknown finish text and omits invalid numeric token metrics', async () => {
    const error = await read(event(chunk({ content: '{', reasoning_content: 'PRIVATE_REASONING' }, 'PRIVATE_FINISH_REASON', { ...usage, completion_tokens: 'PRIVATE_USAGE' })) + done).catch(error => error)
    expect(error.diagnostics).toEqual({ finishReason: 'unknown' })
    expect(JSON.stringify(error)).not.toContain('PRIVATE')
  })
  it('rejects invalid and incomplete UTF-8', async () => {
    for (const bytes of [new Uint8Array([0xc3, 0x28]), new Uint8Array([0xe4, 0xb8])]) {
      const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close() } })
      await expect(readProviderStream(stream, new AbortController().signal)).rejects.toBeInstanceOf(ProviderStreamError)
      expect(stream.locked).toBe(false)
    }
  })
  it('cancels and unlocks after a protocol failure', async () => {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(enc.encode('data: nope\n\n')) }, cancel() { cancelled = true } })
    await expect(readProviderStream(stream, new AbortController().signal)).rejects.toBeInstanceOf(ProviderStreamError)
    expect(cancelled).toBe(true); expect(stream.locked).toBe(false)
  })
  it('preserves the exact transport error and unlocks', async () => {
    const failure = new TypeError('synthetic transport failure')
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.error(failure) } })
    await expect(readProviderStream(stream, new AbortController().signal)).rejects.toBe(failure)
    expect(stream.locked).toBe(false)
  })
  it('preserves abort reasons while cancelling an in-flight read', async () => {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true } })
    const controller = new AbortController(), failure = new DOMException('synthetic deadline', 'TimeoutError')
    const promise = readProviderStream(stream, controller.signal)
    controller.abort(failure)
    await expect(promise).rejects.toBe(failure)
    expect(cancelled).toBe(true); expect(stream.locked).toBe(false)
  })
  it('respects a total deadline even after DONE when the transport never ends', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(enc.encode(final() + done)) } })
    await expect(readProviderStream(stream, AbortSignal.timeout(5))).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(stream.locked).toBe(false)
  })
  it.each(['abort', 'protocol'])('settles promptly after %s even when transport cancellation never resolves', async kind => {
    let cancelCalls = 0
    const stream = new ReadableStream<Uint8Array>({
      start(c) { if (kind === 'protocol') c.enqueue(enc.encode('data: invalid\n\n')) },
      cancel() { cancelCalls++; return new Promise<void>(() => {}) },
    })
    const controller = new AbortController(), reason = new DOMException('synthetic deadline', 'TimeoutError')
    const promise = readProviderStream(stream, controller.signal)
    if (kind === 'abort') controller.abort(reason)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        kind === 'abort' ? expect(promise).rejects.toBe(reason) : expect(promise).rejects.toBeInstanceOf(ProviderStreamError),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Parser exceeded cancellation deadline')), 100) }),
      ])
    } finally { clearTimeout(timer) }
    expect(cancelCalls).toBe(1)
    expect(stream.locked).toBe(false)
  })
  it('handles an already aborted signal and invalid configuration', async () => {
    const controller = new AbortController(), failure = new Error('already aborted')
    controller.abort(failure)
    const stream = body(final() + done)
    await expect(readProviderStream(stream, controller.signal)).rejects.toBe(failure)
    expect(stream.locked).toBe(false)
    await expect(read(final() + done, { wireBytes: 0 })).rejects.toBeInstanceOf(ProviderStreamError)
  })
})
