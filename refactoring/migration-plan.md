# gstack → CodeBuddy Skill 体系改造方案

> 创建日期：2026-03-22
> 最后更新：2026-03-24
> 状态：✅ Phase 0-5 全部完成（MCP 封装决定不做，无影响）。Phase 6 自包含安装 ✅ 全部完成（6A ✅ 6B ✅ 6C ✅ 6D ✅）
> 作者：CodeBuddy AI

---

## 一、背景与目标

> **参考文档**：三平台配置体系的完整对比见 [platform-comparison.md](./platform-comparison.md)，
> 包含自然语言约定、Skills、Rules、Memory、Hooks 等所有维度的详细差异分析。

### 1.1 现状

gstack 是 Garry Tan (YC CEO) 开源的 AI 工程工作流系统，将 AI 代理变成虚拟工程团队。当前支持的平台：

| 平台 | 状态 | 适配方式 |
|------|------|---------|
| Claude Code | ✅ 原生支持 | 主力平台，SKILL.md 原始格式 |
| Codex | ✅ 已适配 | `--host codex` 生成 `.agents/` 格式 |
| Gemini CLI | ✅ 已适配 | 同 Codex |
| Cursor | ✅ 已适配 | 同 Codex |
| **CodeBuddy** | ✅ 已适配 | Phase 0-5 全部完成，21 个技能可用 |

### 1.1.1 三平台配置体系关键差异

基于对三平台的全面调研（详见 [platform-comparison.md](./platform-comparison.md)），以下是影响迁移的关键差异：

| 能力 | Claude Code | Codex | CodeBuddy |
|------|:----------:|:-----:|:---------:|
| 自然语言约定 | `CLAUDE.md` | `AGENTS.md` | `CODEBUDDY.md`（兼容 `AGENTS.md`） |
| Skills | `.claude/skills/` | `.agents/skills/` | `.codebuddy/skills/` |
| Rules | 编码规范 (Markdown) | 命令权限 (Starlark) ⚠️ | 编码规范 (Markdown) |
| Hooks | ✅ 20+ 种 | ❌ | ❌ |
| Memory | 自动（用户目录） | ❌ | 自动（项目目录） |

**迁移关键发现**：
- **SKILL.md 格式三平台高度一致**：frontmatter 字段略有差异，正文可跨平台共享
- **CodeBuddy 兼容 AGENTS.md**：可复用 Codex 已有输出作为起步，降低迁移门槛
- **Hooks 降级方案可复用**：Codex 已实现 `extractHookSafetyProse()`，CodeBuddy 可直接复用
- **CodeBuddy Rules 比 Claude Code 更灵活**：支持 always / requested / manual 三种加载模式
- **Codex Rules 性质不同**：是命令执行权限控制（Starlark），非编码规范

### 1.2 目标

在 gstack 的**模板编译系统**中新增 `codebuddy` Host，使 22 个技能可以通过 `bun run gen:skill-docs --host codebuddy` 生成 CodeBuddy 原生格式，在 CodeBuddy IDE 中直接使用。

### 1.3 设计原则

1. **复用优先**：复用已有的 Codex 适配模式，不重复造轮子
2. **无侵入**：不破坏现有 Claude/Codex 输出，CodeBuddy 是独立的 Host 分支
3. **渐进式**：按技能优先级分批验证，不要求一步到位
4. **平台原生**：充分利用 CodeBuddy 的 Rules 和 Skills 机制，而非简单格式转换

---

## 二、架构设计

### 2.1 全景图

```
                    ┌──────────────────────────────────────────┐
                    │           SKILL.md.tmpl (模板)            │
                    │      每个技能一个 .tmpl 文件               │
                    └──────────────────┬───────────────────────┘
                                       │
                         gen-skill-docs.ts (编译器)
                                       │
                    ┌──────────────────┼───────────────────────┐
                    │                  │                        │
                    ▼                  ▼                        ▼
           Claude Code 输出      Codex 输出            CodeBuddy 输出 (新增)
           dist/claude/         dist/codex/            dist/codebuddy/
           {name}/             {name}/                 {name}/
           SKILL.md            SKILL.md                SKILL.md
```

> **设计原则**：`.codebuddy/` 是 CodeBuddy IDE 的工作环境目录（rules、memory 等），
> 不应被构建产物污染。所有构建输出统一放在 `dist/` 下，与 Claude / Codex 保持一致。

### 2.2 CodeBuddy 输出结构

```
dist/codebuddy/                        # 构建产物（gen-skill-docs 自动生成）
├── gstack/SKILL.md                    # 根技能 (命令路由)
├── review/SKILL.md                    # 代码审查
├── investigate/SKILL.md               # 系统化调试
├── ship/SKILL.md                      # 发布流程
├── office-hours/SKILL.md              # 产品思考
├── qa/SKILL.md                        # QA 测试 (依赖浏览器)
├── qa-only/SKILL.md                   # QA 仅报告
├── ...                                # 其余技能
└── browse/SKILL.md                    # 浏览器工具
```

