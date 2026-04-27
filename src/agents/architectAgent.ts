/**
 * Architect Agent — Phase 2
 * Calls Anthropic Claude 3.7 Sonnet with streaming to produce an architecture design.
 * Uses native fetch — no additional packages required.
 */

import type { RepoContext } from '../lib/github'

// Legacy interface kept for type compatibility
export interface ArchitectureDesign {
  overview: string
  components: Array<{
    name: string
    type: 'frontend' | 'backend' | 'shared' | 'database'
    description: string
    dependencies: string[]
  }>
  dataModels: Array<{
    name: string
    fields: Array<{ name: string; type: string; required: boolean }>
  }>
  apiEndpoints: Array<{
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    path: string
    description: string
  }>
  fileStructure: string[]
  techStack: string[]
}

export interface ArchitectAgentInput {
  title: string
  description: string
  productSpec: string
  repoContext?: RepoContext
}

export async function runArchitectAgent(
  input: ArchitectAgentInput,
  onChunk: (text: string) => void,
): Promise<string> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY

  // Fall back to OpenAI gpt-4.1 if Anthropic key is unavailable
  if (!anthropicKey) {
    return runArchitectAgentOpenAI(input, onChunk)
  }

  const repoSection = input.repoContext
    ? `\n## Repository: ${input.repoContext.owner}/${input.repoContext.repo}\n${input.repoContext.description}\n\n### File Structure\n${input.repoContext.structure}\n\n${input.repoContext.files.map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n')}`
    : ''

  const systemPrompt = `You are a senior software architect specializing in TypeScript, Next.js, and Cloudflare Workers. Design practical, implementable technical plans. Be specific about files, components, and data models. Use markdown formatting.`

  const userPrompt = `# Coding Request
**Title:** ${input.title}
**Description:** ${input.description}

# Product Specification
${input.productSpec}
${repoSection}

Design the technical architecture with:
1. **Overview** — high-level approach (2-3 sentences)
2. **Components** — list each with type (frontend/backend/shared/database) and responsibility
3. **Data Models** — key entities and their fields
4. **API Endpoints** — routes that need to be created or modified
5. **File Structure** — specific files to create or modify
6. **Implementation Steps** — ordered action plan`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 4000,
      stream: true,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!response.ok || !response.body) {
    const err = await response.text()
    // If Anthropic fails (e.g. no credits), fall back to OpenAI
    console.error(`Anthropic API error ${response.status}: ${err} — falling back to OpenAI gpt-4.1`)
    return runArchitectAgentOpenAI(input, onChunk)
  }

  return parseAnthropicStream(response.body, onChunk)
}

async function parseAnthropicStream(
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
      if (!data || data === '[DONE]') continue
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

/** Fallback: use OpenAI gpt-4.1 if Anthropic is unavailable */
async function runArchitectAgentOpenAI(
  input: ArchitectAgentInput,
  onChunk: (text: string) => void,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('Neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is configured')

  const repoSection = input.repoContext
    ? `\n## Repository: ${input.repoContext.owner}/${input.repoContext.repo}\n${input.repoContext.description}\n\n### File Structure\n${input.repoContext.structure}\n\n${input.repoContext.files.map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n')}`
    : ''

  const systemPrompt = `You are a senior software architect specializing in TypeScript, Next.js, and Cloudflare Workers. Design practical, implementable technical plans. Be specific about files, components, and data models. Use markdown formatting.`

  const userPrompt = `# Coding Request
**Title:** ${input.title}
**Description:** ${input.description}

# Product Specification
${input.productSpec}
${repoSection}

Design the technical architecture with:
1. **Overview** — high-level approach (2-3 sentences)
2. **Components** — list each with type (frontend/backend/shared/database) and responsibility
3. **Data Models** — key entities and their fields
4. **API Endpoints** — routes that need to be created or modified
5. **File Structure** — specific files to create or modify
6. **Implementation Steps** — ordered action plan`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4.1',
      max_tokens: 4000,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
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
