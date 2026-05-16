/**
 * @module modelRouter
 * @description Milestone 5 — Model routing abstraction.
 * Routes agent requests to the appropriate AI model provider based on
 * agent role, task complexity, and availability.
 *
 * Supports: Anthropic Claude, OpenAI GPT, Workers AI (future), Gemini (future).
 * Prepares for AI Gateway integration.
 *
 * Each agent role has a preferred model + fallback chain.
 * Uses raw fetch() — no SDK dependencies.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AgentRole =
  | 'product'
  | 'repo_intelligence'
  | 'architect'
  | 'code'
  | 'test'
  | 'fix'
  | 'reviewer'
  | 'memory'

export type ModelProvider = 'anthropic' | 'openai' | 'workers_ai' | 'gemini'

export interface ModelConfig {
  provider: ModelProvider
  model: string
  maxTokens: number
  temperature?: number
  supportsStreaming: boolean
  supportsThinking?: boolean
  thinkingBudget?: number
  costTier: 'low' | 'medium' | 'high'
}

export interface ModelRouteResult {
  primary: ModelConfig
  fallbacks: ModelConfig[]
  role: AgentRole
  reasoning: string
}

export interface ModelCallInput {
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
  temperature?: number
  stream?: boolean
  jsonMode?: boolean
}

export interface ModelCallResult {
  content: string
  provider: ModelProvider
  model: string
  tokensUsed?: number
  durationMs: number
  fromFallback: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Model catalog
// ─────────────────────────────────────────────────────────────────────────────

const ANTHROPIC_SONNET: ModelConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  maxTokens: 8192,
  supportsStreaming: true,
  supportsThinking: true,
  thinkingBudget: 8000,
  costTier: 'medium',
}

const ANTHROPIC_HAIKU: ModelConfig = {
  provider: 'anthropic',
  model: 'claude-haiku-4-5-20251001',
  maxTokens: 4096,
  supportsStreaming: true,
  supportsThinking: false,
  costTier: 'low',
}

const OPENAI_GPT41: ModelConfig = {
  provider: 'openai',
  model: 'gpt-4.1',
  maxTokens: 8192,
  supportsStreaming: true,
  costTier: 'medium',
}

const OPENAI_GPT41_MINI: ModelConfig = {
  provider: 'openai',
  model: 'gpt-4.1-mini',
  maxTokens: 4096,
  supportsStreaming: true,
  costTier: 'low',
}

// ─────────────────────────────────────────────────────────────────────────────
// Role → model routing
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_ROUTES: Record<AgentRole, { primary: ModelConfig; fallbacks: ModelConfig[]; reasoning: string }> = {
  product: {
    primary: OPENAI_GPT41,
    fallbacks: [ANTHROPIC_SONNET],
    reasoning: 'Product analysis needs fast reasoning — GPT-4.1 primary, Claude Sonnet fallback',
  },
  repo_intelligence: {
    primary: OPENAI_GPT41_MINI,
    fallbacks: [ANTHROPIC_HAIKU],
    reasoning: 'Repo scanning is structured extraction — cost-efficient model preferred',
  },
  architect: {
    primary: { ...ANTHROPIC_SONNET, maxTokens: 16000, thinkingBudget: 10000 },
    fallbacks: [OPENAI_GPT41],
    reasoning: 'Architecture design needs strongest reasoning — Claude Sonnet with extended thinking',
  },
  code: {
    primary: { ...ANTHROPIC_SONNET, maxTokens: 16000 },
    fallbacks: [OPENAI_GPT41],
    reasoning: 'Code generation needs strongest coding model — Claude Sonnet primary',
  },
  test: {
    primary: OPENAI_GPT41,
    fallbacks: [ANTHROPIC_SONNET],
    reasoning: 'Test analysis needs coding + debug capability',
  },
  fix: {
    primary: ANTHROPIC_SONNET,
    fallbacks: [OPENAI_GPT41],
    reasoning: 'Fix agent needs precise code understanding — Claude Sonnet primary',
  },
  reviewer: {
    primary: OPENAI_GPT41,
    fallbacks: [ANTHROPIC_HAIKU],
    reasoning: 'Reviewer uses different model from Code Agent for independence',
  },
  memory: {
    primary: ANTHROPIC_HAIKU,
    fallbacks: [OPENAI_GPT41_MINI],
    reasoning: 'Memory agent does summarization — cost-efficient model preferred',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

export function routeModel(role: AgentRole): ModelRouteResult {
  const route = ROLE_ROUTES[role]
  return {
    primary: route.primary,
    fallbacks: route.fallbacks,
    role,
    reasoning: route.reasoning,
  }
}

/**
 * Check if a provider's API key is available.
 */