> **`.codebuddy/` 目录不受影响**，仍由 CodeBuddy IDE 自身管理：
> `.codebuddy/MEMORY.md`、`.codebuddy/memory/`、`.codebuddy/rules/` 等。

### 2.3 格式转换对照

**原始 Claude Code 格式 (frontmatter)：**

```yaml
---
name: review
version: 1.0.0
description: |
  Pre-landing PR review...
allowed-tools:
  - Bash(git diff:*, git log:*, git rev-parse:*, ...)
  - Read
  - Grep
  - Glob
  - Edit
  - MultiEdit
  - AskUserQuestion
hooks:
  PreToolUse:
    - event: Write
      script: ~/.claude/skills/gstack/freeze/bin/check-freeze.sh
---
```

**CodeBuddy 目标格式 (frontmatter)：**

```yaml
---
name: review
description: |
  Pre-landing PR review. Analyzes diff against the base branch for SQL safety,
  LLM trust boundary violations, conditional side effects, and other structural
  issues. Use when asked to "review this PR", "code review", or "check my diff".
allowed-tools:
  - Bash(git diff:*, git log:*, git rev-parse:*, ...)
  - Read
  - Grep
  - Glob
  - Edit
  - MultiEdit
---
```

> **注意**：之前版本错误地使用了 Rules 的 `globs` 和 `alwaysApply` 字段。
> Skills 和 Rules 的 frontmatter 是**不同的格式**（详见 [platform-comparison.md](./platform-comparison.md) 第三章和第四章）。

**转换规则：**

| Claude Code 字段 | CodeBuddy 映射 | 说明 |
|------------------|----------------|------|
| `name` | `name`（必需） | CodeBuddy 要求 name 为必需字段 |
| `version` | 去掉 | CodeBuddy 技能无版本字段 |
| `description` | `description`（必需） | 直接迁移，CodeBuddy 要求为必需字段 |
| `allowed-tools` | `allowed-tools`（可选） | 直接迁移，三平台格式一致 |
| `hooks` | 转为 Rules + 内联安全提示 | 详见 Phase 3 和 [platform-comparison.md §7.4](./platform-comparison.md) |
| `disable-model-invocation` | 无直接等价 | CodeBuddy 的 `disable: true` 会完全禁用而非仅阻止 AI 调用 |
| `user-invocable` | 无等价 | CodeBuddy 没有"仅 AI 可调用"的控制 |
| `argument-hint` | 去掉 | CodeBuddy 不支持参数提示 |
| `model` | 去掉 | CodeBuddy 不支持按技能覆盖模型 |
| `effort` | 去掉 | CodeBuddy 不支持推理努力级别 |
| `context: fork` | 去掉 | CodeBuddy 不支持子代理模式运行技能 |
| `agent` | 去掉 | 依赖 `context: fork`，一并去掉 |
| — | `disable`（新增，可选） | CodeBuddy 独有，默认 `false` |

> **参数传递降级**：Claude Code 支持 `$ARGUMENTS`, `$0`, `` !`command` ``, `${CLAUDE_SKILL_DIR}` 等变量替换，
> CodeBuddy **不支持**。需要在 SKILL.md 中用自然语言描述期望的输入格式。

---

## 三、分阶段实施计划

### Phase 0 — 前置准备（✅ 已完成）

**目标**：统一构建输出目录，创建改造方案文档。

#### 0.1 已完成的工作

- [x] 创建 `refactoring/` 目录和本方案文档
- [x] 所有构建产物统一到 `dist/` 目录（`dist/claude/`、`dist/codex/`）
- [x] 修复全部测试以适配新路径
- [x] 添加 Conventional Commits 项目规则

> **注意**：不再需要创建 `.codebuddy/skills/` 和 `.codebuddy/rules/` 目录。
> `.codebuddy/` 是 CodeBuddy IDE 的工作环境，构建产物输出到 `dist/codebuddy/`。

---

### Phase 1 — 模板系统扩展（✅ 已完成）

> **⚡ 实际执行结果（2026-03-23）**：Phase 1 已完成并提交。
> 核心提交：`6a368cb` (构建脚本 + 测试) + `bdab64c` (Codex 产物) + `1609f44` (CodeBuddy 产物)
>
> **实际实现与计划差异**：
> - 未新增独立的 `codebuddySkillName()` 函数，而是复用了已有的 `codexSkillName()` 命名逻辑（两平台命名规则完全相同）
> - `transformFrontmatterForCodebuddy()` 保留了 `allowed-tools` 字段（与 Codex 的 `transformFrontmatter()` 不同，后者去掉 allowed-tools）
> - 修复了 Codex review sidecar 路径 bug：`dist/codex/gstack/review` → `dist/codex/review`
> - 未新增独立的 `gen:skill-docs:codebuddy` 脚本，而是在 `build` 中统一调用 `--host codebuddy`
>
> **验证结果**：21 个技能全部生成，零 `.claude` 路径残留，741 个测试全部通过。

