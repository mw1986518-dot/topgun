# 更新日志

本项目的所有重要变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 新增

- 待添加新功能

### 变更

- 待变更内容

### 修复

- 待修复问题

---

## [1.0.1] - 2026-04-20

### 新增

- 支持 Anthropic Messages API 协议（Kimi Coding 等）
- 新增 `is_anthropic_base` 自动检测逻辑
- 新增 `build_anthropic_body` 和 `parse_anthropic_response` 转换函数

### 变更

- LLM 客户端请求构建逻辑重构，支持三种协议：OpenAI、Gemini、Anthropic
- Anthropic 端点使用 `x-api-key` 认证头和 `anthropic-version` 版本头

---

## [0.1.0] - 2025-03-26

### 新增

- 初始版本发布
- 多智能体并发推演引擎
- 8 种内置思维框架
  - 第一性原理 (First Principles)
  - 反脆弱 (Anti-Fragility)
  - 系统思维 (Systems Thinking)
  - 水平思维 (Lateral Thinking)
  - 行为经济学 (Behavioral Economics)
  - 等
- 结构化交叉质询流程
- 风险显式标注功能
- 行动计划生成模块
- 议题澄清对话界面
- 会话历史管理
- 多 LLM 供应商支持
- 本地配置持久化

### 技术栈

- 前端：React 19 + TypeScript + Tailwind CSS 4 + Vite
- 后端：Tauri 2 (Rust)
- 测试：Vitest + Playwright

---

[Unreleased]: https://github.com/mw1986518-dot/topgun/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/mw1986518-dot/topgun/releases/tag/v0.1.0