function hasProviderKey(provider: ModelProvider): boolean {
  switch (provider) {
    case 'anthropic':
      return !!process.env.ANTHROPIC_API_KEY
    case 'openai':
      return !!process.env.OPENAI_API_KEY
    case 'workers_ai':
      return false // future
    case 'gemini':
      return false // future
    default:
      return false
  }
}

/**
 * Get the best available model for a role, checking API key availability.
 */
export function getAvailableModel(role: AgentRole): ModelConfig {
  const route = routeModel(role)

  if (hasProviderKey(route.primary.provider)) {
    return route.primary
  }

  for (const fallback of route.fallbacks) {
    if (hasProviderKey(fallback.provider)) {
      return fallback
    }
  }

  throw new Error(`No API key available for role "${role}" — need ANTHROPIC_API_KEY or OPENAI_API_KEY`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified model call (non-streaming)
// ─────────────────────────────────────────────────────────────────────────────

export async function callModel(role: AgentRole, input: ModelCallInput): Promise<ModelCallResult> {
  const route = routeModel(role)
  const modelsToTry = [route.primary, ...route.fallbacks]

  for (let i = 0; i < modelsToTry.length; i++) {
    const modelConfig = modelsToTry[i]
    if (!hasProviderKey(modelConfig.provider)) continue

    const startTime = Date.now()
    try {
      const content = await callProvider(modelConfig, input)
      return {
        content,
        provider: modelConfig.provider,
        model: modelConfig.model,
        durationMs: Date.now() - startTime,
        fromFallback: i > 0,
      }
    } catch (err) {
      console.error(`Model call failed for ${modelConfig.provider}/${modelConfig.model}: ${err}`)
      if (i === modelsToTry.length - 1) throw err
      // try next fallback
    }
  }

  throw new Error(`All model providers failed for role "${role}"`)
}

/**
 * Call a streaming model and collect chunks via callback.
 */
export async function callModelStreaming(
  role: AgentRole,
  input: ModelCallInput,
  onChunk: (text: string) => void,
): Promise<ModelCallResult> {
  const route = routeModel(role)
  const modelsToTry = [route.primary, ...route.fallbacks]

  for (let i = 0; i < modelsToTry.length; i++) {
    const modelConfig = modelsToTry[i]
    if (!hasProviderKey(modelConfig.provider)) continue

    const startTime = Date.now()
    try {
      const content = await callProviderStreaming(modelConfig, input, onChunk)
      return {
        content,
        provider: modelConfig.provider,
        model: modelConfig.model,
        durationMs: Date.now() - startTime,
        fromFallback: i > 0,
      }
    } catch (err) {
      console.error(`Streaming call failed for ${modelConfig.provider}/${modelConfig.model}: ${err}`)
      if (i === modelsToTry.length - 1) throw err
    }
  }

  throw new Error(`All streaming model providers failed for role "${role}"`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider implementations (non-streaming)
// ─────────────────────────────────────────────────────────────────────────────

async function callProvider(config: ModelConfig, input: ModelCallInput): Promise<string> {
  switch (config.provider) {
    case 'anthropic':
      return callAnthropic(config, input)
    case 'openai':
      return callOpenAI(config, input)
    default:
      throw new Error(`Provider "${config.provider}" not implemented`)
  }
}

async function callAnthropic(config: ModelConfig, input: ModelCallInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY!
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: input.maxTokens || config.maxTokens,
      system: input.systemPrompt,
      messages: [{ role: 'user', content: input.userPrompt }],
      ...(config.supportsThinking && config.thinkingBudget
        ? { thinking: { type: 'enabled', budget_tokens: config.thinkingBudget } }
        : {}),
    }),
  })

  if (!resp.ok) {
    const body = await resp.text().catch(() => 'unknown')
    throw new Error(`Anthropic error (${resp.status}): ${body.slice(0, 300)}`)
  }

  const data = (await resp.json()) as {
    content: Array<{ type: string; text?: string }>
    usage?: { input_tokens?: number; output_tokens?: number }
  }

  return data.content
    ?.filter((b) => b.type === 'text')
    .map((b) => b.text || '')
    .join('')
}