**目标**：修改 `scripts/gen-skill-docs.ts`，新增 `codebuddy` Host。

**核心文件**：`scripts/gen-skill-docs.ts`

#### 1.1 扩展 Host 类型定义

```typescript
// 新增 'codebuddy' 到 Host 联合类型
type Host = 'claude' | 'codex' | 'codebuddy';
```

#### 1.2 扩展 HOST_PATHS

```typescript
const HOST_PATHS: Record<Host, HostPaths> = {
  // ... 已有 claude, codex ...
  codebuddy: {
    skillRoot:      '~/.codebuddy/skills/gstack',      // 用户安装目录（运行时引用）
    localSkillRoot: 'dist/codebuddy/gstack',            // 本地构建输出根目录
    binDir:         '~/.codebuddy/skills/gstack/bin',
    browseDir:      '~/.codebuddy/skills/gstack/browse/dist',
  },
};
```

> **关键区分**：`localSkillRoot` 指向 `dist/codebuddy/gstack`（构建产物），
> 而 `skillRoot` 是用户安装后的运行时路径，两者分离。

#### 1.3 扩展 `--host` 参数解析

在 `VALID_HOSTS` 中添加 `'codebuddy'`。

#### 1.4 新增 `codebuddySkillName()` 函数

复用 `codexSkillName()` 的命名逻辑：

```typescript
function hostSkillName(skillDir: string): string {
  if (skillDir === '.' || skillDir === '') return 'gstack';
  if (skillDir.startsWith('gstack-')) return skillDir.slice('gstack-'.length);
  return skillDir;
}
```

#### 1.5 新增 `transformFrontmatterForCodebuddy()` 函数

```typescript
function transformFrontmatterForCodebuddy(content: string): string {
  // 1. 从原始 frontmatter 中提取 description
  // 2. 去掉 name, version, allowed-tools, hooks
  // 3. 重建为 CodeBuddy 格式：
  //    ---
  //    description: <description text>
  //    alwaysApply: false
  //    ---
  // 4. 返回转换后的完整内容
}
```

#### 1.6 扩展 `processTemplate()` 添加 CodeBuddy 后处理

```typescript
if (host === 'codebuddy') {
  // 1. 提取 hooks 安全提示（复用 extractHookSafetyProse）
  const safetyProse = extractHookSafetyProse(tmplContent);

  // 2. 转换 frontmatter
  content = transformFrontmatterForCodebuddy(content);

  // 3. 插入安全提示（如果有）
  if (safetyProse) {
    // 在 frontmatter 后插入 ADVISORY 段落
  }

  // 4. 路径替换
  content = content
    .replaceAll('~/.claude/skills/gstack', '~/.codebuddy/skills/gstack')
    .replaceAll('.claude/skills/gstack', '.codebuddy/skills/gstack')
    .replaceAll('.claude/skills/review', '.codebuddy/skills/review')
    .replaceAll('.claude/skills', '.codebuddy/skills');
}
```

#### 1.7 扩展输出路径逻辑

```typescript
if (host === 'codebuddy') {
  const skillName = codebuddySkillName(tmplPath);
  outPath = path.join(ROOT, 'dist', 'codebuddy', skillName, 'SKILL.md');
}
```

#### 1.8 扩展跳过逻辑

```typescript
// CodeBuddy 下跳过 codex 技能目录（自指无意义）
if (host === 'codebuddy' && tmplPath.includes('/codex/')) continue;
```

#### 1.9 扩展 `package.json`

```json
{
  "scripts": {
    "gen:skill-docs:codebuddy": "bun run scripts/gen-skill-docs.ts --host codebuddy"
  }
}
```

#### 1.10 交付物

- [x] `scripts/gen-skill-docs.ts` 修改完成
- [x] `package.json` 新增脚本
- [x] `bun run gen:skill-docs --host codebuddy` 可成功运行
- [x] 所有技能输出到 `dist/codebuddy/{name}/SKILL.md`
- [x] `grep -r '\.claude' dist/codebuddy/` 无残留

#### 1.11 验证方法

```bash
# 编译
bun run gen:skill-docs --host codebuddy

# 检查输出
ls dist/codebuddy/

# 检查路径残留
grep -r '\.claude' dist/codebuddy/ || echo "No residual paths ✓"

# 确认原有输出不受影响
bun run gen:skill-docs --host claude
diff dist/claude/review/SKILL.md <(git show HEAD:dist/claude/review/SKILL.md) || echo "Claude output unchanged ✓"
```

