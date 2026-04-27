/**
 * Prompt Coach Agent — Phase 0
 *
 * Analyzes user prompts before the pipeline starts. If the prompt is detailed
 * enough (score >= 0.7), auto-expands it with reasonable assumptions. If vague,
 * asks 2-4 targeted clarifying questions.
 *
 * Uses GPT-4.1 with JSON mode for fast, structured analysis.
 */

import { withRetry } from '../lib/retry'

export interface CoachQuestion {
  id: string
  question: string
  hint: string
}

export interface CoachAnalysis {
  mode: 'auto' | 'interactive'
  completenessScore: number
  detectedIntent: string
  enrichedPrompt?: string
  questions?: CoachQuestion[]
  assumptions?: string[]
}

export interface CoachRefinement {
  enrichedPrompt: string
  assumptions: string[]
}

/* ------------------------------------------------------------------ */
/*  System prompts                                                     */
/* ------------------------------------------------------------------ */

const ANALYSIS_SYSTEM = `You are a Prompt Coach for CodeHive, an AI coding platform. Your job is to analyze user prompts and determine if they have enough detail for our AI agents to produce high-quality software.

Our downstream agents need:
• Product Agent — clear features, user stories, acceptance criteria
• Architect Agent — tech stack preferences, scaling requirements, data models, deployment target
• Reviewer Agent — security/auth requirements, compliance needs, quality standards
• Codegen Agent — file structure hints, API endpoints, data schemas

A COMPLETE prompt covers most of:
1. What the app/feature does (core purpose)
2. Who uses it (user types / roles)
3. Key features (at least 3-5 specific features)
4. Tech stack preferences (or "any")
5. Auth / security requirements
6. Data entities and relationships
7. Scale / performance expectations
8. Integration or deployment needs

Scoring:
• 0.7+ → "auto" mode: expand the prompt yourself with reasonable assumptions
• Below 0.7 → "interactive" mode: ask 2-4 targeted questions about the BIGGEST gaps only

Return ONLY valid JSON:
{
  "mode": "auto" | "interactive",
  "completenessScore": 0.0-1.0,
  "detectedIntent": "one-line summary of what the user wants",
  "enrichedPrompt": "full structured prompt in markdown (auto mode only)",
  "questions": [{"id":"q1","question":"...","hint":"example answer or guidance"}] (interactive mode only, 2-4 items),
  "assumptions": ["assumption 1", ...] (auto mode only)
}`

const ENRICHMENT_SYSTEM = `You are a Prompt Coach for CodeHive AI coding platform. Given a user's original prompt and their answers to clarifying questions, produce a comprehensive structured prompt.

Format the enriched prompt as markdown:

## Project Overview
What's being built and why.

## Target Users
User types, roles, and personas.

## Core Features
Numbered list of specific features with brief descriptions.

## Technical Requirements
Tech stack, deployment, performance, scale.

## Data Model
Key entities, fields, and relationships.

## Authentication & Security
Auth approach, roles, permissions, security requirements.

## API Endpoints
Key REST or GraphQL endpoints.

## Additional Context
Anything else relevant.

Return ONLY valid JSON:
{
  "enrichedPrompt": "the full structured prompt in markdown",
  "assumptions": ["things you assumed that the user did not explicitly state"]
}`

/* ------------------------------------------------------------------ */
/*  Public functions                                                    */
/* ------------------------------------------------------------------ */

/** Analyze a raw user prompt — returns auto-enriched or questions. */
export async function analyzePrompt(prompt: string): Promise<CoachAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')

  const response = await withRetry(async () => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1',
        messages: [
          { role: 'system', content: ANALYSIS_SYSTEM },
          { role: 'user', content: `Analyze this prompt and decide if it needs clarification or can be auto-expanded:\n\n"${prompt}"` },
        ],
        max_tokens: 3000,
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`)
    return res
  })

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>
  }
  const content = data.choices[0]?.message?.content || '{}'

  try {
    const parsed = JSON.parse(content) as CoachAnalysis
    // Ensure valid mode
    if (parsed.mode !== 'auto' && parsed.mode !== 'interactive') {
      parsed.mode = (parsed.completenessScore ?? 0) >= 0.7 ? 'auto' : 'interactive'
    }
    return parsed
  } catch {
    // Fallback — treat as auto with original prompt
    return {
      mode: 'auto',
      completenessScore: 0.5,
      detectedIntent: prompt.substring(0, 100),
      enrichedPrompt: prompt,
      assumptions: [],
    }
  }
}

/** Given original prompt + user answers, produce enriched prompt. */
export async function enrichWithAnswers(
  originalPrompt: string,
  questions: CoachQuestion[],
  answers: Record<string, string>,
): Promise<CoachRefinement> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')

  const qaBlock = questions
    .map((q) => `Q: ${q.question}\nA: ${answers[q.id] || '(not answered)'}`)
    .join('\n\n')

  const response = await withRetry(async () => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1',
        messages: [
          { role: 'system', content: ENRICHMENT_SYSTEM },
          {
            role: 'user',
            content: `Original prompt:\n"${originalPrompt}"\n\nUser's answers to clarifying questions:\n${qaBlock}`,
          },
        ],
        max_tokens: 3000,
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`)
    return res
  })

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>
  }
  const content = data.choices[0]?.message?.content || '{}'

  try {
    return JSON.parse(content) as CoachRefinement
  } catch {
    return { enrichedPrompt: originalPrompt, assumptions: [] }
  }
}
