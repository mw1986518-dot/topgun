# 贡献指南

感谢你对 TopGun 项目的兴趣！本文档将帮助你参与项目开发。

## 如何贡献

### 提交 Issue

如果你发现了 bug 或有功能建议：

1. 在 [Issues](https://github.com/mw1986518-dot/topgun/issues) 页面搜索是否已有类似问题
2. 如果没有，点击「New Issue」创建新问题
3. 使用清晰的标题描述问题
4. 提供复现步骤（如果是 bug）
5. 说明你的环境（操作系统、Node.js 版本等）

### 提交 Pull Request

1. Fork 本仓库
2. 创建分支：`git checkout -b feature/your-feature-name`
3. 进行修改
4. 确保测试通过：`npm test`
5. 提交代码：`git commit -m "feat: your feature description"`
6. 推送分支：`git push origin feature/your-feature-name`
7. 在 GitHub 上创建 Pull Request

## 开发环境设置

### 前置要求

- Node.js >= 18
- Rust >= 1.70
- Git

### 安装步骤

```bash
# 克隆仓库
git clone https://github.com/mw1986518-dot/topgun.git
cd topgun

# 安装前端依赖
npm install

# 启动开发服务器
npm run tauri dev
```

### 常用命令

| 命令                  | 说明                     |
| --------------------- | ------------------------ |
| `npm run dev`         | 启动前端开发服务器       |
| `npm run tauri dev`   | 启动完整应用（开发模式） |
| `npm test`            | 运行单元测试             |
| `npm run lint`        | 代码检查                 |
| `npm run format`      | 格式化代码               |
| `npm run tauri build` | 构建发布版本             |

## 代码规范

### TypeScript/React

- 使用函数组件和 Hooks
- 遵循 ESLint 规则
- 使用 Prettier 格式化
- 组件命名使用 PascalCase
- 函数/变量命名使用 camelCase

### Rust

- 遵循 `cargo fmt` 格式
- 通过 `cargo clippy` 检查
- 公开函数添加文档注释

### 提交信息

使用约定式提交格式：

```
<type>: <description>

# 类型
feat:     新功能
fix:      修复 bug
docs:     文档更新
style:    代码格式（不影响功能）
refactor: 重构
test:     测试相关
chore:    构建/工具相关
```

示例：

- `feat: 添加暗色主题支持`
- `fix: 修复推演状态不同步问题`
- `docs: 更新安装文档`

## 项目结构

```
topgun/
├── src/                 # React 前端
│   ├── components/      # UI 组件
│   ├── hooks/           # 自定义 Hooks
│   ├── types/           # 类型定义
│   └── utils/           # 工具函数
├── src-tauri/           # Tauri 后端
│   └── src/
│       ├── commands/    # IPC 命令
│       ├── engine/      # 推演引擎
│       ├── framework/   # 思维框架
│       ├── llm/         # LLM 客户端
│       └── state/       # 状态机
└── e2e/                 # 端到端测试
```

## 需要帮助？

如有问题，可以：

- 在 Issues 中提问
- 查看现有代码了解实现方式

再次感谢你的贡献！
