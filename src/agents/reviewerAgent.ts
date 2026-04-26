/**
 * Reviewer Agent — Phase 2
 * Calls OpenAI GPT-4o with streaming to review and critique the plan.
 * Uses native fetch — no additional packages required.
 */

// Legacy interface kept for type compatibility
export interface ReviewFeedback {
  overallScore: number
  verdict: 'approved' | 'needs_revision' | 'rejected'
  strengths: string[]
  concerns: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical'
    category: string
    description: string
    recommendation: string
  }>
  securityNotes: string[]
  scalabilityNotes: string[]
  estimatedEffort: string
}

export interface ReviewerAgentInput {
  title: string
  productSpec: string
  architectureDesign: string
}

export async function runReviewerAgent(
  input: ReviewerAgentInput,
  onChunk: (text: string) => void,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')

  const systemPrompt = `You are a senior technical reviewer and security engineer. Review coding plans critically but constructively. Identify risks, security issues, and gaps. Use markdown formatting.`

  const userPrompt = `# Review Request: "${input.title}"

## Product Specification
${input.productSpec}

## Architecture Design
${input.architectureDesign}

Review this plan and provide:
1. **Overall Score** — 1-10 with justification
2. **Verdict** — approved / needs_revision / rejected
3. **Strengths** — what's well thought out
4. **Concerns** — issues with severity (low/medium/high/critical), category, description, and specific recommendation
5. **Security Notes** — authentication, authorization, data protection considerations
6. **Scalability Notes** — performance, Cloudflare Workers limits, D1 SQLite constraints
7. **Estimated Effort** — developer days with breakdown`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      max_tokens: 1000,
    }),
  })

  if (!response.ok || !response.body) {
    const err = await response.text()
    throw new Error(`OpenAI API error ${response.status}: ${err}`)
  }

  return parseOpenAIStream(response.body, onChunk)
}

async function parseOpenAIStream(
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