async function callOpenAI(config: ModelConfig, input: ModelCallInput): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY!
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: input.maxTokens || config.maxTokens,
      temperature: input.temperature ?? config.temperature ?? 0.3,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userPrompt },
      ],
      ...(input.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  })

  if (!resp.ok) {
    const body = await resp.text().catch(() => 'unknown')
    throw new Error(`OpenAI error (${resp.status}): ${body.slice(0, 300)}`)
  }

  const data = (await resp.json()) as {
    choices: Array<{ message: { content: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }

  return data.choices?.[0]?.message?.content || ''
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider implementations (streaming)
// ─────────────────────────────────────────────────────────────────────────────

async function callProviderStreaming(
  config: ModelConfig,
  input: ModelCallInput,
  onChunk: (text: string) => void,
): Promise<string> {
  switch (config.provider) {
    case 'anthropic':
      return callAnthropicStreaming(config, input, onChunk)
    case 'openai':
      return callOpenAIStreaming(config, input, onChunk)
    default:
      throw new Error(`Streaming not implemented for "${config.provider}"`)
  }
}

async function callAnthropicStreaming(
  config: ModelConfig,
  input: ModelCallInput,
  onChunk: (text: string) => void,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY!
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: input.maxTokens || config.maxTokens,
      system: input.systemPrompt,
      messages: [{ role: 'user', content: input.userPrompt }],
      stream: true,
      ...(config.supportsThinking && config.thinkingBudget
        ? { thinking: { type: 'enabled', budget_tokens: config.thinkingBudget } }
        : {}),
    }),
  })

  if (!resp.ok || !resp.body) {
    const body = await resp.text().catch(() => 'unknown')
    throw new Error(`Anthropic streaming error (${resp.status}): ${body.slice(0, 300)}`)
  }

  return parseAnthropicSSE(resp.body, onChunk)
}

async function callOpenAIStreaming(
  config: ModelConfig,
  input: ModelCallInput,
  onChunk: (text: string) => void,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY!
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: input.maxTokens || config.maxTokens,
      temperature: input.temperature ?? config.temperature ?? 0.3,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.userPrompt },
      ],
      stream: true,
    }),
  })

  if (!resp.ok || !resp.body) {
    const body = await resp.text().catch(() => 'unknown')
    throw new Error(`OpenAI streaming error (${resp.status}): ${body.slice(0, 300)}`)
  }

  return parseOpenAISSE(resp.body, onChunk)
}

// ─────────────────────────────────────────────────────────────────────────────
// SSE parsers
// ─────────────────────────────────────────────────────────────────────────────

async function parseAnthropicSSE(
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
          delta?: { type?: string; text?: string; thinking?: string }
        }
        if (json.type === 'content_block_delta' && json.delta?.type === 'thinking_delta') {
          continue // skip thinking
        }
        if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
          const text = json.delta.text || ''
          if (text) {
            fullContent += text
            onChunk(text)
          }
        }
      } catch { /* skip malformed */ }
    }
  }

  return fullContent
}

async function parseOpenAISSE(
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
      } catch { /* skip malformed */ }
    }
  }

  return fullContent
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON extraction helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract JSON from model output that may contain preamble text.
 * Claude often outputs reasoning before JSON — this handles that safely.
 */
export function extractJsonFromResponse<T>(raw: string): T {
  let clean = raw.trim()
  clean = clean.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '').trim()

  const firstBrace = clean.indexOf('{')
  const lastBrace = clean.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    clean = clean.slice(firstBrace, lastBrace + 1)
  }

  return JSON.parse(clean) as T
}