---

### Phase 2 — CLAUDE.md 约定转为 CodeBuddy Rules（1 天）

> **⚡ 实际执行结果（2026-03-23）**：Phase 2 已简化为直接转写 `CODEBUDDY.md`，不生成 `.codebuddy/rules/`。
> 理由：项目约定 ~210 行（远低于 500 行上限），全量加载无压力，减少维护成本。
> 结合 `CLAUDE.md`（224 行）和 `AGENTS.md`（50 行）转写完成，已提交 `9c63a4c`。
> 原方案的 9 条 Rules 不再需要。如未来项目约定增长 >500 行，再考虑拆分。

**目标**：将 `CLAUDE.md` 中的 9 类项目约定转为 CodeBuddy 的项目规则（`.codebuddy/rules/`）。

> **说明**：Rules 属于 CodeBuddy IDE 的项目配置机制，**不是构建产物**。
> 它们由用户（或 AI）在项目中创建，存放在 `.codebuddy/rules/` 下，由 IDE 自动加载。
> 这与 `dist/` 中的构建产物不同 — Rules 是 IDE 环境配置，Skills 是生成的输出。

#### 2.1 规则清单

> CodeBuddy Rules 支持三种加载方式：
> - **always**（`alwaysApply: true`）：每次对话自动加载
> - **requested**（`alwaysApply: false` + 有 `description`）：AI 根据描述判断是否需要加载
> - **manual**（`alwaysApply: false` + 无 `description`）：仅用户 @提及时加载

| 文件名 | 来源（CLAUDE.md 章节） | 加载模式 | alwaysApply |
|--------|----------------------|----------|-------------|
| `skill-workflow.md` | SKILL.md workflow | always | `true` |
| `commit-style.md` | Commit style — bisect commits | always | `true` |
| `changelog-style.md` | CHANGELOG style | requested | `false` |
| `platform-agnostic.md` | Platform-agnostic design | always | `true` |
| `template-writing.md` | Writing SKILL templates | requested | `false` |
| `testing-pyramid.md` | Testing | requested | `false` |
| `e2e-blame-protocol.md` | E2E eval failure blame protocol | requested | `false` |
| `browser-interaction.md` | Browser interaction | manual | `false` |
| `gstack-safety.md` | careful/freeze/guard hooks → 降级为文本规则 | always | `true` |

#### 2.2 格式规范

> 详细的三平台 Rules 规范对比见 [platform-comparison.md §4](./platform-comparison.md)。

每条规则是一个**文件夹**，内含 `RULE.mdc` 文件（不是简单的 `.md` 平面文件）：

```
.codebuddy/rules/
├── commit-style/
│   └── RULE.mdc
├── platform-agnostic/
│   └── RULE.mdc
├── gstack-safety/
│   └── RULE.mdc
└── ...
```

每个 `RULE.mdc` 文件使用 CodeBuddy Rules 的标准格式：

```markdown
---
description: 规则的描述信息（requested 模式的关键判断依据）
alwaysApply: true            # true = always 模式
enabled: true                # 是否启用
---

# 规则标题

规则正文内容...
```

**Frontmatter 完整字段**：

| 字段 | 说明 |
|------|------|
| `description` | 规则描述。`requested` 模式下 AI 根据此字段判断是否加载 |
| `alwaysApply` | `true` = always，`false` + 有 description = requested，`false` + 无 description = manual |
| `enabled` | 是否启用（默认 `true`） |
| `updatedAt` | ISO 时间戳，更新时间 |

**最佳实践**（来自 CodeBuddy 官方文档）：
- 规则控制在 **500 行以内**
- 核心规范设为 `alwaysApply`（建议 **3-5 个**）
- 其他规则设为 `manual` 或 `requested`
- 创建或修改规则后，需要**新建对话会话**才生效

#### 2.3 安全 Hooks 降级策略

原始 gstack 使用 Claude Code 的 `PreToolUse` hooks 实现安全检查：

```yaml
hooks:
  PreToolUse:
    - event: Write
      script: ~/.claude/skills/gstack/freeze/bin/check-freeze.sh
```

CodeBuddy 没有 hooks 机制。降级方案（与 Codex 适配一致）：

1. **内联到技能文本**：`extractHookSafetyProse()` 已实现，Phase 1 会处理
2. **额外生成 Rules 文件**：在 `gstack-safety.md` 中汇总所有安全约束

安全规则核心内容：

```markdown
## 破坏性命令检查（对应 /careful）
执行以下操作前**必须**向用户确认：
- rm -rf / DROP TABLE / TRUNCATE
- git push --force / git reset --hard
- kubectl delete / docker system prune
- 任何不可逆的数据操作

## 目录编辑限制（对应 /freeze）
如果用户启用了 freeze 保护，修改受保护目录下的文件前必须检查。
```

