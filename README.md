# 🐝 CodeHive AI — Coding Command Center

An AI-powered coding platform that transforms natural language prompts into production-ready code. Built on **Payload CMS**, deployed on **Cloudflare Workers** with **D1** (SQLite) and **R2** (media storage).

> _Type a prompt → AI agents plan, code, and test it end-to-end._

![Platform](https://img.shields.io/badge/Platform-Cloudflare%20Workers-orange)
![Framework](https://img.shields.io/badge/Framework-Next.js%2015-black)
![CMS](https://img.shields.io/badge/CMS-Payload%203-blue)
![AI](https://img.shields.io/badge/AI-GPT--4.1%20%7C%20Claude%20Sonnet%204-green)

---

## ✨ Features

- **🤖 Multi-Agent AI Pipeline** — 5 specialized AI agents collaborate to plan, review, generate code, and run tests
- **📡 Real-Time SSE Streaming** — Watch agents think and code in real time via Server-Sent Events
- **⚡ Code Generation** — AI generates complete file trees from architectural plans
- **🧪 Sandbox Testing** — GitHub Actions integration for automated test execution
- **📊 Parallel Runs Dashboard** — Send the same prompt to multiple projects simultaneously
- **🔐 User Auth** — Cookie-based authentication with signup/login/logout
- **🌙 Dark Theme** — Glassmorphism UI with animated honeycomb background

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │ Next.js  │  │ Payload  │  │   API    │               │
│  │   SSR    │  │   CMS    │  │  Routes  │               │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘               │
│       │              │             │                      │
│       │         ┌────┴─────┐  ┌────┴──────┐              │
│       │         │  D1 DB   │  │ R2 Bucket │              │
│       │         │ (SQLite) │  │  (Media)  │              │
│       │         └──────────┘  └───────────┘              │
│       │                                                   │
│  ┌────┴──────────────────────────────────┐               │
│  │          AI Agent Pipeline            │               │
│  │                                       │               │
│  │  📋 Product → 🏗️ Architect → 🔎 Review │               │
│  │       │            │            │      │               │
│  │       └────────────┴────────────┘      │               │
│  │                    │                   │               │
│  │              🎯 Verdict (o4-mini)      │               │
│  │                    │                   │               │
│  │         💻 Code Generation (GPT-4.1)   │               │
│  │                    │                   │               │
│  │         🧪 Sandbox (GitHub Actions)    │               │
│  └────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────┘
                         │
                    ┌────┴─────┐
                    │  GitHub  │
                    │  (PRs)   │
                    └──────────┘
```

---

## 🤖 AI Agent Roster

| Agent | Model | Role |
|-------|-------|------|
| 📋 **Product Agent** | `gpt-4.1` | Transforms prompts into structured product specifications |
| 🏗️ **Architect Agent** | `claude-sonnet-4-6` | Creates detailed technical plans with extended thinking (8K budget) |
| 🔎 **Reviewer Agent** | `claude-sonnet-4-6` | Reviews and scores plans on a 1-10 scale |
| 🎯 **Verdict** | `o4-mini` | Reasoning model that makes approve/revise decisions |
| 💻 **Codegen Agent** | `gpt-4.1` | Generates production code file-by-file from plans |
| 📄 **Plan Parser** | `gpt-4.1-mini` | Extracts structured data from agent outputs |
| 🧪 **Sandbox Agent** | — | Triggers and monitors GitHub Actions test workflows |

---

## 📁 Project Structure

```
src/
├── access/                    # Row-level access control
│   └── roles.ts               # ownerOrAdmin, anyLoggedIn helpers
├── agents/                    # AI agent implementations
│   ├── orchestrator.ts        # Main pipeline orchestrator (SSE events)
│   ├── productAgent.ts        # Product specification agent
│   ├── architectAgent.ts      # Architecture planning agent
│   ├── reviewerAgent.ts       # Code review agent
│   ├── codegenAgent.ts        # Code generation agent
│   ├── codeOrchestrator.ts    # Code generation pipeline
│   └── sandboxAgent.ts        # GitHub Actions sandbox runner
├── app/(frontend)/            # Next.js frontend
│   ├── page.tsx               # Landing page
│   ├── layout.tsx             # Auth-aware layout with nav
│   ├── styles.css             # Global dark theme styles
│   ├── login/page.tsx         # Login page
│   ├── signup/page.tsx        # Signup page
│   ├── dashboard/page.tsx     # Command Center dashboard
│   ├── projects/              # Projects CRUD
│   │   ├── page.tsx           # Projects list
│   │   ├── new/page.tsx       # Create project
│   │   └── [id]/page.tsx      # Project detail + plans
│   └── api/                   # API routes
│       ├── command/route.ts   # ⭐ Main SSE endpoint
│       ├── auth/              # Login, logout, signup
│       ├── projects/          # Project CRUD
│       ├── plans/             # Plan approval
│       ├── generate-code/     # Code generation trigger
│       └── sandbox/           # Sandbox test trigger
├── collections/               # Payload CMS collections
│   ├── Users.ts               # Auth-enabled users
│   ├── Projects.ts            # User projects
│   ├── CodingRequests.ts      # Prompt submissions
│   ├── AgentPlans.ts          # Generated plans
│   ├── AgentRuns.ts           # Agent execution logs
│   ├── Commands.ts            # Command tracking
│   ├── Runs.ts                # Pipeline run tracking
│   ├── ToolConnections.ts     # External tool configs
│   └── Media.ts               # R2-backed uploads
├── components/                # React components
│   ├── CommandInterface.tsx   # Global command input + SSE
│   ├── ParallelDashboard.tsx  # Multi-project parallel runs
│   ├── CodeGenRunner.tsx      # Code generation UI
│   ├── SandboxRunner.tsx      # Sandbox test runner UI
│   ├── ProjectCard.tsx        # Project card (client component)
│   ├── HiveBackground.tsx     # Animated honeycomb SVG
│   └── LogoutButton.tsx       # Auth logout button
├── lib/                       # Shared utilities
│   ├── github.ts              # GitHub API helpers
│   ├── retry.ts               # Retry with exponential backoff
│   └── stream-parsers.ts      # SSE stream parsing utilities
├── migrations/                # D1 database migrations
└── payload.config.ts          # Payload CMS configuration
```

---

## 🚀 How It Works

### 1. Submit a Prompt
Type a natural language coding request in the **Command Interface**:
> _"Add user authentication with JWT tokens, refresh token rotation, and rate limiting"_

### 2. AI Agents Plan
Three agents collaborate in parallel:
- **Product Agent** creates a detailed spec
- **Architect Agent** designs the file structure and implementation plan
- **Reviewer Agent** scores quality and flags issues

The **Verdict** model (o4-mini) decides: approve or revise.

### 3. Plan Review
A PR is created on GitHub with the full plan. You can review agent outputs on the project detail page and **approve** when ready.

### 4. Code Generation
Click **⚡ Generate Code** — the Codegen Agent (GPT-4.1) generates every file in the plan and pushes them to the PR branch.

### 5. Sandbox Testing
Click **🧪 Run Sandbox** — triggers a GitHub Actions workflow that installs dependencies and runs tests on the generated code.

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Cloudflare Workers |
| **Framework** | Next.js 15 (App Router) |
| **CMS** | Payload CMS 3 |
| **Database** | Cloudflare D1 (SQLite) |
| **Storage** | Cloudflare R2 |
| **AI Models** | OpenAI GPT-4.1, Claude Sonnet 4, o4-mini |
| **CI/CD** | GitHub Actions |
| **Language** | TypeScript |

---

## 🔑 Environment Variables

Set these as Cloudflare Worker secrets:

| Variable | Description |
|----------|-------------|
| `PAYLOAD_SECRET` | Payload CMS encryption key |
| `OPENAI_API_KEY` | OpenAI API key (GPT-4.1, o4-mini) |
| `ANTHROPIC_API_KEY` | Anthropic API key (Claude Sonnet 4) |
| `GITHUB_TOKEN` | GitHub PAT with `repo` scope |

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/command` | Main SSE endpoint — runs full agent pipeline |
| `POST` | `/api/auth/login` | User login (cookie-based) |
| `POST` | `/api/auth/signup` | User registration |
| `POST` | `/api/auth/logout` | User logout |
| `GET/POST` | `/api/projects` | List / create projects |
| `POST` | `/api/plans/[planId]/approve` | Approve a plan for code generation |
| `POST` | `/api/generate-code` | Trigger code generation on approved plan |
| `POST` | `/api/sandbox` | Trigger sandbox test run |

### SSE Event Protocol

The `/api/command` endpoint streams events:

```
data: {"type":"created","commandId":1}
data: {"type":"agent_start","agent":"product"}
data: {"type":"chunk","agent":"product","text":"..."}
data: {"type":"agent_done","agent":"product"}
...
data: {"type":"done","planId":1,"prUrl":"https://github.com/..."}
```

---

## 🛠️ Development

### Prerequisites
- Node.js 20+
- Cloudflare account (paid Workers plan)
- GitHub account
- OpenAI API key
- Anthropic API key

### Local Setup

```bash
# Install dependencies
pnpm install

# Authenticate with Cloudflare
pnpm wrangler login

# Start local dev server (auto-binds D1 + R2)
pnpm dev
```

### Deployment

```bash
# Create migrations
pnpm payload migrate:create

# Deploy to Cloudflare Workers
pnpm run deploy
```

Or push to `main` — GitHub Actions auto-deploys via CI/CD.

---

## 📋 Build Modes

| Mode | Description |
|------|-------------|
| **📋 Plan Only** | Run all 3 AI agents → generate plan + open PR |
| **⚡ Plan + Code** | Plan + generate all implementation files |
| **🚀 Full Build** | Plan + code + run sandbox tests automatically |

---

## 🎨 Design

- **Dark theme** with deep navy (`#070d1a`) background
- **Glassmorphism** cards with backdrop blur
- **Amber accent** color (`#f59e0b`) for CTAs and focus states
- **Animated honeycomb** SVG background (520 cells)
- **Monospace code blocks** for agent outputs

---

## 📄 License

MIT
