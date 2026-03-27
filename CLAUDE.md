# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TopGun (顶级思维) is a multi-agent concurrent reasoning desktop application built with Tauri 2. It helps users make better decisions by simulating multiple thinking frameworks analyzing the same topic in parallel, then synthesizing a consensus.

## Development Commands

```bash
# Start development (opens Tauri desktop window)
npm run tauri dev

# Run unit tests
npm test

# Run a single test file
npx vitest run src/components/workspace/__tests__/AgentCard.test.tsx

# Run E2E tests
npm run test:e2e

# Lint and format
npm run lint
npm run format

# Build for production
npm run tauri build
```

## Architecture

### Backend (Rust) - src-tauri/src/

The backend is a multi-phase reasoning engine:

**State Machine** (`state/mod.rs`): Central state with phases:
- Input → FrameworkSelection → Divergence → Examination → Patch → Consensus

**Reasoning Pipeline** (`engine/mod.rs`, `engine/pipeline.rs`):
1. **Divergence**: All agents generate initial analysis in parallel
2. **Examination**: Agents cross-examine each other's outputs
3. **Patching**: Agents revise based on objections
4. **Consensus**: Synthesize final output from all agent contributions

**LLM Client** (`llm/mod.rs`): HTTP client supporting OpenAI-compatible APIs and Gemini native API, with retry logic and exponential backoff.

**Frameworks** (`framework/mod.rs`): 14 built-in thinking frameworks (第一性原理, 反脆弱, 系统动力学, etc.) plus user-defined custom frameworks.

**IPC Commands** (`commands/`): Tauri command handlers organized by domain:
- `session.rs` - Session lifecycle and reasoning
- `action_plan.rs` - Post-consensus action planning
- `config_framework_history.rs` - Settings, frameworks, history

### Frontend (React) - src/

**State Management** (`hooks/useWorkspaceState.ts`): Single hook managing all workspace state. Uses Tauri event listener (`state-update`) for real-time backend sync with debouncing.

**IPC Pattern**:
- Frontend calls `invoke("command_name", { args })` to trigger backend actions
- Backend emits `state-update` events with full `StateMachine` payload
- Frontend debounces updates (80ms) to prevent render thrashing

**Types** (`types/index.ts`): TypeScript interfaces mirroring Rust structs. Keep these in sync when modifying backend state.

**Component Structure**:
- `components/workspace/` - Main workspace UI (AgentCard, ConsensusOutput, etc.)
- `components/layout/` - Sidebar, settings modal
- `components/frameworks/` - Framework management view

### Key Data Flow

```
User Input → invoke("start_session") → StateMachine.topic set
     ↓
invoke("select_frameworks") → Creates AgentState per framework
     ↓
invoke("run_reasoning") → Engine runs pipeline phases
     ↓
Each phase emits "state-update" events → Frontend re-renders
     ↓
Final consensus_output displayed
```

## Testing

**Unit Tests**: Vitest with jsdom. Mock Tauri APIs in `src/test/__mocks__/`.

**E2E Tests**: Playwright. Smoke tests tagged with `@smoke`.

When adding new IPC commands, add corresponding mocks in `src/test/__mocks__/@tauri-apps/api/core.ts`.

## Configuration

User settings stored in platform config directory:
- Providers (API keys, base URLs, models)
- Custom frameworks
- Session history snapshots

Config path: `config::get_config_dir()` (uses `directories` crate).

## LLM Provider Support

The LLM client auto-detects Gemini vs OpenAI-compatible APIs based on URL. Gemini uses native API format; others use `/v1/chat/completions` endpoint.