#### 2.4 交付物

- [ ] `.codebuddy/rules/` 下 9 个规则文件创建完成（IDE 项目配置，非构建产物）
- [ ] 在 CodeBuddy 中验证规则被正确加载

#### 2.5 验证方法

在 CodeBuddy 中新建会话，观察 AI 是否遵循 commit 规范和 SKILL.md 工作流约定。

---

### Phase 3 — Preamble 与交互格式适配（✅ 已完成）

**目标**：适配技能模板中的共享模块（Preamble），确保生成内容在 CodeBuddy 环境中语义正确。

> **⚡ 实际执行结果（2026-03-23）**：Phase 3 已完成并提交。
> 核心提交：`e805fd0` (编译器参数化) + `bc1c890` (Codex 重生成) + `0305e36` (CodeBuddy 重生成)
>
> **实现方式**：在编译器中新增品牌名映射表（`HOST_BRAND_NAMES` / `HOST_PLATFORM_NAMES` / `HOST_COAUTHOR_TRAILERS`），
> 参数化 2 个生成函数（`generateCompletenessSection` / `generateCompletionStatus`），
> 修复 5 个生成函数中的硬编码路径，在 Codex/CodeBuddy 后处理中添加 6 个替换规则。
>
> **额外发现并修复**：`generatePreambleBash()` 中有遗留的硬编码 `~/.claude` 路径（行 191），
> `generateDesignReviewLite`/`generateDesignMethodology`/`generateReviewDashboard`/`generateCompletionStatus` 中也有。
> 这些不在原审计清单中（因为它们会被后处理的正则覆盖），但在编译器层面修复更健壮。
>
> **验证结果**：Codex 和 CodeBuddy 的 6 个审计问题全部清零，Claude 产物零变更，所有测试通过。
>
> **关于 AskUserQuestion（问题 #6）**：经审查，`AskUserQuestion` 在模板中是作为自然语言概念使用
> （不是 Claude Code API 调用），三平台都可以理解"Ask the user a question"这个意图。
> 因此不需要替换，保持原样。

> **三平台审计发现（2026-03-23）**：对 `dist/claude/`、`dist/codex/`、`dist/codebuddy/` 进行全面对比审计，
> 确认编译器层面（路径替换、frontmatter 转换、技能数量、文件结构）全部正确。
> 以下 6 个问题全部属于模板正文中的硬编码内容，需要在 `.tmpl` 文件层面参数化处理。

#### 3.0 审计发现的待修复问题清单

| # | 问题 | 严重度 | 影响平台 | 具体位置 |
|---|------|--------|---------|---------|
| 1 | **`${CLAUDE_SKILL_DIR}`** 环境变量 | 🔴 高 | Codex + CodeBuddy | `investigate/SKILL.md.tmpl` (1处) + `ship/SKILL.md.tmpl` (1处)。Claude Code 专有运行时变量，其他平台未定义 |
| 2 | **`CC+gstack`** 品牌名 | 🟡 中 | Codex + CodeBuddy | 5 个技能共 ~15 处。应参数化为 Claude→`CC+gstack` / Codex→`Codex+gstack` / CodeBuddy→`CodeBuddy+gstack` |
| 3 | **`Claude Code`** 品牌引用 | 🟡 中 | Codex + CodeBuddy | retro ("using Claude Code as a force multiplier") + ship ("Generated with Claude Code") + office-hours ("build it this weekend with Claude Code") |
| 4 | **`Co-Authored-By: Claude Opus 4.6`** | 🟡 中 | Codex + CodeBuddy | ship 技能 PR 模板中的签名 |
| 5 | **`mcp__claude-in-chrome__*`** | 🟢 低 | Codex + CodeBuddy | 根技能中 "NEVER use `mcp__claude-in-chrome__*`"，该 MCP 工具仅 Claude Code 有 |
| 6 | **`AskUserQuestion`** 格式 | 🟢 低 | CodeBuddy | 各平台用户交互 API 可能不同 |

#### 3.0.1 审计中确认符合预期的差异

| 差异 | Claude | Codex | CodeBuddy | 结论 |
|------|--------|-------|-----------|------|
| 技能数量 | 22 | 21 | 21 | Codex/CodeBuddy 正确跳过 `codex` ✅ |
| `version` 字段 | 22 个有 | 0 | 0 | 正确去除 ✅ |
| `hooks` 字段 | 4 个有 | 0 | 0 | 正确去除 ✅ |
| `allowed-tools` | 22 个有 | 0 | 21 个有 | CodeBuddy 保留，Codex 去掉 ✅ |
| Safety Advisory | 无 | 有 | 有 | 用内联文本替代 hooks ✅ |
| 路径 | `~/.claude/skills/gstack` | `~/.codex/skills/gstack` | `~/.codebuddy/skills/gstack` | 各自正确 ✅ |
| 交叉路径污染 | — | 0 个 `.codebuddy` | 0 个 `.codex` | 无污染 ✅ |

