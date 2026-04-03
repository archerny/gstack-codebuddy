# 三平台配置体系全面对比

> 创建日期：2026-03-23
> 最近更新：2026-03-26（更新 Skills 安装路径：所有 host 统一支持项目级和全局级安装，使用 `$_GSTACK_ROOT` 运行时探测链）
> 状态：已核实
> 信息来源：
> - Claude Code: [code.claude.com/docs](https://code.claude.com/docs/en/skills)、[docs.anthropic.com](https://docs.anthropic.com/en/docs/claude-code/memory)
> - Codex CLI: [developers.openai.com/codex](https://developers.openai.com/codex/skills)
> - CodeBuddy: [codebuddy.ai/docs](https://www.codebuddy.ai/docs/zh/ide/Features/Skills)

---

## 一、自然语言约定（Project Instructions）

项目级自然语言指令文件，让 AI 代理理解项目约定、编码风格和工作流。

| 维度 | Claude Code | Codex | CodeBuddy |
|------|------------|-------|-----------|
| **主文件** | `CLAUDE.md` | `AGENTS.md` | `CODEBUDDY.md` |
| **兼容文件** | — | 可配置 `project_doc_fallback_filenames` | 兼容 `AGENTS.md`（无 `CODEBUDDY.md` 时回退） |
| **覆盖机制** | 子目录的 `CLAUDE.md` 按需加载 | `AGENTS.override.md` 覆盖同目录 `AGENTS.md` | — |
| **全局级** | `~/.claude/CLAUDE.md` | `~/.codex/AGENTS.md` | — |
| **组织级** | macOS: `/Library/Application Support/ClaudeCode/CLAUDE.md`; Linux: `/etc/claude-code/CLAUDE.md` | — | — |
| **导入机制** | ✅ `@path/to/import` 语法，递归最多 5 层 | ❌ | ❌ |
| **大小限制** | 建议每文件 200 行内 | 合并后 32 KiB（可配置 `project_doc_max_bytes`） | 建议 500 行内 |
| **自动生成** | ✅ `/init` 命令（可设 `CLAUDE_CODE_NEW_INIT=true` 启用交互模式） | ❌ | ❌ |
| **排除机制** | ✅ `claudeMdExcludes` glob 数组 | ❌ | ❌ |
| **加载顺序** | 从当前目录沿目录树向上遍历 | 从项目根向下遍历到当前目录 | 全文加入上下文 |

### gstack 迁移要点

- gstack 已有 `CLAUDE.md`（224 行，包含 9 类项目约定）
- 可直接迁移为 `CODEBUDDY.md`，或因为 CodeBuddy 兼容 `AGENTS.md`，也可复用 Codex 的 `AGENTS.md`
- CodeBuddy 的 `CODEBUDDY.md` 是纯 Markdown，完整原文加入上下文，无元数据或复杂配置
- **注意**：CodeBuddy 没有 Claude Code 的 `@import` 机制，如果 CLAUDE.md 使用了导入，需要内联展开

---

## 二、结构化配置目录

每个平台都有自己的配置根目录。

| 维度 | Claude Code | Codex | CodeBuddy |
|------|------------|-------|-----------|
| **配置目录** | `.claude/` | `.codex/` | `.codebuddy/` |
| **配置文件** | `.claude/settings.json` | `.codex/config.toml` | — |
| **本地覆盖** | `.claude/settings.local.json`（不提交 git） | — | — |
| **全局配置** | `~/.claude/settings.json` | `~/.codex/config.toml` | — |
| **系统级配置** | — | `/etc/codex/config.toml` | — |
| **配置格式** | JSON | TOML | — |
| **配置内容** | 权限、环境变量、Hooks、MCP、沙盒、模型 | 模型、审批策略、沙盒、MCP、TUI、Profiles、功能开关 | — |

### gstack 迁移要点

- CodeBuddy 没有集中式配置文件（如 `settings.json` / `config.toml`），配置分散在 Rules、Skills、Memory 等子机制中
- `.codebuddy/` 是 IDE 工作环境目录，**不应存放构建产物**（构建产物统一到 `dist/codebuddy/`）

---

## 三、Skills / 技能

三个平台都支持 SKILL.md 标准格式的技能系统（遵循 [Agent Skills](https://agentskills.io) 开放标准）。

### 3.1 基础对比

| 维度 | Claude Code | Codex | CodeBuddy |
|------|------------|-------|-----------|
| **项目级目录** | `.claude/skills/` | `.agents/skills/` | `.codebuddy/skills/` |
| **用户级目录** | `~/.claude/skills/` | `~/.codex/skills/` + `~/.agents/skills/` | `~/.codebuddy/skills/` / 用户级 Skills（IDE 管理） |
| **系统级** | — | `/etc/codex/skills` | — |
| **企业级** | 管理设置中配置 | — | — |
| **插件级** | `<plugin>/skills/` | — | — |
| **核心文件** | `SKILL.md` | `SKILL.md` | `SKILL.md` |
| **元数据格式** | YAML frontmatter | YAML frontmatter | YAML frontmatter |
| **触发方式** | 用户 `/name` 调用 + AI 自动调用 | 用户 `$name` 调用 + 隐式调用 | 用户调用 + AI 自动调用 |
| **commands 兼容** | ✅ `.claude/commands/` 仍可用，Skill 优先 | — | — |
| **安装工具** | — | ✅ `$skill-installer` | — |
| **创建工具** | — | ✅ `$skill-creator` | — |
| **Monorepo 支持** | ✅ 嵌套 `.claude/skills/` 自动发现 | ✅ `$CWD/../.agents/skills` + `$REPO_ROOT/.agents/skills` | — |

### 3.2 Frontmatter 字段完整对照

这是迁移的**核心差异点**。三平台的 frontmatter 字段并不完全一致。

| 字段 | Claude Code | Codex | CodeBuddy | 说明 |
|------|:----------:|:-----:|:---------:|------|
| `name` | ✅ 可选（省略时用目录名） | ✅ 必需 | ✅ 必需 | 技能标识符 |
| `description` | ✅ 推荐（省略时用首段） | ✅ 必需 | ✅ 必需 | 决定 AI 何时触发 |
| `allowed-tools` | ✅ 可选 | ✅ 可选 | ✅ 可选 | 限制技能可用工具 |
| `disable-model-invocation` | ✅ 可选（默认 `false`） | — | — | 阻止 AI 自动调用 |
| `user-invocable` | ✅ 可选（默认 `true`） | — | — | 设 `false` 隐藏在 `/` 菜单 |
| `disable` | — | — | ✅ 可选（默认 `false`） | 禁用技能 |
| `argument-hint` | ✅ 可选 | — | — | 自动完成提示，如 `[issue-number]` |
| `model` | ✅ 可选 | — | — | 覆盖技能使用的模型 |
| `effort` | ✅ 可选（low/medium/high/max） | — | — | 覆盖推理努力级别 |
| `context` | ✅ 可选（`fork` = 子代理运行） | — | — | 隔离执行上下文 |
| `agent` | ✅ 可选（Explore/Plan 等） | — | — | 配合 `context: fork` 指定子代理类型 |
| `hooks` | ✅ 可选 | — | — | 技能生命周期钩子 |
| `version` | ✅ 可选 | — | — | 技能版本 |
| `policy.allow_implicit_invocation` | — | ✅（在 `agents/openai.yaml` 中） | — | 等价于 `disable-model-invocation` |
| `interface.*` | — | ✅（在 `agents/openai.yaml` 中） | — | UI 配置（图标、颜色、显示名等） |
| `dependencies.tools` | — | ✅（在 `agents/openai.yaml` 中） | — | 声明 MCP 依赖 |

### 3.3 调用控制机制对比

| 控制方式 | Claude Code | Codex | CodeBuddy |
|---------|------------|-------|-----------|
| **用户可调用 + AI 可调用**（默认） | ✅ 默认行为 | ✅ 默认行为 | ✅ 默认行为 |
| **仅用户可调用** | `disable-model-invocation: true` | `allow_implicit_invocation: false` | `disable: true`（但这会完全禁用） |
| **仅 AI 可调用** | `user-invocable: false` | ❌ | ❌ |
| **完全禁用** | 权限中拒绝 Skill 工具 | `[[skills.config]]` + `enabled = false` | `disable: true` |

**关键差异**：
- Claude Code 可以精细控制"用户能调用 / AI 能调用"两个维度独立设置
- Codex 的 `allow_implicit_invocation` 只控制 AI 自动调用，用户始终可以显式调用
- CodeBuddy 的 `disable: true` 是整体禁用，没有"仅用户 / 仅 AI"的精细控制

### 3.4 上下文加载与渐进式披露

三平台都采用了类似的三级加载策略来管理上下文窗口：

| 加载层级 | Claude Code | Codex | CodeBuddy |
|---------|------------|-------|-----------|
| **元数据（始终加载）** | 描述加载到上下文（受预算限制） | `name` + `description` 始终可见 | `name` + `description` 始终加载（~100 词） |
| **技能主体（触发时加载）** | 调用时加载 SKILL.md 全文 | 调用时加载 SKILL.md 全文 | 触发时加载（建议 <5k 词） |
| **资源文件（按需加载）** | 需在 SKILL.md 中引用 | 按需加载 scripts/references | AI 判定需要时加载 |
| **上下文预算** | 默认 2% 或 16,000 字符（可通过 `SLASH_COMMAND_TOOL_CHAR_BUDGET` 覆盖） | — | — |

### 3.5 参数传递机制

| 维度 | Claude Code | Codex | CodeBuddy |
|------|------------|-------|-----------|
| **参数替换** | ✅ `$ARGUMENTS`, `$0`, `$1` 等 | ❌ | ❌ |
| **动态上下文注入** | ✅ `` !`command` `` 语法执行 shell 命令 | ❌ | ❌ |
| **内置变量** | `${CLAUDE_SESSION_ID}`, `${CLAUDE_SKILL_DIR}` | — | — |

**gstack 迁移影响**：gstack 的模板中如果使用了 `$ARGUMENTS` 或 `` !`command` `` 语法，在 CodeBuddy 中需要改为自然语言描述，让 AI 自行执行等价操作。

### 3.6 资源目录结构对比

```
# Claude Code
my-skill/
├── SKILL.md              # 必需
├── template.md           # 任意支持文件
├── examples/sample.md    # 示例
└── scripts/validate.sh   # 脚本

# Codex
my-skill/
├── SKILL.md              # 必需
├── scripts/              # 可执行代码
├── references/           # 文档引用
├── assets/               # 模板资源
└── agents/openai.yaml    # UI/策略配置（Codex 独有）

# CodeBuddy
my-skill/
├── SKILL.md              # 必需
├── scripts/              # 可执行代码（高可靠性任务）
├── references/           # 辅助文档（按需加载，保持 SKILL.md 精简）
└── assets/               # 输出资源（不加载到上下文，仅用于最终输出）
```

**关键差异**：
- Claude Code 没有强制的子目录命名约定，任意文件结构
- Codex 独有 `agents/openai.yaml` 用于 UI 和调用策略配置
- CodeBuddy 的三个子目录有明确的语义区分：`scripts`（执行）、`references`（参考）、`assets`（输出）

### 3.7 最佳实践对比

| 实践 | Claude Code | Codex | CodeBuddy |
|------|------------|-------|-----------|
| **SKILL.md 大小限制** | ≤ 500 行 | — | < 5,000 词 |
| **描述撰写** | 描述具体使用场景和时机 | 需清晰界定触发范围和边界 | 越具体触发越准确 |
| **单一职责** | — | ✅ 每个技能专注单一任务 | — |
| **指令优先于脚本** | — | ✅ 除非需要确定性行为 | ✅ 避免冗余，长文档放 references |
| **编写风格** | — | 步骤化，包含明确输入输出 | 指令性语言（"To accomplish X, do Y"），避免第二人称 |

### gstack 迁移要点

1. **Frontmatter 转换规则**：
   - 保留：`name`, `description`, `allowed-tools`
   - 去掉：`version`, `hooks`, `disable-model-invocation`, `user-invocable`, `argument-hint`, `model`, `effort`, `context`, `agent`
   - 新增：`disable`（如需禁用某些技能）
2. **参数传递降级**：gstack 中使用的 `$ARGUMENTS` 和 `` !`command` `` 需转为自然语言指令
3. **上下文预算**：Claude Code 有 16,000 字符的技能描述预算限制，CodeBuddy 无此限制但建议控制在 100 词内
4. **资源目录**：CodeBuddy 的 `scripts/`, `references/`, `assets/` 三个目录有明确语义，gstack 的支持文件应按此分类
5. **统一安装路径探测**：gstack 的 SKILL.md 使用 `$_GSTACK_ROOT` 运行时探测链，三个 host 的探测优先级一致：
   - Priority 1: 项目本地 `dist/{host}/gstack/`（开发模式）
   - Priority 2: 项目本地 skills 目录（`.claude/skills/gstack`、`.agents/skills/gstack`、`.codebuddy/skills/gstack`）
   - Priority 3: 全局安装（`~/.claude/skills/gstack`、`~/.codex/skills/gstack`、`~/.codebuddy/skills/gstack`）

---

## 四、Rules / 规则

**重要区别**：三个平台的 "Rules" 虽然名称相同，但 Codex 的 Rules 与另外两个**性质完全不同**。

### 4.1 性质对比

| 维度 | Claude Code Rules | Codex Rules | CodeBuddy Rules |
|------|------------------|-------------|-----------------|
| **本质** | 自然语言编码规范 | 命令执行权限控制 | 自然语言编码规范 |
| **类比** | "团队编码手册" | "防火墙规则" | "团队编码手册" |
| **目录** | `.claude/rules/` | `.codex/rules/` | `.codebuddy/rules/` |
| **文件格式** | Markdown（`.md`） | Starlark（`.rules`） | Markdown（文件夹包含 `RULE.mdc`） |
| **状态** | 稳定 | 实验性（可能变更） | 稳定 |

### 4.2 Claude Code Rules 详细规范

**文件格式**：

```markdown
---
paths:
  - "src/api/**/*.ts"
---

# API Development Rules
- All API endpoints must include input validation
```

**字段说明**：

| 字段 | 说明 |
|------|------|
| `paths` | 可选，Glob 模式数组，限定规则作用范围。仅当 Claude 读取匹配文件时触发 |

**加载机制**：
- 无 `paths` 字段的规则：**全局加载**，每次会话生效
- 有 `paths` 字段的规则：**路径匹配时加载**，仅当 Claude 读取匹配文件时触发
- 递归发现所有 `.md` 文件，支持子目录组织
- 用户级规则 `~/.claude/rules/` 在项目规则之前加载（项目规则优先级更高）
- 支持**符号链接**跨项目共享规则

**大小限制**：每个规则文件应涵盖一个主题，使用描述性文件名。

### 4.3 Codex Rules 详细规范

Codex 的 Rules 是**命令执行权限控制系统**，使用 Starlark 语法定义。

**文件格式**：

```python
prefix_rule(
    pattern = ["gh", "pr", "view"],
    decision = "prompt",
    justification = "Viewing PRs is allowed with approval",
    match = ["gh pr view 7888"],
    not_match = ["gh pr --repo openai/codex view 7888"],
)
```

**`prefix_rule()` 完整字段**：

| 字段 | 必需 | 说明 |
|------|------|------|
| `pattern` | ✅ | 命令前缀列表。支持字面字符串和字面量联合 `["view", "list"]` |
| `decision` | 否（默认 `allow`） | `allow`（无提示执行）/ `prompt`（每次提示）/ `forbidden`（阻止） |
| `justification` | 否 | 规则理由，`forbidden` 时建议包含替代方案 |
| `match` | 否 | 内联测试：应该匹配的命令示例 |
| `not_match` | 否 | 内联测试：不应该匹配的命令示例 |

**优先级**：多规则匹配时，限制性最强的决策胜出：`forbidden` > `prompt` > `allow`

**Shell 包装处理**：
- Codex 使用 tree-sitter 解析 `bash -c` 等 shell 包装命令
- 简单线性链（`&&`, `||`, `;`, `|`）会被拆分为独立命令分别评估
- 复杂脚本（重定向、替换、变量、通配符、控制流）不拆分，整体评估

**测试命令**：`codex execpolicy check --pretty --rules ~/.codex/rules/default.rules -- <command>`

### 4.4 CodeBuddy Rules 详细规范

**文件格式**：

每条规则对应一个文件夹，包含 `RULE.mdc` 文件：

```markdown
---
description: 规则的描述信息
alwaysApply: false
enabled: true
updatedAt: 2026-01-13T12:03:50.791Z
---

# 规则标题

规则正文内容...
```

**完整 Frontmatter 字段**：

| 字段 | 说明 |
|------|------|
| `description` | 规则描述。AI 根据描述判断是否需要加载（`requested` 模式的关键） |
| `alwaysApply` | 布尔值。`true` = always 模式，`false` = requested 或 manual |
| `enabled` | 布尔值。是否启用此规则 |
| `updatedAt` | ISO 时间戳。更新时间 |
| `provider` | 提供者信息 |

**三种加载模式详解**：

| 模式 | 配置方式 | 上下文加载 | 适用场景 |
|------|---------|-----------|---------|
| **Always** | `alwaysApply: true` | 总是加载规则原文 | 核心编码规范、架构约束、安全要求 |
| **Requested** | `alwaysApply: false` + 有 `description` | 只加载名称和描述，AI 判断需要时再读原文 | 文档、使用指南、参考资料 |
| **Manual** | `alwaysApply: false` + 无 `description` | 不自动加载，仅 @提及时应用 | 特定功能的开发指南、可选最佳实践 |

**最佳实践**：
- 规则控制在 **500 行以内**
- 大规则拆分为多个可组合的规则
- 核心规范设为 `alwaysApply`（建议 3-5 个）
- 其他规则设为 `manual` 或 `requested`
- 创建或修改规则后，需要**新建对话会话**才生效

**调试方法**：在对话中询问 AI "当前应用了哪些规则？"

### 4.5 三平台 Rules 详细对照

| 维度 | Claude Code | Codex | CodeBuddy |
|------|------------|-------|-----------|
| **用途** | 编码规范 | 命令权限控制 | 编码规范 |
| **语法** | Markdown | Starlark (Python 方言) | Markdown |
| **路径限定** | `paths` (glob) | `pattern` (命令前缀) | `globs` (glob) |
| **加载模式** | 全局 / 路径匹配 | 启动时加载全部 | always / requested / manual |
| **用户级** | `~/.claude/rules/` | `~/.codex/rules/default.rules` | 用户级规则（IDE 管理） |
| **组织级** | 管理设置 | `requirements.toml` 中 `prefix_rule` | — |
| **跨项目共享** | ✅ 符号链接 | — | — |
| **内联测试** | ❌ | ✅ `match`/`not_match` | ❌ |
| **动态写入** | ❌ | ✅ TUI 允许列表自动写入 | ❌ |
| **大小建议** | 一个主题一个文件 | — | ≤ 500 行 |
| **生效时机** | 即时 | 重启生效 | 新会话生效 |

### gstack 迁移要点

1. **CLAUDE.md → CodeBuddy Rules 转换**：9 类约定按加载需求分配模式
   - 核心规范（commit style, platform-agnostic）→ `alwaysApply: true`（建议 3-5 个）
   - 参考指南（testing, template writing）→ `requested` + 有 description
   - 可选指南（browser interaction）→ `manual`
2. **Codex Rules 不需要迁移**：性质完全不同，CodeBuddy 没有等价的命令权限控制系统
3. **hooks 安全检查**：Claude Code 的 `PreToolUse` hooks（careful/freeze/guard）在 CodeBuddy 中转为 `alwaysApply: true` 的 Rules
4. **注意文件格式**：CodeBuddy 的规则文件是 `RULE.mdc`（每条规则一个文件夹），不是简单的 `.md` 文件

---

## 五、Commands / 命令

### 5.1 详细对比

| 维度 | Claude Code | Codex | CodeBuddy |
|------|------------|-------|-----------|
| **实现方式** | `.claude/commands/` 目录下的 `.md` 文件 | — | IDE UI 创建 |
| **与 Skills 关系** | 已合并入 Skills，commands 仍可用但 Skill 优先 | — | 独立于 Skills |
| **触发方式** | `/name`（对话框输入 `/`） | — | `/name`（对话框为空时输入 `/`） |
| **参数传递** | ✅ 支持 `$ARGUMENTS` 替换 | — | ✅ 配置参数和输入格式 |
| **存储位置（项目级）** | `.claude/commands/` | — | 项目级（IDE 管理） |
| **存储位置（用户级）** | `~/.claude/commands/` | — | `~/.codebuddy/commands/`（兼容） |
| **组合限制** | — | — | 每条消息只能包含一个 `/command` |
| **创建方式** | 手动创建 `.md` 文件 | — | IDE 设置页面 UI 创建 |

### 5.2 应用场景差异

| 场景 | Claude Code 实现方式 | CodeBuddy 实现方式 |
|------|--------------------|--------------------|
| 封装代码生成模板 | `.claude/commands/generate.md` | 自定义斜杠指令 |
| 标准化代码审查流程 | `.claude/skills/review/SKILL.md`（Skill 优先） | 自定义斜杠指令 或 Skill |
| 快速操作命令 | `.claude/commands/deploy.md` | 自定义斜杠指令 |
| 团队共享工作流 | `.claude/skills/`（提交到仓库） | Skill（项目级，提交到仓库） |

### gstack 迁移要点

- Claude Code 的 commands 已合并入 Skills，gstack 的技能本身就是 Skill 格式，不需要额外适配 commands
- CodeBuddy 的自定义斜杠指令是 IDE UI 创建的，不是文件系统管理的，与 gstack 的模板编译系统无关
- gstack 的技能在 CodeBuddy 中以 Skills 形式存在，用户通过 AI 自动识别或直接@提及触发

---

## 六、Memory / 记忆

### 6.1 详细对比

| 维度 | Claude Code | Codex | CodeBuddy |
|------|------------|-------|-----------|
| **自动记忆** | ✅ AI 自动保存笔记 | ❌ 无动态记忆 | ✅ AI 自动识别并保存 |
| **手动记忆** | ✅ "记住使用 pnpm" | ❌ | ✅ "请记住：..." |
| **存储位置** | `~/.claude/projects/<project>/memory/` | — | `.codebuddy/memory/` + `.codebuddy/MEMORY.md` |
| **项目标识** | 基于 git 仓库路径，同仓库所有 worktree 共享 | — | 基于项目目录 |
| **自定义路径** | ✅ `autoMemoryDirectory` 设置 | — | — |
| **索引文件** | `MEMORY.md`（前 200 行启动时加载） | — | `MEMORY.md`（长期记忆，就地更新） |
| **主题文件** | ✅ 按主题分文件（`debugging.md`, `api-conventions.md` 等） | — | 按日期分文件 `YYYY-MM-DD.md`（每日追加） |
| **按需读取** | ✅ 主题文件不启动时加载，按需使用文件工具读取 | — | 每日文件按需读取 |
| **管理方式** | `/memory` 命令（列出/切换/打开/编辑/添加） | — | 对话中自然语言管理（创建/更新/删除） |
| **跨项目** | 按项目隔离（同 git 仓库共享） | — | 项目级（`.codebuddy/` 在项目内） |
| **全局记忆** | — | — | ✅ 全局生效，跨所有项目 |
| **禁用方式** | `autoMemoryEnabled: false` 或 `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` | — | 全局开关可临时关闭 |
| **数量限制** | — | — | 无硬限制，建议 10-20 个 |
| **版本控制** | ❌ 存在用户目录，不随仓库提交 | — | ✅ `.codebuddy/memory/` 可随仓库提交 |

### 6.2 Claude Code Memory 文件结构

```
~/.claude/projects/<project>/memory/
├── MEMORY.md              # 简洁索引，前 200 行每次会话加载
├── debugging.md           # 调试模式笔记（按需读取）
├── api-conventions.md     # API 设计决策（按需读取）
└── ...                    # Claude 按需创建的主题文件
```

### 6.3 CodeBuddy Memory 文件结构

```
.codebuddy/
├── MEMORY.md              # 长期记忆（就地更新，保持简洁）
└── memory/
    ├── 2026-03-22.md      # 每日记录（追加写入）
    ├── 2026-03-23.md      # 每日记录
    └── ...
```

### 6.4 Memory vs Rules 辨析

| 维度 | Memory | Rules |
|------|--------|-------|
| **性质** | AI 记住的事实和偏好 | 用户设定的行为规范 |
| **示例** | "用户喜欢 TypeScript" | "代码必须加注释" |
| **创建方式** | 对话中自动或手动创建 | 手动创建配置文件 |
| **管理者** | AI 管理 | 用户管理 |

### gstack 迁移要点

1. **路径差异不影响技能内容**：Memory 是 IDE 工作环境的一部分，gstack 的技能不需要直接引用 Memory 路径
2. **团队共享**：CodeBuddy 的 Memory 可随仓库提交，团队共享项目上下文——这在 Claude Code 中做不到
3. **CodeBuddy 有全局 Memory**：全局生效跨所有项目，类似于 Claude Code 的 `~/.claude/CLAUDE.md` 但更动态

---

## 七、Hooks / 钩子

**只有 Claude Code 支持 Hooks**。Codex 和 CodeBuddy 都没有此机制。

### 7.1 基础对比

| 维度 | Claude Code | Codex | CodeBuddy |
|------|------------|-------|-----------|
| **支持** | ✅ | ❌ | ❌ |
| **事件数量** | 20+ 种 | — | — |
| **处理器类型** | 4 种 | — | — |
| **配置位置** | settings.json / Skill frontmatter / Plugin | — | — |

### 7.2 Claude Code Hooks 完整事件列表

#### 会话生命周期

| 事件 | 时机 | Matcher | 处理器 |
|------|------|---------|--------|
| `SessionStart` | 会话开始或恢复 | `startup` / `resume` | 全部 4 种 |
| `SessionEnd` | 会话终止 | `clear` / `logout` | 仅 Command |
| `InstructionsLoaded` | 加载 CLAUDE.md 或 rules | `session_start` / `nested_traversal` | 仅 Command |

#### 用户输入与权限

| 事件 | 时机 | Matcher | 处理器 |
|------|------|---------|--------|
| `UserPromptSubmit` | 用户提交提示时（处理前） | 无 | 全部 4 种 |
| `PermissionRequest` | 权限对话框出现时 | — | 全部 4 种 |
| `Elicitation` | MCP 服务器请求用户输入 | MCP 服务器名 | 仅 Command |
| `ElicitationResult` | 用户响应 MCP 请求后 | MCP 服务器名 | 仅 Command |

#### 工具执行循环

| 事件 | 时机 | Matcher | 处理器 |
|------|------|---------|--------|
| `PreToolUse` | 工具调用执行前（可修改/阻止） | 工具名（如 `Bash`, `Edit\|Write`） | 全部 4 种 |
| `PostToolUse` | 工具调用成功后 | 工具名 | 全部 4 种 |
| `PostToolUseFailure` | 工具调用失败后 | 工具名 | 全部 4 种 |

#### Agent 行为

| 事件 | 时机 | Matcher | 处理器 |
|------|------|---------|--------|
| `SubagentStart` | 生成子 Agent 时 | Agent 类型（`Explore`, `Plan`） | 仅 Command |
| `SubagentStop` | 子 Agent 完成响应时 | — | 全部 4 种 |
| `TeammateIdle` | Agent Team 队友即将闲置（可强制继续） | 无 | 全部 4 种 |
| `TaskCompleted` | 任务标记完成（可强制重新执行） | 无 | 全部 4 种 |
| `Stop` | Claude 完成响应（可阻止停止） | 无 | 全部 4 种 |
| `StopFailure` | 因 API 错误回合结束 | 错误类型（`rate_limit` 等） | 仅 Command |

#### 系统事件

| 事件 | 时机 | 处理器 |
|------|------|--------|
| `ConfigChange` | 配置文件更改 | 仅 Command |
| `Notification` | 发送通知 | 仅 Command |
| `WorktreeCreate` | 创建工作树 | 仅 Command |
| `WorktreeRemove` | 移除工作树 | 仅 Command |
| `PreCompact` | 压缩上下文前 | 仅 Command |
| `PostCompact` | 压缩上下文后 | 仅 Command |

### 7.3 处理器类型详解

| 处理器 | 输入方式 | 输出方式 | 适用事件 | 异步支持 |
|--------|---------|---------|---------|---------|
| **Command** | stdin JSON | exit code + stdout JSON | 全部事件 | ✅ `"async": true` |
| **HTTP** | POST 请求 body | 响应 body | 部分事件 | ❌ |
| **Prompt** | 发送到 Claude 模型 | JSON 决策 | 部分事件 | ❌ |
| **Agent** | 子 Agent 执行 | 使用 Read/Grep 等工具 | 部分事件 | ❌ |

**退出码行为（Command 处理器）**：

| 退出码 | 行为 |
|--------|------|
| 0 | 成功，解析 stdout JSON |
| 2 | **阻止错误**，stderr 反馈给 Claude（如 `PreToolUse` 阻止工具调用） |
| 其他 | 非阻止错误，执行继续 |

**JSON 输出控制字段**：
- `continue`：是否继续
- `stopReason`：停止原因
- `suppressOutput`：隐藏输出
- `systemMessage`：警告信息
- `permissionDecision`（PreToolUse 专用）：`allow` / `deny` / `ask`

### 7.4 gstack 中使用的 Hooks

gstack 使用的 hooks 及其降级方案：

| gstack Hook | 事件 | Matcher | 原始功能 | CodeBuddy 降级方案 |
|-------------|------|---------|---------|-------------------|
| careful `PreToolUse` | `PreToolUse` | `Write`, `Bash` | 破坏性命令检查（rm -rf, DROP TABLE 等） | `alwaysApply: true` Rule + 内联文本 |
| freeze `PreToolUse` | `PreToolUse` | `Write` | 目录编辑限制检查 | `alwaysApply: true` Rule + 内联文本 |
| guard | — | — | careful + freeze 组合 | 合并到同一个 Rule |

**降级链路**：
```
Claude Code: hooks → shell script → exit code 2 = 阻止
    ↓ 降级
Codex: extractHookSafetyProse() → 内联安全提示文本
    ↓ 复用
CodeBuddy: 内联安全提示 + alwaysApply Rule（双保险）
```

> **重要**：Hooks 是唯一能做到**强制阻止**的机制。降级为 Rules + 内联文本后，变成了"建议性"约束——AI 可能不遵守。这是一个已知的安全降级风险，与 Codex 适配的情况相同。

---

## 八、其他能力

| 维度 | Claude Code | Codex | CodeBuddy |
|------|------------|-------|-----------|
| **Subagents / 子代理** | `.claude/agents/` | ✅ `[agents]` 配置 | ✅ 自定义 Agent（IDE UI） |
| **MCP** | ✅ settings.json 配置 | ✅ config.toml 配置 | ✅ IDE 管理 |
| **Plugins** | ✅ 插件市场 | — | — |
| **Profiles** | — | ✅ 命名配置集切换 | — |
| **管理员强制策略** | ✅ managed-settings.json | ✅ requirements.toml | — |
| **自定义模型** | ✅ | ✅ model_providers | ✅ API 接入 |
| **Automations** | — | — | ✅ 周期性自动化任务（RRULE 格式） |
| **会话管理** | ✅ 恢复/并行会话 | ✅ | ✅ |
| **上下文压缩** | ✅ `/compact` + PreCompact/PostCompact hooks | — | — |

---

## 九、综合对比矩阵

| 功能 | Claude Code | Codex | CodeBuddy |
|------|:----------:|:-----:|:---------:|
| **自然语言约定** | ✅ `CLAUDE.md` | ✅ `AGENTS.md` | ✅ `CODEBUDDY.md`（兼容 `AGENTS.md`） |
| **结构化配置目录** | ✅ `.claude/` | ✅ `.codex/` | ✅ `.codebuddy/` |
| **配置文件** | ✅ `settings.json` | ✅ `config.toml` | ❌ |
| **Skills / 技能** | ✅ `.claude/skills/` | ✅ `.agents/skills/` | ✅ `.codebuddy/skills/` |
| **Skill 子代理模式** | ✅ `context: fork` | ❌ | ❌ |
| **Skill 参数替换** | ✅ `$ARGUMENTS` | ❌ | ❌ |
| **Skill 动态上下文** | ✅ `` !`command` `` | ❌ | ❌ |
| **Rules（编码规范）** | ✅ Markdown | ❌ | ✅ Markdown |
| **Rules（命令权限）** | ❌ | ✅ Starlark | ❌ |
| **Rules 路径限定** | ✅ `paths` glob | ✅ `pattern` 命令前缀 | ✅ `globs` |
| **Rules 加载模式** | 全局 / 路径匹配 | 全部加载 | always / requested / manual |
| **Commands** | ✅ `.claude/commands/`（合并入 Skills） | ❌ | ✅ 自定义斜杠指令 |
| **Memory / 记忆** | ✅ 自动（用户目录，按项目隔离） | ❌ | ✅ 自动（项目目录 + 全局） |
| **Memory 主题文件** | ✅ 按主题分文件 | ❌ | 按日期分文件 |
| **Hooks / 钩子** | ✅ 20+ 事件，4 种处理器 | ❌ | ❌ |
| **Subagents** | ✅ | ✅ | ✅ |
| **MCP** | ✅ | ✅ | ✅ |
| **全局用户配置** | ✅ `~/.claude/` | ✅ `~/.codex/` | — |
| **全局用户技能** | ✅ `~/.claude/skills/` | ✅ `~/.agents/skills/` | 用户级 Skills |
| **Profiles** | ❌ | ✅ | ❌ |
| **Automations** | ❌ | ❌ | ✅ |
| **管理员策略** | ✅ | ✅ | ❌ |
| **导入机制** | ✅ `@import` | ❌ | ❌ |
| **排除机制** | ✅ `claudeMdExcludes` | ❌ | ❌ |

> ⚠️ Codex 的 Rules 是命令执行权限控制（Starlark），与 Claude Code / CodeBuddy 的自然语言编码规范性质不同

---

## 十、对 gstack 迁移的关键启示

### 10.1 高复用度领域

1. **SKILL.md 模板**：三平台格式高度一致（都遵循 Agent Skills 开放标准），模板编译系统可直接扩展
2. **技能内容**：Markdown 指令正文可跨平台共享，只需调整 frontmatter 和平台特定引用
3. **浏览器引擎**：`browse` 二进制跨平台，MCP 封装可共享
4. **资源目录**：三平台都支持 `scripts/`, `references/` 等子目录

### 10.2 需要专门适配的领域

1. **Frontmatter 字段转换**（详见 3.2 节）：
   - 保留：`name`, `description`, `allowed-tools`
   - 去掉：`version`, `hooks`, `disable-model-invocation`, `user-invocable`, `argument-hint`, `model`, `effort`, `context`, `agent`
   - 新增：`disable`
2. **参数传递降级**：`$ARGUMENTS` / `` !`command` `` / `${CLAUDE_SESSION_ID}` / `${CLAUDE_SKILL_DIR}` 需转为自然语言
3. **Hooks → Rules 降级**：强制阻止变为建议性约束，安全等级降低（与 Codex 相同的已知风险）
4. **Rules 文件格式**：CodeBuddy 用 `RULE.mdc`（文件夹），不是 `.md` 平面文件
5. **上下文预算差异**：Claude Code 有 16,000 字符的技能描述预算限制
6. **Memory 无直接关系**：技能内容不应直接引用 Memory 路径

### 10.3 CodeBuddy 独特优势

1. **AGENTS.md 兼容**：可复用 Codex 的已有输出作为起步，降低迁移门槛
2. **Rules 三种加载模式**：always / requested / manual 比 Claude Code 的全局/路径匹配更灵活
3. **项目内 Memory**：可随仓库提交，团队共享上下文——这在 Claude Code 和 Codex 中做不到
4. **Automations**：周期性自动化任务，可用于定期技能检查/生成
5. **CodeBuddy 渐进式披露设计**：`scripts/` → `references/` → `assets/` 三层语义明确，上下文管理更高效

### 10.4 已知的降级风险

| 风险 | 描述 | 影响 | 缓解措施 |
|------|------|------|---------|
| Hooks 降级 | 强制阻止 → 建议性约束 | 安全检查（careful/freeze/guard）可能被 AI 忽略 | Rules + 内联文本双保险，与 Codex 适配风险相同 |
| 参数传递丢失 | `$ARGUMENTS` 不可用 | 需要参数的技能需改为自然语言 | 在 SKILL.md 中明确说明期望输入 |
| 上下文预算差异 | 平台间预算不同 | 技能描述在不同平台被截断 | 保持描述精简（< 100 词） |
| 调用控制粗化 | 无"仅 AI 可调用"选项 | 后台知识类技能无法隐藏在用户界面中 | 使用 `disable: true` + Rules 替代 |
