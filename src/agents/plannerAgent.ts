/**
 * @module plannerAgent
 * @description Milestone 1 + 2 read-only planning agent.
 * M1: Analyzes a repository and generates a structured implementation plan.
 * M2: Enriched with repo intelligence, dependency graph, risk report, and protected file warnings.
 * NO code generation. NO file writes to target repo in this agent.
 * Uses claude-sonnet-4-6 via raw fetch (no @anthropic-ai/sdk).
 */

import type { RepoMetadata, RepoFile } from '../lib/repoService'
import type { RepoIntelligenceResult } from '../lib/repoIntelligence'
import type { RiskReport } from '../lib/riskEngine'
import type { ProtectedFile } from '../lib/protectedFiles'
import { formatRiskSummary, getRiskEmoji } from '../lib/riskEngine'
import { getProtectionBadge } from '../lib/protectedFiles'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PlannerInput {
  userRequest: string
  repoOwner: string
  repoName: string
  repoMetadata: RepoMetadata
  fileTree: string
  keyFiles: RepoFile[]
  onLog: (message: string, level?: 'info' | 'warn' | 'error' | 'success') => void
  // M2 enrichment (optional — planner degrades gracefully without them)
  repoIntelligence?: RepoIntelligenceResult
  riskReport?: RiskReport
  protectedFiles?: ProtectedFile[]
}

export interface PlannerOutput {
  title: string
  markdown: string
  affectedFiles: string[]
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  estimatedHours: number
  // M2 additions
  notRecommendedFiles?: string[]
  recommendedTestingAreas?: string[]
  safeBoundaries?: string[]
}

interface AIPlanResponse {
  title: string
  summary: string
  repoUnderstanding: string
  affectedFiles: string[]
  notRecommendedFiles: string[]
  implementationSteps: Array<{
    step: number
    title: string
    description: string
    files?: string[]
    order?: number
  }>
  risks: Array<{
    level: 'high' | 'medium' | 'low' | 'critical'
    description: string
    mitigation: string
  }>
  testingChecklist: string[]
  recommendedTestingAreas: string[]
  rollbackNotes: string
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  milestoneConfirmation: string
  estimatedComplexity: 'simple' | 'moderate' | 'complex'
  estimatedHours: number
  dependencyImpact: string
  protectedFileWarnings: string[]
  safeBoundaries: string[]
  alternativeApproaches: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Context builders
// ─────────────────────────────────────────────────────────────────────────────

function buildM2IntelligenceContext(
  intelligence?: RepoIntelligenceResult,
  riskReport?: RiskReport,
  protectedFiles?: ProtectedFile[],
): string {
  if (!intelligence && !riskReport && !protectedFiles) return ''

  const sections: string[] = ['\n## MILESTONE 2 INTELLIGENCE CONTEXT\n']

  if (intelligence) {
    sections.push(`### Repository Architecture
${intelligence.architectureSummary}

**Tech Stack:** ${intelligence.techStack.join(', ') || 'Unknown'}
**Auth System:** ${intelligence.authSystem || 'Not detected'}
**Routes detected:** ${intelligence.routeStructure.slice(0, 15).join(', ') || 'None detected'}
**Env vars in use:** ${intelligence.envVarsDetected.slice(0, 20).join(', ') || 'None detected'}
**Protected areas:** ${intelligence.protectedAreas.join(', ') || 'None detected'}
`)
  }

  if (riskReport) {
    const emoji = getRiskEmoji(riskReport.riskLevel)
    sections.push(`### Risk Assessment
**Overall Risk:** ${emoji} ${riskReport.riskLevel} (score: ${riskReport.riskScore}/100)
**Confidence:** ${riskReport.confidenceScore}%
**Implementation Scope:** ${riskReport.implementationScope}
**Rollback Complexity:** ${riskReport.rollbackComplexity}

**Triggered Risk Factors:**
${riskReport.factors.filter((f) => f.triggered).map((f) => `- ${f.name}: ${f.description}`).join('\n') || '- None triggered'}

**Recommendations:**
${riskReport.recommendations.map((r) => `- ${r}`).join('\n') || '- No specific recommendations'}
`)
  }

  if (protectedFiles && protectedFiles.length > 0) {
    sections.push(`### Protected Files In Scope
⚠️ The following files are classified as PROTECTED. The AI plan MUST warn about them and recommend safer alternatives where possible:
${protectedFiles.map((f) => `- \`${f.path}\` — ${getProtectionBadge(f.protectionType)} (${f.riskLevel}): ${f.reason}`).join('\n')}
`)
  }

  return sections.join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// Main planner
// ─────────────────────────────────────────────────────────────────────────────

export async function runPlannerAgent(input: PlannerInput): Promise<PlannerOutput> {
  const {
    userRequest,
    repoOwner,
    repoName,
    repoMetadata,
    fileTree,
    keyFiles,
    onLog,
    repoIntelligence,
    riskReport,
    protectedFiles,
  } = input

  onLog('🧠 Initializing planning agent...', 'info')

  const keyFilesContext =
    keyFiles.length > 0
      ? keyFiles
          .map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 2500)}\n\`\`\``)
          .join('\n\n')
      : '_No key files could be read_'