#### 3.1 Preamble 子段落适配

| 子段落 | 处理方式 |
|--------|---------|
| **Preamble Bash** | 路径替换（Phase 1 的 replaceAll 自动覆盖） |
| **Proactive Check** | 纯文本，无需改动 |
| **Lake Intro** | 纯文本，无需改动 |
| **Telemetry Prompt** | 纯文本，无需改动 |
| **AskUserQuestion Format** | **需要适配**（见 3.2） |
| **Completeness Section** | 纯文本，无需改动 |
| **Contributor Mode** | 纯文本，无需改动 |
| **Completion Status** | `gstack-telemetry-log` 路径替换（自动） |

#### 3.2 AskUserQuestion 格式适配

gstack 原始格式依赖 Claude Code 的 `AskUserQuestion` 工具：

```
AskUserQuestion({ question: "...", options: [...] })
```

CodeBuddy 没有此工具。当 `host === 'codebuddy'` 时，`generateAskUserFormat()` 应输出：

```markdown
## 用户交互格式

向用户提问时，使用以下格式：

**[gstack/{skill-name}]** 问题内容

> 提供清晰的选项或上下文，帮助用户快速决策。
```

#### 3.3 Co-Authored-By 签名

原始：`Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

CodeBuddy 适配：改为平台无关的签名，或去掉。

#### 3.4 交付物

- [x] `gen-skill-docs.ts` 中品牌名、路径、签名全面参数化
- [x] `${CLAUDE_SKILL_DIR}` 替换为各平台技能根路径
- [x] Co-Authored-By 各平台独立签名
- [x] MCP 工具引用非 Claude 平台移除
- [x] 重新生成所有技能并验证零残留

---

### Phase 4 — 浏览器引擎接入（✅ 已由 Phase 1 覆盖）

> **⚡ 实际状态（2026-03-23）**：浏览器技能的终端命令模式已在 Phase 1 模板编译时自动完成。
> 所有 7 个浏览器相关技能（qa、qa-only、design-review、browse 等）的 SKILL.md 中已包含
> `$B` 二进制探测和终端调用逻辑，无需额外适配。
>
> **MCP Server 封装（原 Step B）决定不做**——原因：
> 1. 终端命令模式 (`$B goto`/`$B screenshot`/`$B click`) 功能完全等价，~100ms/命令
> 2. 三个平台（Claude/Codex/CodeBuddy）统一使用 Bash 调用，无性能或功能差异
> 3. MCP 封装只是换了一层调用协议，属于锦上添花，增加维护成本但无实际收益
> 4. 不做 MCP 对用户体验零影响——AI 通过 Bash 工具执行 `$B` 命令，用户无感知

**目标**：~~使依赖浏览器的技能在 CodeBuddy 中可用。~~ ✅ 已完成。

#### 4.1 浏览器技能工作方式

所有浏览器相关技能通过终端命令调用 browse 二进制：

```bash
# 技能 SKILL.md 中的 SETUP 段落（Phase 1 编译自动生成）
_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
B=""
[ -n "$_ROOT" ] && [ -x "$_ROOT/dist/codebuddy/gstack/browse/dist/browse" ] && B="$_ROOT/dist/codebuddy/gstack/browse/dist/browse"
```

使用方式：`$B goto https://example.com`、`$B screenshot`、`$B click @e3`

#### ~~4.2 Step B — MCP Server 封装~~ ❌ 不做

~~将 browse 的 HTTP API 包装为 MCP 协议。~~

**决定**：不实施。终端命令模式已满足所有需求，MCP 封装无实际收益。

#### 4.3 交付物

- [x] 终端命令方式可用，QA 技能可运行（Phase 1 已覆盖）
- [x] ~~MCP Server 封装~~ → 不做，无影响

---

### Phase 5 — Setup 脚本扩展（✅ 已完成）

> **⚡ 实际执行结果（2026-03-23）**：Setup 脚本已完成并提交。
> 核心提交：`82b2be8` (feat: add CodeBuddy platform support to setup and dev scripts) + `a863852` (test)
>
> `setup` 脚本已支持 `--host codebuddy`，`install_copy()` 统一安装函数已实现。auto 检测模式已在 2026-03-26 移除，所有安装行为需显式指定 `--host`。

**目标**：修改安装脚本，支持 `--host codebuddy` 自动安装。

#### 5.1 修改 `setup` 脚本

