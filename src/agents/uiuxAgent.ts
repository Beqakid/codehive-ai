/**
 * @module uiuxAgent
 * @description UI/UX Design Agent — Claude Sonnet 4.6
 * Produces a comprehensive UI/UX design brief from the product spec and architecture.
 * Covers component hierarchy, color palette, typography, responsive strategy, and interactions.
 */

import { parseAnthropicStream } from '../lib/stream-parsers'

interface UIUXAgentInput {
  title: string
  description: string
  productSpec: string
  architectureDesign: string
}

export async function runUIUXAgent(
  input: UIUXAgentInput,
  onChunk: (text: string) => void,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      stream: true,
      system: `You are an expert UI/UX designer and front-end architect with 15 years of experience building production web apps. You produce detailed, actionable design briefs that developers can implement directly. Always specify exact values — hex colors, pixel sizes, font families, spacing units. Focus on practical, specific decisions — not vague guidelines.`,
      messages: [
        {
          role: 'user',
          content: `Design a comprehensive UI/UX system for: **${input.title}**

## Product Description
${input.description}

## Product Specification
${input.productSpec.slice(0, 2500)}

## Technical Architecture
${input.architectureDesign.slice(0, 2500)}

---

Produce a detailed UI/UX Design Brief with these sections:

### 1. Design System Foundations
- **Color Palette**: Primary, secondary, accent, neutral, semantic colors (exact hex values for light + dark mode)
- **Typography**: Font family choices, type scale (xs through 4xl), font weights used
- **Spacing System**: Base unit (4px or 8px) and named scale
- **Border Radius**: Named scale (none/sm/md/lg/full)
- **Shadows/Elevation**: 3-5 elevation levels with CSS values
- **Component Library**: Recommended library (shadcn/ui, Radix UI, MUI, Ant Design, Tailwind, custom) with justification based on the tech stack

### 2. Layout Architecture
- Overall app shell pattern (sidebar + content, top nav + content, full-width, etc.)
- Responsive strategy: mobile-first or desktop-first
- Breakpoints with exact pixel values
- Key shared layout components (AppShell, Sidebar, Header, PageContainer, etc.)

### 3. Core Screens & Components
For each major screen/feature in this app, describe:
- Screen name and purpose
- Layout structure
- Primary components needed
- Data display pattern (data table, card grid, list, etc.)
- Empty state, loading state, error state UI

### 4. Component Inventory (Prioritized)
**P1 - MVP Critical:**
[list components]

**P2 - Important:**
[list components]

**P3 - Nice to Have:**
[list components]

### 5. Interaction & Motion Design
- Navigation patterns (active states, breadcrumbs, transitions)
- Loading states (skeleton screens vs spinners — which to use where)
- Form validation UX (inline errors, submit button states)
- Success/error feedback (toast notifications, inline messages)
- Modal/drawer usage patterns

### 6. Accessibility Requirements
- Target WCAG level (AA or AAA)
- Minimum contrast ratios
- Focus ring style
- Keyboard navigation flow for key interactions

### 7. Codegen Instructions
Specific technical directives for the code generation agent:
- Component file structure and naming conventions
- CSS approach (which framework/method to use)
- When to use local state vs shared state
- How to handle theming/dark mode`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`UI/UX Agent API error ${response.status}: ${errText.slice(0, 300)}`)
  }

  return parseAnthropicStream(response, onChunk)
}
