/**
 * Product Agent — Phase 2
 * Calls OpenAI GPT-4o with streaming to produce a product specification.
 * Uses native fetch — no additional packages required.
 */

import type { RepoContext } from '../lib/github'

// Legacy interface kept for type compatibility
export interface ProductSpec {
  summary: string
  userStories: Array<{
    id: string
    title: string
    description: string
    acceptanceCriteria: string[]
  }>
  scope: { included: string[]; excluded: string[] }
  estimatedComplexity: 'low' | 'medium' | 'high'
}

export interface ProductAgentInput {
  title: string
  description: string
  projectName: string
  repoContext?: RepoContext
}

export async function runProductAgent(
  input: ProductAgentInput,
  onChunk: (text: string) => void,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')

  const repoSection = input.repoContext
    ? `\n## Repository: ${input.repoContext.owner}/${input.repoContext.repo}\n${input.repoContext.description}\n\n### File Structure\n${input.repoContext.structure}\n\n${input.repoContext.files.map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n')}`
    : ''

  const systemPrompt = `You are a senior product manager. Analyze coding requests and produce clear, actionable product specifications. Be concise and structured. Use markdown formatting.`

  const userPrompt = `# Coding Request
**Project:** ${input.projectName}
**Title:** ${input.title}
**Description:** ${input.description}
${repoSection}

Write a product specification including:
1. **Summary** — 2-3 sentences describing what will be built
2. **User Stories** — 2-3 stories with acceptance criteria
3. **Scope** — what's in and out of scope
4. **Estimated Complexity** — low/medium/high with brief reasoning`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      max_tokens: 1200,
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
