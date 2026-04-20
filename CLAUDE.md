# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TopGun (顶级思维) is a multi-agent concurrent reasoning desktop application built with Tauri 2. It helps users make better decisions by simulating multiple thinking frameworks analyzing the same topic in parallel, then synthesizing a consensus.

## Development Commands

```bash
# Start development (opens Tauri desktop window)
npm run tauri dev

# Run frontend only (Vite dev server, no Tauri)
npm run dev

# Run unit tests
npm test

# Run a single test file
npx vitest run src/components/workspace/__tests__/AgentCard.test.tsx

# Run E2E tests
npm run test:e2e

# Run E2E smoke tests only
npm run test:e2e:smoke

# Lint and format
npm run lint
npm run format
npm run format:check

# Validate Rust/TypeScript type contract alignment
npm run contract:check

# Build for production
npm run tauri build
```

## Architecture

### Backend (Rust) — src-tauri/src/

The backend is a multi-phase reasoning engine. Phases are numeric enums in Rust (`-1` to `4`) and lowercase strings in TypeScript:

**State Machine** (`state/mod.rs`): Central state with phases:

- **Input** (-1): User enters a topic; interactive Problem Brief dialogue clarifies scope
- **FrameworkSelection** (0): LLM recommends 3-5 frameworks based on the brief; user selects and locks them
- **Divergence** (1): All agents generate initial analysis in parallel
- **Examination** (2): Agents cross-examine each other's outputs
- **Patch** (3): Agents revise based on objections
- **Consensus** (4): Synthesize final output from all agent contributions

**Problem Brief Dialogue** (`commands/session/`): The Input/FrameworkSelection phases use a Gemini-style chat. The user converses with a "Problem Definer" agent, then explicitly clicks "生成专家级问题简报" to finalize. Only then can frameworks be selected. The dialogue history is stored in `problem_brief_messages`.

**Reasoning Pipeline** (`engine/mod.rs`, `engine/pipeline.rs`):

1. **Divergence**: All agents generate initial analysis in parallel
2. **Examination**: Agents cross-examine each other's outputs
3. **Patching**: Agents revise based on objections (repeats up to `max_iterations`, clamped `3..=6`)
4. **Consensus**: Synthesize final output from all agent contributions
5. If max iterations reached with unresolved objections, they become **tolerated risks** (`ToleratedRiskItem`)
6. **Context truncation** (`engine/analysis.rs`) prevents token overflow by trimming agent content

The engine guards against concurrent runs with an `AtomicBool` managed by Tauri.

**LLM Client** (`llm/mod.rs`): HTTP client supporting OpenAI-compatible APIs and Gemini native API, with retry logic and exponential backoff. Auto-detects Gemini vs OpenAI by URL.

**Frameworks** (`framework/mod.rs`): 14 built-in thinking frameworks (第一性原理, 反脆弱, 系统动力学, etc.) plus user-defined custom frameworks.

**IPC Commands** (`commands/`): Tauri command handlers organized by domain:

- `session.rs` — Session lifecycle: `start_session`, `continue_problem_brief_dialogue`, `generate_problem_brief_delivery`, `select_frameworks`, `run_reasoning`, `get_state`, `reset_session`
- `action_plan.rs` — Post-consensus action planning: `start_action_plan`, `answer_action_plan_question`, `generate_action_plan`, `get_action_plan_state`, `cancel_action_plan`
- `config_framework_history.rs` — Settings, frameworks, history

**Action Plan (落地方案)**: After consensus, a secondary flow asks the user targeted questions, then generates an actionable plan. State lives in `StateMachine` fields prefixed with `action_plan_*`.

### Frontend (React) — src/

**Tech Stack**: React 19 + TypeScript + Tailwind CSS 4 + Vite

**State Management** (`hooks/useWorkspaceState.ts`): Single hook managing all workspace state. Uses Tauri event listener (`state-update`) for real-time backend sync with **debouncing** (80ms via `setTimeout` + refs) to prevent render thrashing. An action guard (`withActionGuard`) prevents duplicate requests while operations are in flight.

**IPC Pattern**:

- Frontend calls `invoke("command_name", { args })` to trigger backend actions
- Backend emits `state-update` events with full `StateMachine` payload
- Frontend debounces updates (80ms) to prevent render thrashing

**Types** (`types/index.ts`): TypeScript interfaces mirroring Rust structs. Keep these in sync when modifying backend state.

**i18n** (`i18n/`): Supports `zh-CN` and `en-US`. Uses i18next with localStorage language persistence. Translation namespaces: `common`, `sidebar`, `workspace`, `settings`, `framework`, `history`, `agent`, `errors`.

**Component Structure**:

- `components/workspace/` — Main workspace UI (AgentCard, ConsensusOutput, etc.)
- `components/layout/` — Sidebar, settings modal
- `components/frameworks/` — Framework management view

### Key Data Flow

```
User Input → invoke("start_session") → Problem Brief dialogue
     ↓
invoke("generate_problem_brief_delivery") → reframed_issue + recommended_frameworks
     ↓
invoke("select_frameworks") → Creates AgentState per framework
     ↓
invoke("run_reasoning") → Engine runs pipeline phases (Divergence → Examination → Patch → Consensus)
     ↓
Each phase emits "state-update" events → Frontend re-renders
     ↓
Final consensus_output displayed
     ↓
Optional: invoke("start_action_plan") → questionnaire → generated action plan
```

## Testing

**Unit Tests**: Vitest with jsdom. Mock Tauri APIs in `src/test/__mocks__/`. When adding new IPC commands, add corresponding mocks in `src/test/__mocks__/@tauri-apps/api/core.ts`.

**E2E Tests**: Playwright. Smoke tests tagged with `@smoke`.

## Type Contract

`scripts/check-type-contract.cjs` enforces that `Phase`, `SessionDiagnostics`, and `StateMachine` definitions stay aligned between `src/types/index.ts` and `src-tauri/src/state/mod.rs`. Run `npm run contract:check` after changing either side. The script does regex-based extraction and fails if fields/variants diverge.

## Configuration

User settings stored in platform config directory:

- Providers (API keys, base URLs, models)
- Custom frameworks
- Session history snapshots

Config path: `config::get_config_dir()` (uses `directories` crate).

## LLM Provider Support

The LLM client auto-detects Gemini vs OpenAI-compatible APIs based on URL. Gemini uses native API format; others use `/v1/chat/completions` endpoint.

## CI/CD

GitHub Actions (`.github/workflows/release.yml`) builds macOS releases (Apple Silicon + Intel) on release publish or manual workflow dispatch. Windows builds are done locally.