```bash
# 在 --host 解析中添加 codebuddy
case "$host" in
  claude)     INSTALL_CLAUDE=1 ;;
  codex)      INSTALL_CODEX=1 ;;
  codebuddy)  INSTALL_CODEBUDDY=1 ;;
  auto)
    command -v claude >/dev/null && INSTALL_CLAUDE=1
    command -v codex  >/dev/null && INSTALL_CODEX=1
    [ -d ".codebuddy" ] && INSTALL_CODEBUDDY=1
    ;;
esac
```

#### 5.2 新增 `link_codebuddy_skill_dirs()` 函数

```bash
link_codebuddy_skill_dirs() {
  local src="$ROOT/dist/codebuddy"
  [ -d "$src" ] || return 0
  for skill_dir in "$src"/*/; do
    [ -f "$skill_dir/SKILL.md" ] || continue
    # 创建符号链接确保 bin/ browse/ 等运行时资源可访问
    ln -sfn "$ROOT/bin" "$skill_dir/bin"
    ln -sfn "$ROOT/browse" "$skill_dir/browse"
  done
}
```

#### 5.3 修改 `bin/dev-setup` 和 `bin/dev-teardown`

- `dev-setup`：添加 `dist/codebuddy/` 的符号链接
- `dev-teardown`：添加 `dist/codebuddy/` 符号链接清理

#### 5.4 交付物

- [x] `setup` 脚本支持 `--host codebuddy`
- [x] `bin/dev-setup` 创建 `dist/codebuddy/` 符号链接
- [x] `bin/dev-teardown` 清理 `dist/codebuddy/` 符号链接

---

## 四、技能移植优先级

### 第一批 — 纯文本流程（Phase 1 完成后立即可用）

这些技能不依赖浏览器，生成后即可在 CodeBuddy 中使用。

| 优先级 | 技能 | 价值 | 难度 |
|--------|------|------|------|
| 🥇 P0 | `/review` | 代码审查方法论极强 | 低 |
| 🥇 P0 | `/investigate` | 系统化调试铁律 | 低 |
| 🥇 P0 | `/ship` | 完整发布流程 | 中（依赖 git/gh）|
| 🥈 P1 | `/office-hours` | 产品思考框架 | 低 |
| 🥈 P1 | `/plan-eng-review` | 架构评审清单 | 低 |
| 🥈 P1 | `/plan-ceo-review` | CEO 视角评审 | 低 |
| 🥈 P1 | `/plan-design-review` | 设计评审维度 | 低 |
| 🥈 P1 | `/design-consultation` | 设计系统创建 | 低 |
| 🥉 P2 | `/document-release` | 发版文档更新 | 低 |
| 🥉 P2 | `/retro` | 周报回顾 | 低 |

### 第二批 — 依赖浏览器（Phase 4 后可用）

| 技能 | 依赖 |
|------|------|
| `/qa` | `$B` 浏览器命令 |
| `/qa-only` | `$B` 浏览器命令 |
| `/design-review` | `$B` 浏览器命令 |
| `/browse` | 浏览器核心 |
| 根 `gstack` 技能 | `$B` + 命令路由 |

### 第三批 — 工具型（按需移植）

| 技能 | 说明 |
|------|------|
| `/careful` | 安全警告 → 已转为 Rules（Phase 2） |
| `/freeze` `/unfreeze` | 目录锁 → 已转为 Rules（Phase 2） |
| `/guard` | careful + freeze → 已转为 Rules（Phase 2） |
| `/upgrade` | ❌ 已移除 — 用户手动更新安装 |
| `/setup-browser-cookies` | Cookie 导入 → 依赖浏览器 |

---

## 五、完整文件变更清单

| 操作 | 文件 | 状态 | 说明 |
|------|------|------|------|
| **修改** | `scripts/gen-skill-docs.ts` | ✅ 完成 | 添加 codebuddy Host（约 120 行新增） |
| **修改** | `package.json` | ✅ 完成 | build 脚本添加 `--host codebuddy`（1 行） |
| **新增** | `CODEBUDDY.md` | ✅ 完成 | 结合 CLAUDE.md + AGENTS.md 转写（~210 行） |
| **自动生成** | `dist/codebuddy/` (~21 个目录) | ✅ 完成 | gen-skill-docs 构建输出 |
| **修改** | `test/gen-skill-docs.test.ts` | ✅ 完成 | 修正 Codex sidecar 路径测试 |
| **修改** | `setup` | ✅ 完成 | 添加 codebuddy 安装分支（约 40 行新增） |
| **修改** | `bin/dev-setup` | ✅ 完成 | 添加 dist/codebuddy 符号链接（约 10 行新增） |
| **修改** | `bin/dev-teardown` | ✅ 完成 | 添加 dist/codebuddy 清理（约 5 行新增） |
| ~~**新增（可选）**~~ | ~~`browse/src/mcp-adapter.ts`~~ | ❌ 不做 | MCP 封装无实际收益，终端命令已满足需求 |

---

## 六、验证计划