  const m2Context = buildM2IntelligenceContext(repoIntelligence, riskReport, protectedFiles)
  const hasM2 = !!repoIntelligence || !!riskReport

  const systemPrompt = `You are CodeHive's senior planning agent. You analyze GitHub repositories and produce thorough, actionable implementation plans.

CRITICAL RULES:
1. This is Milestone 2 — NO code generation, NO code changes. Planning and analysis ONLY.
2. You must explicitly confirm "No code changes are made in this milestone" in milestoneConfirmation.
3. Be specific about which files will need modification in a FUTURE milestone.
4. Be honest about risks and unknowns. Do not invent solutions you are not sure about.
5. If protected files are in scope, you MUST warn about them explicitly.
6. Recommend safer alternative approaches that avoid protected files where possible.
7. Respond with ONLY a valid JSON object. No markdown fences, no preamble, no explanation outside the JSON.`

  const userPrompt = `REPOSITORY: ${repoOwner}/${repoName}
DESCRIPTION: ${repoMetadata.description}
DEFAULT BRANCH: ${repoMetadata.defaultBranch}
LANGUAGE: ${repoMetadata.language || 'Unknown'}
VISIBILITY: ${repoMetadata.isPrivate ? 'Private' : 'Public'}
${m2Context}
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
  "repoUnderstanding": "2-3 sentences: what this repo does, its tech stack, and relevant patterns${hasM2 ? ' — use the M2 intelligence context provided above' : ''}",
  "affectedFiles": ["list", "of", "likely", "file", "paths", "to", "modify"],
  "notRecommendedFiles": ["files", "that", "should", "NOT", "be", "modified", "in", "this", "plan"],
  "implementationSteps": [
    {
      "step": 1,
      "title": "Step title",
      "description": "Detailed description of what needs to happen",
      "files": ["specific/file.ts"],
      "order": 1
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
  "recommendedTestingAreas": ["area1", "area2"],
  "rollbackNotes": "How to safely roll back if something goes wrong",
  "riskLevel": "low",
  "milestoneConfirmation": "No code changes are made in this milestone. This is a planning document only.",
  "estimatedComplexity": "moderate",
  "estimatedHours": 8,
  "dependencyImpact": "Description of how this change affects other parts of the codebase",
  "protectedFileWarnings": ["Warning about protected file 1", "Warning about protected file 2"],
  "safeBoundaries": ["List of safe implementation boundaries — what to do and NOT do"],
  "alternativeApproaches": ["Alternative approach 1 that avoids protected files", "Alternative approach 2"]
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
      max_tokens: 6000,
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
  const markdown = renderPlanMarkdown({
    repoOwner,
    repoName,
    userRequest,
    parsed,
    riskReport,
    protectedFiles,
  })

  return {
    title: parsed.title || userRequest.slice(0, 80),
    markdown,
    affectedFiles: parsed.affectedFiles || [],
    riskLevel: (parsed.riskLevel as PlannerOutput['riskLevel']) || 'medium',
    estimatedHours: parsed.estimatedHours || 0,
    notRecommendedFiles: parsed.notRecommendedFiles || [],
    recommendedTestingAreas: parsed.recommendedTestingAreas || [],
    safeBoundaries: parsed.safeBoundaries || [],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown renderer
// ─────────────────────────────────────────────────────────────────────────────

function renderPlanMarkdown(params: {
  repoOwner: string
  repoName: string
  userRequest: string
  parsed: AIPlanResponse
  riskReport?: RiskReport
  protectedFiles?: ProtectedFile[]
}): string {
  const { repoOwner, repoName, userRequest, parsed, riskReport, protectedFiles } = params
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
    .map((r) => `| ${r.level.toUpperCase()} | ${r.description} | ${r.mitigation} |`)
    .join('\n')

  const tests = (parsed.testingChecklist || []).map((t) => `- [ ] ${t}`).join('\n')
  const affected = (parsed.affectedFiles || []).map((f) => `- \`${f}\``).join('\n')
  const notRecommended = (parsed.notRecommendedFiles || []).map((f) => `- \`${f}\``).join('\n')
  const boundaries = (parsed.safeBoundaries || []).map((b) => `- ${b}`).join('\n')
  const alternatives = (parsed.alternativeApproaches || []).map((a, i) => `${i + 1}. ${a}`).join('\n')
  const testAreas = (parsed.recommendedTestingAreas || []).map((a) => `- ${a}`).join('\n')

  const riskEmoji =
    parsed.riskLevel === 'critical' || parsed.riskLevel === 'high' ? '🔴' :
    parsed.riskLevel === 'medium' ? '🟡' : '🟢'
  const complexityEmoji =
    parsed.estimatedComplexity === 'complex' ? '🔴' :
    parsed.estimatedComplexity === 'moderate' ? '🟡' : '🟢'

  // M2 risk section
  let riskSection = ''
  if (riskReport) {
    const emoji = getRiskEmoji(riskReport.riskLevel)
    riskSection = `
---

## ${emoji} Risk Analysis (CodeHive Engine)

${formatRiskSummary(riskReport)}

### Risk Factors
${riskReport.factors.filter((f) => f.triggered).map((f) => `- **${f.name}**: ${f.description}`).join('\n') || '_No risk factors triggered_'}

### Recommendations
${riskReport.recommendations.map((r) => `- ${r}`).join('\n') || '_No specific recommendations_'}
`
  }

  // M2 protected files section
  let protectedSection = ''
  if (protectedFiles && protectedFiles.length > 0) {
    protectedSection = `
---

## 🛡️ Protected Files Warning

⚠️ The following files in this plan are **classified as protected** and require human approval before modification:

${protectedFiles.map((f) => `| \`${f.path}\` | ${getProtectionBadge(f.protectionType)} | ${f.riskLevel} | ${f.reason} |`).join('\n')}

