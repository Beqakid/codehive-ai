/**
 * @module plannerAgent
 * @description Milestone 1 read-only planning agent.
 * Analyzes a repository and generates a structured implementation plan.
 * NO code generation. NO file writes to target repo in this agent.
 * Uses claude-sonnet-4-6 via raw fetch (no @anthropic-ai/sdk).
 */

import type { RepoMetadata, RepoFile } from '../lib/repoService'

export interface PlannerInput {
  userRequest: string
  repoOwner: string
  repoName: string
  repoMetadata: RepoMetadata
  fileTree: string
  keyFiles: RepoFile[]
  onLog: (message: string, level?: 'info' | 'warn' | 'error' | 'success') => void
}

export interface PlannerOutput {
  title: string
  markdown: string
  affectedFiles: string[]
  riskLevel: 'low' | 'medium' | 'high'
  estimatedHours: number
}

interface AIPlanResponse {
  title: string
  summary: string
  repoUnderstanding: string
  affectedFiles: string[]
  implementationSteps: Array<{
    step: number
    title: string
    description: string
    files?: string[]
  }>
  risks: Array<{
    level: 'high' | 'medium' | 'low'
    description: string
    mitigation: string
  }>
  testingChecklist: string[]
  rollbackNotes: string
  riskLevel: 'low' | 'medium' | 'high'
  milestoneConfirmation: string
  estimatedComplexity: 'simple' | 'moderate' | 'complex'
  estimatedHours: number
}

export async function runPlannerAgent(input: PlannerInput): Promise<PlannerOutput> {
  const { userRequest, repoOwner, repoName, repoMetadata, fileTree, keyFiles, onLog } = input

  onLog('🧠 Initializing planning agent...', 'info')

  const keyFilesContext =
    keyFiles.length > 0
      ? keyFiles
          .map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 2500)}\n\`\`\``)
          .join('\n\n')
      : '_No key files could be read_'

  const systemPrompt = `You are CodeHive's senior planning agent. You analyze GitHub repositories and produce thorough, actionable implementation plans.

CRITICAL RULES:
1. This is MILESTONE 1 — NO code generation, NO code changes. Planning ONLY.
2. You must explicitly confirm "No code changes are made in this milestone" in milestoneConfirmation.
3. Be specific about which files will need modification in a FUTURE milestone.
4. Be honest about risks and unknowns. Do not invent solutions you are not sure about.
5. Respond with ONLY a valid JSON object. No markdown fences, no preamble, no explanation outside the JSON.`

  const userPrompt = `REPOSITORY: ${repoOwner}/${repoName}
DESCRIPTION: ${repoMetadata.description}
DEFAULT BRANCH: ${repoMetadata.defaultBranch}
LANGUAGE: ${repoMetadata.language || 'Unknown'}
VISIBILITY: ${repoMetadata.isPrivate ? 'Private' : 'Public'}

FILE TREE (up to 150 files):
${fileTree}

KEY FILES:
${keyFilesContext}

USER REQUEST:
"${userRequest}"

Produce a comprehensive implementation plan in this exact JSON format:
{
  "title": "Short specific title (max 80 chars)",
  "summary": "2-3 sentence summary of what the user wants and the expected outcome",
  "repoUnderstanding": "2-3 sentences: what this repo does, its tech stack, and relevant patterns",
  "affectedFiles": ["list", "of", "likely", "file", "paths", "to", "modify"],
  "implementationSteps": [
    {
      "step": 1,
      "title": "Step title",
      "description": "Detailed description of what needs to happen",
      "files": ["specific/file.ts"]
    }
  ],
  "risks": [
    {
      "level": "high",
      "description": "Description of the risk",
      "mitigation": "How to reduce or handle this risk"
    }
  ],
  "testingChecklist": [
    "Specific test item 1",
    "Specific test item 2"
  ],
  "rollbackNotes": "How to safely roll back if something goes wrong",
  "riskLevel": "low",
  "milestoneConfirmation": "No code changes are made in this milestone. This is a planning document only.",
  "estimatedComplexity": "moderate",
  "estimatedHours": 8
}`

  onLog('📡 Calling AI planning model (claude-sonnet-4-6)...', 'info')

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set')
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown')
    throw new Error(`Planner AI call failed (${response.status}): ${errText.slice(0, 300)}`)
  }

  const aiData = (await response.json()) as {
    content: Array<{ type: string; text: string }>
  }

  const rawText = aiData.content?.[0]?.text || ''
  onLog('✅ AI response received, parsing plan...', 'success')

  // Robust JSON extraction — Claude sometimes adds preamble
  const firstBrace = rawText.indexOf('{')
  const lastBrace = rawText.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error('Planner: AI response did not contain valid JSON')
  }
  const jsonStr = rawText.slice(firstBrace, lastBrace + 1)

  let parsed: AIPlanResponse
  try {
    parsed = JSON.parse(jsonStr) as AIPlanResponse
  } catch {
    throw new Error('Planner: Failed to parse AI JSON response')
  }

  onLog('📝 Rendering plan markdown...', 'info')
  const markdown = renderPlanMarkdown({ repoOwner, repoName, userRequest, parsed })

  return {
    title: parsed.title || userRequest.slice(0, 80),
    markdown,
    affectedFiles: parsed.affectedFiles || [],
    riskLevel: parsed.riskLevel || 'medium',
    estimatedHours: parsed.estimatedHours || 0,
  }
}