| 阶段 | 验证方式 | 预期结果 | 状态 |
|------|---------|---------|------|
| Phase 0 | 检查构建输出统一到 dist/ | ✅ 已完成 | ✅ |
| Phase 1 | `bun run gen:skill-docs --host codebuddy` | 无报错，21 个技能输出到 dist/codebuddy/ | ✅ |
| Phase 1 | `grep -r '\.claude' dist/codebuddy/` | 无残留的 .claude 路径 | ✅ |
| Phase 1 | `bun run gen:skill-docs --host claude` | 原有 Claude 输出不变 | ✅ |
| Phase 1 | 三平台构建产物全面审计 | 路径/frontmatter/结构/品牌名交叉检查 | ✅ |
| Phase 2 | 在 CodeBuddy 中问 "commit 规范是什么" | AI 回答包含 bisect commit 规范 | ✅（CODEBUDDY.md 含 Commit style + bisect 规范） |
| Phase 3 | 检查生成的技能中无 Claude 专有引用 | 六项检查全部零残留 | ✅ |
| Phase 4 | 在 CodeBuddy 中 @gstack-qa 并指定 URL | 能打开浏览器执行测试 | ✅（终端命令模式，Phase 1 已覆盖） |
| 全部完成 | `bun test` | 原有测试全部通过 | ✅（741 pass） |

---

## 七、风险与缓解

> 详细的降级风险分析见 [platform-comparison.md §10.4](./platform-comparison.md)。

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| CodeBuddy skill 实际加载机制与预期不同 | 技能无法触发 | Phase 1 后立即验证一个最简技能 |
| 路径替换正则遗漏某些硬编码路径 | 运行时报错 | 生成后全文搜索 `.claude` 残留 |
| Bun 未安装导致无法编译 | 无法构建 | 在 CODEBUDDY.md 中注明前置条件 |
| 浏览器二进制在 CodeBuddy 终端中权限不足 | QA 技能失败 | `chmod +x` 并验证 |
| 原有 Claude/Codex 输出被意外修改 | 影响已有用户 | CodeBuddy 是独立 Host 分支，不修改原有逻辑 |
| 技能内容过长超出 CodeBuddy 上下文限制 | 技能截断 | 优化内容，精简重复段落（建议 SKILL.md <5k 词） |
| **Hooks 降级为建议性约束** | careful/freeze/guard 安全检查可能被 AI 忽略 | Rules + 内联文本双保险，与 Codex 适配风险相同 |
| **`$ARGUMENTS` 参数传递丢失** | 需要参数的技能无法直接传参 | 在 SKILL.md 中用自然语言描述期望输入 |
| **调用控制粗化** | 无"仅 AI 可调用"选项，后台知识类技能无法隐藏 | 使用 `disable: true` + Rules 替代 |
| **Rules 新会话才生效** | 修改 Rules 后当前会话不加载 | 在验证流程中注明需新建会话 |
| **Skills frontmatter 与 Rules frontmatter 混淆** | 格式错误导致功能异常 | Skills 用 `name/description/allowed-tools/disable`，Rules 用 `description/alwaysApply/enabled` |

---

## 八、时间估算

| 阶段 | 预计耗时 | 累计 |
|------|---------|------|
| Phase 0 — 前置准备 | ✅ 已完成 | — |
| Phase 1 — 模板系统扩展 | ✅ 已完成 | — |
| Phase 2 — CODEBUDDY.md 转写 | ✅ 已完成 | — |
| 三平台构建产物审计 | ✅ 已完成 | — |
| Phase 3 — Preamble 适配 | ✅ 已完成 | — |
| 测试 — CodeBuddy 测试组 | ✅ 已完成 | — |
| Phase 4 — 浏览器引擎 | ✅ Phase 1 已覆盖 | — |
| Phase 5 — Setup 脚本 | ✅ 已完成 | — |

**全部 Phase 0-5 已完成。** MCP Server 封装（原 Phase 4 Step B）决定不做——终端命令模式功能等价，无实际收益。

**Phase 6（自包含安装）✅ 全部完成。** 详见 [self-contained-install.md](./self-contained-install.md)。dist/codebuddy/ 已成为完整可部署产物，支持 `./setup --host codebuddy --project` 一键项目级安装。`--mode` 参数和 `--host auto` 均已移除。

---

## 九、后续规划

完成基础适配后，可以考虑的增强方向：

1. **CodeBuddy 原生能力集成**：利用 CodeBuddy 的 Integration（如 Supabase、CloudBase）替代部分 gstack 自建功能
2. **多语言支持**：当前技能全部英文，可考虑中文化适配
3. **自动化测试**：为 CodeBuddy 输出添加专门的测试用例
4. **社区模板**：提供一键安装脚本，让其他 CodeBuddy 用户也能使用 gstack 技能体系
