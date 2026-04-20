# TopGun

**[中文](README_CN.md)** | **English**

**TopGun** - An AI-assisted decision-making tool based on multi-agent concurrent reasoning.

## Project Goal

TopGun helps users think deeply and make decisions on complex topics. By simulating multiple "agents" with different thinking frameworks to analyze, challenge, and refine the same topic simultaneously, it ultimately reaches consensus or identifies risks.

Core Capabilities:

- **Topic Clarification**: Helps users clarify the essence of the problem through multiple rounds of questioning
- **Multi-perspective Analysis**: Different thinking frameworks examine problems from their respective angles, discovering blind spots
- **Objection & Revision**: Agents challenge and supplement each other, avoiding single-perspective limitations
- **Risk Identification**: Explicitly marks risk points where consensus cannot be reached, aiding decision-making
- **Actionable Plans**: Converts consensus into executable action plans

## Target Users

- **Decision Makers**: Managers who need to make critical judgments in complex situations
- **Product/Project Managers**: Planning product direction, evaluating solution feasibility
- **Entrepreneurs**: Validating business ideas, identifying potential risks
- **Researchers**: Organizing research思路, discovering logical gaps
- **Anyone needing deep thinking**: When facing complex problems and seeking more comprehensive perspectives

## Tech Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS 4 + Vite
- **Backend**: Tauri 2 (Rust)
- **Testing**: Vitest + Playwright

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run tauri dev

# Run tests
npm test

# Build
npm run tauri build
```

## Download

See [Releases](https://github.com/mw1986518-dot/topgun/releases) for download links.

### Windows

- `TopGun_0.1.2_x64-setup.exe` - NSIS installer
- `TopGun_0.1.2_x64_en-US.msi` - MSI installer

### macOS (Apple Silicon)

- `TopGun_0.1.2_aarch64.dmg` - DMG package

### macOS (Intel)

- `TopGun_0.1.2_x64.dmg` - DMG package

## License

MIT