function renderPlanMarkdown(params: {
  repoOwner: string
  repoName: string
  userRequest: string
  parsed: AIPlanResponse
}): string {
  const { repoOwner, repoName, userRequest, parsed } = params
  const now = new Date().toISOString()

  const steps = (parsed.implementationSteps || [])
    .map(
      (s) =>
        `### Step ${s.step}: ${s.title}\n\n${s.description}${
          s.files?.length ? `\n\n**Files affected:** ${s.files.map((f) => `\`${f}\``).join(', ')}` : ''
        }`,
    )
    .join('\n\n---\n\n')

  const risks = (parsed.risks || [])
    .map(
      (r) =>
        `| ${r.level.toUpperCase()} | ${r.description} | ${r.mitigation} |`,
    )
    .join('\n')

  const tests = (parsed.testingChecklist || []).map((t) => `- [ ] ${t}`).join('\n')
  const affected = (parsed.affectedFiles || []).map((f) => `- \`${f}\``).join('\n')

  const riskEmoji =
    parsed.riskLevel === 'high' ? '🔴' : parsed.riskLevel === 'medium' ? '🟡' : '🟢'
  const complexityEmoji =
    parsed.estimatedComplexity === 'complex'
      ? '🔴'
      : parsed.estimatedComplexity === 'moderate'
        ? '🟡'
        : '🟢'

  return `# CodeHive Plan: ${parsed.title}

> **Generated by CodeHive AI** · ${now}
> **Repository:** \`${repoOwner}/${repoName}\`

---

## 📋 User Request

> ${userRequest}

---

## 🔍 Repository Understanding

${parsed.repoUnderstanding}

---

## 📝 Request Summary

${parsed.summary}

---

## 📁 Files Likely Affected

${affected || '_No specific files identified yet_'}

---

## 🛠️ Implementation Steps

${steps || '_No steps generated_'}

---

## ⚠️ Risks

| Severity | Risk | Mitigation |
|----------|------|------------|
${risks || '| LOW | No significant risks identified | — |'}

---

## ✅ Testing Checklist

${tests || '_No testing items generated_'}

---

## 🔄 Rollback Notes

${parsed.rollbackNotes || '_No rollback notes provided_'}

---

## 📊 Complexity Assessment

| Metric | Value |
|--------|-------|
| Risk Level | ${riskEmoji} ${parsed.riskLevel || 'Unknown'} |
| Complexity | ${complexityEmoji} ${parsed.estimatedComplexity || 'Unknown'} |
| Estimated Effort | ~${parsed.estimatedHours || '?'} hours |

---

## ✋ Milestone 1 Confirmation

> ⚠️ **${parsed.milestoneConfirmation || 'No code changes are made in this milestone. This is a planning document only.'}**

---

*This plan was generated automatically by CodeHive AI. No source code was modified. Review carefully before approving implementation in a future milestone.*
`
}
