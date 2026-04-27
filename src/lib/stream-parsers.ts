/**
 * Shared SSE stream parsers for OpenAI and Anthropic APIs.
 * Extracted from productAgent / codegenAgent / reviewerAgent to eliminate duplication.
 */

/** Parse an OpenAI chat completion SSE stream → full text + per-chunk callback. */
export async function parseOpenAIStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let fullContent = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>
        }
        const text = json.choices?.[0]?.delta?.content || ''
        if (text) {
          fullContent += text
          onChunk(text)
        }
      } catch {
        // skip malformed chunks
      }
    }
  }

  return fullContent
}

/** Parse an Anthropic messages SSE stream → full text + per-chunk callback. */
export async function parseAnthropicStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let fullContent = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (!data) continue
      try {
        const json = JSON.parse(data) as {
          type?: string
          delta?: { type?: string; text?: string }
        }
        if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
          const text = json.delta.text || ''
          if (text) {
            fullContent += text
            onChunk(text)
          }
        }
      } catch {
        // skip malformed chunks
      }
    }
  }

  return fullContent
}
