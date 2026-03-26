# TopGun

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-blue.svg)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/mw1986518-dot/topgun)

**顶级思维** - 基于 Tauri 的多智能体并发推演 AI 决策工具。

[English](#english) | 中文

---

## 截图

> 📷 请添加项目截图到 `docs/screenshot.png`

---

## 项目简介

TopGun 旨在帮助用户对复杂议题进行深度思考和决策推演。通过模拟多个不同思维框架的"智能体"同时对同一议题进行分析、质疑、修正，最终达成共识或识别风险。

### 核心能力

| 能力 | 说明 |
|------|------|
| 🎯 **议题澄清** | 通过多轮追问，帮助用户厘清真正的问题本质 |
| 🔍 **多视角推演** | 不同思维框架从各自角度审视问题，发现盲点 |
| ⚔️ **异议与修正** | 智能体之间相互质疑、补充，避免单一视角的局限 |
| ⚠️ **风险识别** | 显式标注无法达成共识的风险点，辅助决策 |
| 📋 **落地方案** | 将共识转化为可执行的行动计划 |

---

## 功能特性

### 🤖 多智能体并发推演

- **真正的并发执行**：使用 tokio::spawn 实现真正的并行推理
- **8 种内置思维框架**：第一性原理、反脆弱、系统思维、水平思维、行为经济学等
- **实时状态追踪**：查看每个智能体的思考状态、异议数量、版本迭代

### 🔄 结构化交叉质询

- 智能体之间相互审查输出
- 提出具体异议和证据
- 版本迭代修复（v1.0 → v2.0 → ...）
- 直到无异议或达到最大迭代次数

### 📊 风险显式标注

- 无法达成共识的风险点会被显式列出
- 每个风险包含：风险摘要、证据、临时接受理由、后续行动

### 🛠 行动计划生成

- 基于共识结果生成针对性问题
- 交互式问答细化方案
- 输出可执行的行动计划

---

## 适用人群

| 角色 | 场景 |
|------|------|
| 🎯 **决策者** | 在复杂情境下做出关键判断 |
| 📦 **产品/项目经理** | 规划产品方向、评估方案可行性 |
| 🚀 **创业者** | 验证商业想法、识别潜在风险 |
| 📚 **研究者** | 梳理研究思路、发现逻辑漏洞 |
| 💡 **深度思考者** | 面对复杂问题，希望获得更全面的视角 |

---

## 安装

### 前置要求

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://www.rust-lang.org/tools/install) >= 1.70
- [pnpm](https://pnpm.io/) 或 npm

### 快速开始

```bash
# 克隆仓库
git clone https://github.com/mw1986518-dot/topgun.git
cd topgun

# 安装依赖
npm install

# 启动开发模式
npm run tauri dev
```

### 构建发布版

```bash
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle/`。

---

## 使用指南

### 基本流程

1. **输入议题**：描述你想要分析的问题或决策
2. **问题澄清**：AI 会通过对话帮助你厘清问题本质
3. **选择框架**：从推荐的思维框架中选择 3-5 个
4. **并发推演**：观察多个智能体同时分析问题
5. **查看共识**：阅读综合结论和风险提示
6. **生成方案**：将结论转化为行动计划

### 配置 LLM

1. 点击左侧「本地配置」
2. 添加你的 LLM 供应商信息（API Key、Base URL、模型名称）
3. 支持任何兼容 OpenAI API 格式的服务

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Tailwind CSS 4 + Vite |
| 后端 | Tauri 2 (Rust) + tokio |
| 测试 | Vitest + Playwright |

---

## 项目结构

```
topgun/
├── src/                    # React 前端
│   ├── components/         # UI 组件
│   │   ├── workspace/      # 推演工作台
│   │   ├── layout/         # 布局和设置
│   │   └── frameworks/     # 框架管理
│   ├── hooks/              # React Hooks
│   ├── types/              # TypeScript 类型
│   └── utils/              # 工具函数
├── src-tauri/              # Tauri 后端
│   └── src/
│       ├── commands/       # IPC 命令处理
│       ├── engine/         # 推演引擎
│       ├── framework/      # 思维框架定义
│       ├── llm/            # LLM 客户端
│       └── state/          # 状态机
├── e2e/                    # 端到端测试
└── docs/                   # 文档
```

---

## FAQ

### 支持哪些 LLM？

支持任何兼容 OpenAI API 格式的 LLM 服务，包括：
- OpenAI GPT 系列
- Claude (通过兼容接口)
- 本地模型 (Ollama, LM Studio 等)
- 国内模型 (通义千问、文心一言等，需兼容接口)

### 数据安全吗？

所有数据存储在本地，API Key 保存在本地配置文件中，不会上传到任何服务器。

### 为什么是桌面应用？

- 本地数据存储，保护隐私
- 原生性能，响应迅速
- 跨平台支持 (Windows/macOS/Linux)

---

## 贡献

欢迎贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解如何参与。

---

## 更新日志

查看 [CHANGELOG.md](CHANGELOG.md) 了解版本更新历史。

---

## License

[MIT](LICENSE) © 2025 hprico

---

<a name="english"></a>
## English

**TopGun** - An AI-assisted decision-making tool based on multi-agent concurrent reasoning.

### Key Features

- **Multi-Agent Parallel Reasoning**: Multiple AI agents analyze problems simultaneously using different thinking frameworks
- **Structured Cross-Examination**: Agents challenge each other's conclusions and iterate
- **Explicit Risk Disclosure**: Unresolved disagreements are clearly marked
- **Action Plan Generation**: Transform consensus into executable plans

### Quick Start

```bash
git clone https://github.com/mw1986518-dot/topgun.git
cd topgun
npm install
npm run tauri dev
```

### Tech Stack

- Frontend: React 19 + TypeScript + Tailwind CSS 4
- Backend: Tauri 2 (Rust)
- Testing: Vitest + Playwright

### License

MIT