${parsed.protectedFileWarnings?.length ? parsed.protectedFileWarnings.map((w) => `> ⚠️ ${w}`).join('\n') : ''}
`
  }

  // M2 dependency impact
  const dependencySection = parsed.dependencyImpact ? `
---

## 🔗 Dependency Impact

${parsed.dependencyImpact}
` : ''

  // M2 safe boundaries
  const boundarySection = boundaries ? `
---

## 🔒 Safe Implementation Boundaries

${boundaries}
` : ''

  // M2 alternative approaches
  const altSection = alternatives ? `
---

## 💡 Alternative Approaches

Consider these safer alternatives that may avoid protected files:

${alternatives}
` : ''

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

${notRecommended ? `### ❌ Files NOT Recommended for Modification\n\n${notRecommended}` : ''}

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

${testAreas ? `### Recommended Testing Areas\n\n${testAreas}` : ''}

---

## 🔄 Rollback Notes

${parsed.rollbackNotes || '_No rollback notes provided_'}

${riskSection}
${protectedSection}
${dependencySection}
${boundarySection}
${altSection}

---

## 📊 Complexity Assessment

| Metric | Value |
|--------|-------|
| Risk Level | ${riskEmoji} ${parsed.riskLevel || 'Unknown'} |
| Complexity | ${complexityEmoji} ${parsed.estimatedComplexity || 'Unknown'} |
| Estimated Effort | ~${parsed.estimatedHours || '?'} hours |

---

## ✋ Milestone 2 Confirmation

> ⚠️ **${parsed.milestoneConfirmation || 'No code changes are made in this milestone. This is a planning document only.'}**

---

*This plan was generated automatically by CodeHive AI. No source code was modified. Review carefully before approving implementation in a future milestone.*
`
}
