# Upstream Sync Rules

> 本文档定义 gstack-codebuddy 从上游 [gstack](https://github.com/garrytan/gstack) 迁移内容时**必须遵守的通用规则**。这些规则从过往改造经验中提炼而来，适用于每一次上游同步，不随具体版本变化。
>
> 创建日期：2026-03-31
> 状态：活跃文档，持续更新
> 关联文档：`upstream-sync-{序号}-v{版本号}.md`（具体版本的迁移分析与路线图，如 [upstream-sync-01-v0.14.3.md](./upstream-sync-01-v0.14.3.md)）

---

## 项目目录结构与内容归属

gstack-codebuddy 的目录结构已经过系统整理，与上游 gstack 有显著差异。**迁移上游内容时，不能照搬上游的目录结构，必须按本项目已建立的组织方式放置文件。**

### 目录职责

```
gstack-codebuddy/
├── skill-templates/           # 📝 Skill 模板源码（所有 .tmpl 文件）
│   ├── SKILL.md.tmpl          #   根 skill 模板
│   ├── office-hours/          #   每个 skill 一个子目录
│   ├── review/                #   包含 .tmpl + 辅助文件（.md, .sh）
│   └── ...
├── scripts/                   # 🔧 构建与开发工具链
│   ├── gen-skill-docs.ts      #   模板 → SKILL.md 生成器（核心）
│   ├── resolvers/             #   Placeholder resolver 模块（已批准拆分）
│   │   ├── index.ts           #     注册中心（placeholder → resolver 映射）
│   │   ├── preamble.ts        #     Preamble 相关 resolver
│   │   └── ...                #     其他 domain resolver
│   ├── skill-check.ts         #   Skill 健康检查
│   ├── dev-skill.ts           #   开发模式 watch
│   ├── verify-self-contained.sh # 自包含完整性检查
│   └── eval-*.ts              #   评估工具
├── bin/                       # 🔨 运行时 bin 脚本（部署到用户环境）
│   ├── gstack-*               #   各功能脚本
│   └── dev-setup / dev-teardown # 开发专用
├── browse/                    # 🌐 Headless 浏览器（独立 skill）
│   ├── src/                   #   TypeScript 源码
│   ├── test/                  #   Browse 专属测试
│   └── dist/                  #   编译产物
├── test/                      # 🧪 项目级测试
│   ├── helpers/               #   测试基础设施
│   ├── fixtures/              #   测试用例数据
│   └── *.test.ts              #   各类测试
├── dist/                      # 📦 构建输出（gitignored，由 build 生成）
│   ├── claude/                #   Claude Code 平台产物
│   ├── codex/                 #   Codex 平台产物
│   └── codebuddy/             #   CodeBuddy 平台产物
├── refactoring/               # 📋 重构文档与技术决策
├── docs/                      # 📖 用户文档
└── 根目录文件                   # 项目配置 + 用户说明
    ├── CODEBUDDY.md / CLAUDE.md / AGENTS.md  # 平台项目指令
    ├── README.md / CONTRIBUTING.md           # 用户文档
    ├── CHANGELOG.md / TODOS.md / VERSION     # 项目追踪
    ├── setup                                  # 安装脚本
    └── package.json / tsconfig.json           # 构建配置
```

### 上游内容归属映射

迁移上游内容时，按以下规则确定目标位置：

| 上游内容类型 | 上游位置（参考） | 本项目目标位置 | 注意 |
|------------|----------------|--------------|------|
| Skill 模板 | `skill-templates/*.tmpl` | `skill-templates/` | 结构一致，直接对应 |
| Resolver / 公共函数 | `scripts/resolvers/` | `scripts/resolvers/` | 已批准拆分（2026-03-31），允许模块化 resolver 目录 |
| bin 脚本 | `bin/` | `bin/` | 需在 `copyRuntimeAssets()` 的 `BIN_SCRIPTS` 注册 |
| Browse 功能 | `browse/src/` | `browse/src/` | 结构一致，但 browse 是独立 skill |
| 测试 | `test/` | `test/` | 遵循本项目的测试层级（Tier 1/2/3） |
| 根模板 | `CLAUDE.md` / `AGENTS.md` | 本项目已有自己的版本，**不覆盖** | 仅提取有价值的 prompt 改进 |
| 用户文档 | `README.md`, `docs/` | 不迁移 | 本项目有自己的品牌和内容 |
| 安装/更新脚本 | `setup`, `bin/gstack-update-check` | 按需适配 `setup` | 自更新机制属永久排除 |

### 关键原则

1. **新增目录需征得同意**。默认将上游新增内容归入本项目已有的目录结构。如果确有必要新增顶层目录，需**提出建议并说明理由，征得用户同意后执行**。已批准的变更记录在对应版本的迁移文档（`upstream-sync-{序号}-v{版本号}.md`）的"已批准的结构变更"表中。
2. **模块拆分需征得同意**。默认保持本项目已有的模块组织方式，不随上游拆分。但当内聚导致文件过于庞大（如 resolver 增长到数千行）或维护成本明显增加时，可以**提出拆分建议并说明理由，征得用户同意后执行**。已批准的变更同样记录在对应版本的迁移文档中。
3. **`dist/` 是纯输出目录**。绝不手动编辑 `dist/` 下的内容——所有变更都从 `skill-templates/` 和 `scripts/` 经构建流程生成。
4. **辅助文件跟随 skill 模板**。review 的 checklist、qa 的 templates 等辅助文件放在对应的 `skill-templates/{skill}/` 目录下，不放在顶层。

---

## 迁移规则

### 规则 1：平台适配三件套

每个从上游迁移的内容都必须经过三层适配：

**1a. Frontmatter 转换**

上游模板使用 Claude Code 格式的 frontmatter。迁移时必须按照 [platform-comparison.md §3.2](./platform-comparison.md) 的转换规则处理：

| 操作 | 字段 |
|------|------|
| 保留 | `name`（必需）, `description`（必需）, `allowed-tools`（可选） |
| 去掉 | `version`, `hooks`, `disable-model-invocation`, `user-invocable`, `argument-hint`, `model`, `effort`, `context`, `agent` |
| 新增 | `disable`（如需禁用） |

**1b. 路径替换**

所有 `.claude/skills/` 路径必须替换为 `$_GSTACK_ROOT` 变量引用（不是硬编码 `.codebuddy/skills/`）。这在 `gen-skill-docs.ts` 的后处理和 `replaceClaudePaths()` 公共函数中统一处理。

上游模板中的以下路径模式需要注意：
- `~/.claude/skills/gstack/...` → 编译器自动处理
- `.claude/skills/review/...` → 编译器自动处理
- `qa/templates/...`、`qa/references/...` → 需确认被 qa 路径替换规则覆盖
- 裸相对路径如 `review/TODOS-format.md` → **必须手动补上 `.claude/skills/` 前缀**才能被替换规则匹配（参见 [install-inconsistencies.md 问题 11](./install-inconsistencies.md)）

**1c. 品牌名和平台引用**

| 上游原文 | 替换为 |
|---------|--------|
| `CC+gstack` | 编译器通过 `HOST_BRAND_NAMES` 自动参数化 |
| `Claude Code` | 编译器自动处理 |
| `Co-Authored-By: Claude Opus 4.6` | `HOST_COAUTHOR_TRAILERS` 自动处理 |
| `mcp__claude-in-chrome__*` | 非 Claude 平台自动移除 |
| `${CLAUDE_SKILL_DIR}` | 已替换为 `$_GSTACK_ROOT`——新模板中如出现需同样处理 |
| `$ARGUMENTS` / `` !`command` `` | CodeBuddy 不支持，需改为自然语言描述 |

> **陷阱：隐式品牌引用**（来自 `e2e5a13` 的教训）
>
> 上游模板中除了显式的 "Claude Code" 外，还存在大量**缩写和嵌入引用**，不容易一眼发现：
> - `CC: ~Y`（工作量估算中的缩写）→ `{ShortBrand}: ~Y`
> - `shortcut with CC`、`seconds with CC` → 替换为 Host 简称
> - `With CC + gstack` → `With {BrandName}`
> - `[Claude Code](https://claude.com/claude-code)` → Host 链接（`HOST_PR_FOOTER_LINKS`）
>
> 迁移时应在完成显式替换后，用 `grep -i 'claude\|CC[^a-z]' dist/codebuddy/` 扫描是否有残留。注意替换顺序——包含 URL 的长模式必须先于短模式 `\bClaude Code\b`，否则 URL 会被截断产生乱码。

### 规则 2：Hooks 降级处理

上游新功能如果使用了 Claude Code hooks（`PreToolUse`、`PostToolUse` 等），必须降级处理：

```
Claude Code: hooks → shell script → exit code 2 = 强制阻止
    ↓ 降级
CodeBuddy: extractHookSafetyProse() 内联安全提示 + alwaysApply Rule（双保险）
```

- 编译器已有 `extractHookSafetyProse()` 函数，会自动将 hooks 转为 Safety Advisory 文本段
- 如果上游新增了 hook 类型，需要确认该函数能正确提取
- **已知风险**：降级后从"强制阻止"变为"建议性约束"，AI 可能不遵守。这与 Codex 适配的风险相同，是已接受的 trade-off

### 规则 3：跨 Bash Block 变量

CodeBuddy 的 `execute_command` 在**独立 shell 进程**中执行每个 bash block，变量不跨 block 持久化。这是 CodeBuddy 独有的问题，Claude Code 和 Codex 没有。

迁移上游模板时检查：

1. **模板中是否有跨 bash block 的变量引用？** 如果有，需要：
   - 在每个独立 bash block 中重新定义变量（参考 `plan-ceo-review`、`ship` 等已正确处理的模板）
   - 或使用 `{{STATE_DIR_ENV}}` placeholder 注入 `$_STATE_DIR` 检测代码
   - 或合并相邻的小 bash block 为一个

2. **`$_STATE_DIR` 和 `$B` 尤其常见**：Preamble 设置的这两个变量在后续 block 中**不存在**。已正确处理的模板会在每个 block 开头重新检测。

详见 [cross-block-env.md](./cross-block-env.md)。

### 规则 4：状态目录路径

gstack-codebuddy 已完成项目级状态目录迁移（[project-local-state.md](./project-local-state.md)），所有 `~/.gstack/` 硬编码路径已改为 `$_STATE_DIR`。

迁移上游模板时：
- **绝不直接使用上游的 `~/.gstack/` 路径**，必须替换为 `$_STATE_DIR`
- 涉及 `projects/$SLUG/` 的路径，在项目安装模式下去掉 `$SLUG` 分层（因为已在项目内）
- 环境变量统一为 `GSTACK_STATE_DIR`（不使用上游可能存在的 `GSTACK_HOME`）

### 规则 5：Browse 路径适配

gstack-codebuddy 已完成 browse 拆分（[browse-separation.md](./browse-separation.md)），browse 从 gstack 根 skill 的内嵌组件变为独立 skill。

迁移上游 browse 相关变更时：
- browse 二进制路径从 `gstack/browse/dist/browse` 变为 `browse/dist/browse`
- `{{BROWSE_SETUP}}` 探测链已更新，指向独立 skill 位置
- 上游根模板中的 browse 内容**不要迁移**（我们已经移除了根模板中的 browse 文档）

### 规则 6：运行时资源注册

上游新增的运行时资源（bin 脚本、辅助 markdown、browse 命令等）必须在 `gen-skill-docs.ts` 的 `copyRuntimeAssets()` 中注册，否则 `dist/` 产物不完整：

| 资源类型 | 注册位置 | 示例 |
|---------|---------|------|
| 新 bin 脚本 | `BIN_SCRIPTS` 数组 | `gstack-learnings-log` |
| 新 review 辅助文件 | `REVIEW_FILES` 数组 | `checklist.md` |
| 新 qa 辅助文件 | qa 复制逻辑 | `templates/*.md` |
| 新 browse 命令 | `browse/src/commands.ts` + rebuild | — |
| 新 snapshot flag | `browse/src/snapshot.ts` + rebuild | — |

同时需在 `test/self-contained.test.ts` 中添加对应的完整性断言。

### 规则 7：文档同步零负债

这是项目 `.codebuddy/rules/doc-sync.mdc` 中定义的**硬性规则**。每次迁移完成后，必须同步更新：

1. **upstream-sync-{序号}-v{版本号}.md** 的"已知差异清单"和"同步日志"
2. **CHANGELOG.md** — 用户视角的发布说明
3. **CODEBUDDY.md** — 如果新增了命令或改变了工作流
4. 被迁移内容涉及的所有 `refactoring/*.md` 中的状态标记

### 规则 8：测试验证

每次迁移后的验证层级：

```bash
# 必须 — 每次迁移都要跑
bun test                       # 基础验证 (免费, <2s)

# 涉及 gen-skill-docs.ts 或 resolver 时
bun run gen:skill-docs         # 重新生成所有 SKILL.md
git diff dist/                 # 确认输出变更符合预期
grep -r '\.claude' dist/codebuddy/  # 零 Claude 路径残留

# 涉及重要功能变更时
bun run test:evals             # 质量评估 (付费, diff-based)

# 涉及 dist/ 结构变更时
scripts/verify-self-contained.sh  # 41 项自包含完整性检查
```

### 规则 9：zsh 兼容性

> 来源：`b776da9` — 35 个文件中的 shell glob 在 zsh 下报错

macOS 默认 shell 是 **zsh**，而上游脚本可能以 bash 为假设编写。两者在关键行为上有差异：

| 行为 | bash | zsh（macOS 默认） |
|------|------|------------------|
| glob 无匹配时 | 返回原文字面量 | **报错退出** `no matches found` |
| 数组下标起始 | 0 | 1 |
| `source` 路径不存在 | 继续 | 报错 |

迁移上游 bin 脚本和模板中的 shell 代码时：
- **glob 必须处理无匹配情况**：用 `2>/dev/null` 抑制错误，或在 for 循环中加 `[ -e "$_d" ] || continue` 守卫
- 不要在用户空间代码中假设 bash——如果必须用 bash 特有功能，脚本开头写 `#!/usr/bin/env bash`
- `dist/*/gstack` 这种仅在开发仓库有意义的 glob 路径不应出现在用户面对的探测链中

### 规则 10：`dist/` 与 IDE 工作区职责隔离

> 来源：`b19a9ff` — 构建产物从 `.codebuddy/` 移至 `dist/`

```
dist/           → 构建输出（gen-skill-docs 产物）
.codebuddy/     → IDE 工作区（由 IDE 管理，setup 部署到这里）
```

**核心原则**：构建过程不应污染 IDE 工作区目录。上游如果有把构建产物直接写入 IDE 目录的做法，迁移时必须改为写入 `dist/`，再由 `setup` 脚本以文件复制的方式部署到 `.codebuddy/skills/`。

这一设计也意味着：
- `dist/` 在 `.gitignore` 中（不入库），由 `bun run build` 重新生成
- `.codebuddy/skills/gstack` 是部署结果，不是构建中间产物
- 开发模式（dev-setup）用 symlink 指回工作目录，但这是特殊情况，不影响设计原则

### 规则 11：去除自我宣传与偏见内容

> 来源：`a5d1420` — 系统清理了 README 和文档中的推销性内容

上游文档中可能包含以下内容，迁移时**必须删除或改写为客观描述**：

- 个人简介、创作者宣传（"我是 XXX"、个人经历）
- 不可验证的数据声明（"10 万行代码"、效率提升百分比）
- GitHub contribution 截图、社交媒体链接
- 招聘广告、社区号召
- 第一人称吹嘘（"This is my XXX mode"、名人引用 name-drop）
- 任何形式的 celebrity endorsement 或 social proof

**原则**：迁移后的文档应该是**技术性的、客观的、对用户有用的**。保留功能描述，删除推销话术。

#### 品牌中性化的三个粒度层次

> 来源：Phase 0-3.3 实战经验 — 品牌中性化并非单一操作，需按粒度分层处理

规则 1c 处理"平台品牌参数化"，规则 11 处理"去除自我宣传"。但实际操作中，品牌相关内容存在**三个不同粒度层次**，各有不同的处理方式：

| 粒度 | 含义 | 上游原文示例 | 处理方式 | 处理位置 |
|------|------|------------|---------|---------|
| **L1: 平台品牌** | AI 平台本身的名称 | "Claude Code"、"CC:" | 编译器通过 `HOST_*` 映射表自动参数化 | `gen-skill-docs.ts` / 后处理 |
| **L2: 产品角色** | 带品牌前缀的功能角色 | "Claude subagent"、"CLAUDE SUBAGENT" | 去掉品牌前缀，只保留角色名 → "subagent"、"SUBAGENT" | 模板 / resolver 中手动处理 |
| **L3: 个人品牌/内容标签** | 创作者个人品牌或带倾向性的内容分类 | "GARRY TAN VIDEOS"、"LIGHTCONE PODCAST"、"YC BACKSTORY" | 替换为通用、中立的类别名 → "STARTUP VIDEOS"、"STARTUP PODCASTS"、"FOUNDER STORIES" | 模板中手动处理 |

**关键区别**：
- **L1 是自动化的**——编译器已有完善的映射表，通常不需要人工干预。
- **L2 和 L3 是手动的**——编译器无法自动判断"Claude subagent"应该变成"subagent"还是完全删除，需要迁移者逐案处理。
- **L2 保留功能语义**——角色名本身有技术含义（"subagent" 是功能描述），只是去掉品牌修饰。
- **L3 替换为中立等价物**——内容标签没有技术必要性，需要找到通用的替代分类。

**操作建议**：迁移时遇到品牌相关内容，先判断属于哪个层次，再选择对应的处理方式。L2 和 L3 的处理结果应在 PR 描述中明确列出，方便 review。

### 规则 12：`--host` 参数显式化

> 来源：`0ea0f43` — 防止 setup 默认安装到 claude 目录

上游 setup 脚本默认 `--host` 为 `claude`。gstack-codebuddy 要求**必须显式指定 `--host`**，否则报错退出。

迁移上游 setup/安装相关的逻辑时：
- 不接受 `--host auto` 检测（已废弃，见 `37f1ccd`）
- 不接受默认值——用户必须明确知道自己安装到哪个平台
- `--mode` 参数已废弃（所有安装都是物理复制，见 `7212856`）

---

## 永久排除清单

以下功能**永不迁移**，无论上游如何演进。在评估上游变更时，凡是属于这些类别的内容直接跳过，无需逐条讨论。

| 类别 | 涉及的上游内容 | 排除原因 |
|------|-------------|---------|
| **自更新机制** | `/gstack-upgrade` skill、`bin/gstack-update-check`、版本检查逻辑 | gstack-codebuddy 的安装和更新由 CodeBuddy IDE 的 skill 安装流程管控，不需要 gstack 自带的自更新机制。本地仓库中该功能已删除 |
| **符号链接管理** | `bin/gstack-relink`、`bin/gstack-uninstall`、符号链接创建/修复逻辑 | gstack-codebuddy 采用**绿色拷贝安装**——`dist/` 产物通过文件复制部署到 `.codebuddy/skills/`，不使用符号链接。安装方式轻量、干净、可预测，不需要符号链接重建/修复工具 |
| **遥测与社区数据** | `bin/gstack-community-*`、Supabase 遥测同步、使用数据上报、社区统计 | 不收集也不推送任何遥测/使用数据到远程。这是隐私和简洁性的设计决策 |
| **Chrome 扩展** | `/connect-chrome` skill、`browse/src/activity.ts`、`browse/src/sidebar-*.ts` | 绑定 Chrome 扩展，Claude Code 专属功能 |

**判断原则**：如果上游新增内容的核心目的是服务上述任何一个类别，直接标记为 ❌ 跳过。如果上游内容仅**部分涉及**这些类别（如一个有价值的 resolver 中嵌入了遥测调用），迁移时**剥离相关代码**后再引入。

---

## 变更分类框架

将上游变更按以下四象限分类，决定迁移策略：

```
                    高价值
                      │
         ┌────────────┼────────────┐
         │  P1: 立即  │  P2: 改造  │
 低难度 ──┤   迁移     │   后迁移   ├── 高难度
         │            │            │
         ├────────────┼────────────┤
         │  P3: 择机  │  P4: 观望  │
         │   迁移     │   或跳过   │
         └────────────┼────────────┘
                      │
                    低价值
```

| 象限 | 典型内容 | 迁移策略 |
|------|---------|---------|
| **P1: 立即迁移** | Skill 模板 prompt 优化、bug 修复、通用 resolver、文档改进 | 直接迁移，应用规则 1-12 |
| **P2: 改造后迁移** | 依赖 Claude hooks 的新 skill、架构重构、需要新基础设施的功能 | 先评估改造成本，再按规则适配 |
| **P3: 择机迁移** | 辅助 bin 脚本、次要文档、运维工具 | 低优先级，有空余时间时处理 |
| **P4: 观望或跳过** | 品牌设计系统、其他无直接用户价值的内容 | 持续观察，除非战略方向变化否则不迁移 |
| **❌ 永久排除** | 自更新机制、符号链接管理、遥测/社区数据、Chrome 扩展 | 见上方"永久排除清单"，无需讨论直接跳过 |

---

## 上游同步操作清单（Checklist）

每次从上游同步内容时，按此清单逐项检查：

### 迁移前

- [ ] 阅读上游 commit message 和 CHANGELOG，理解变更目的
- [ ] 判断变更属于 P1/P2/P3/P4 哪个象限
- [ ] 确认变更不属于"永久排除清单"中的类别（自更新、符号链接管理、遥测/社区数据、Chrome 扩展）
- [ ] 确认变更不依赖我们已跳过的功能
- [ ] 检查变更涉及的 `{{PLACEHOLDER}}` 在我们的编译器中是否已注册

### 迁移中

- [ ] **规则 1**：Frontmatter 转换（去掉 `version`/`hooks` 等，保留 `name`/`description`/`allowed-tools`）
- [ ] **规则 1**：路径替换（裸相对路径补 `.claude/skills/` 前缀，让后处理能匹配）
- [ ] **规则 1**：品牌名参数化（确认被 `HOST_BRAND_NAMES` 等映射覆盖，包括隐式缩写如 `CC:`）
- [ ] **规则 2**：如有 hooks，确认 `extractHookSafetyProse()` 能正确提取
- [ ] **规则 3**：检查跨 bash block 变量依赖，必要时添加 `{{STATE_DIR_ENV}}` 或重复检测
- [ ] **规则 4**：将 `~/.gstack/` 替换为 `$_STATE_DIR`
- [ ] **规则 5**：browse 相关路径使用独立 skill 位置
- [ ] **规则 6**：新增的运行时资源在 `copyRuntimeAssets()` 中注册
- [ ] **规则 9**：shell 代码 zsh 兼容（glob 无匹配处理、不假设 bash 行为）
- [ ] **规则 10**：构建产物写入 `dist/`，不直接写入 `.codebuddy/`
- [ ] **规则 11**：文档中的自我宣传/偏见内容已清理
- [ ] **规则 12**：安装/setup 相关逻辑不依赖默认 `--host`

### 迁移后

- [ ] **规则 8**：`bun test` 全部通过
- [ ] **规则 8**：`bun run gen:skill-docs` + `grep -r '\.claude' dist/codebuddy/` 零残留
- [ ] **规则 8**：隐式品牌引用扫描 `grep -i 'claude\|CC[^a-z]' dist/codebuddy/`
- [ ] **规则 8**：如涉及 dist/ 结构变更，跑 `scripts/verify-self-contained.sh`
- [ ] **规则 7**：更新 upstream-sync-{序号}-v{版本号}.md 的"已知差异清单"和"同步日志"
- [ ] **规则 7**：更新 CHANGELOG.md

---

## 持续跟踪流程

### 定期检查（建议每 2-4 周）

```bash
# 1. 更新上游代码
cd ~/workspace/github/gstack
git pull

# 2. 查看上游版本变化
cat VERSION

# 3. 查看新增/修改的关键文件
git log --oneline --since="4 weeks ago" --name-only

# 4. 重点关注这些路径的变更
git log --oneline --since="4 weeks ago" -- \
  skill-templates/ \
  scripts/resolvers/ \
  browse/src/ \
  bin/
```

### 评估清单

对每个上游变更，回答以下问题：

1. **这解决了什么问题？** — 阅读 commit message 和 CHANGELOG
2. **我们的用户会遇到同样的问题吗？** — 如果不会，跳过
3. **CodeBuddy 能支持这个功能吗？** — 如果依赖 Claude 特有能力，评估改造成本
4. **引入难度如何？** — 是独立模块还是需要改动多处
5. **有没有测试覆盖？** — 没有测试的功能谨慎引入

---

## 通用风险与注意事项

### 路径替换的三个陷阱

从 [install-inconsistencies.md 问题 8/9/11](./install-inconsistencies.md) 总结：

| 陷阱 | 案例 | 应对 |
|------|------|------|
| **裸相对路径** | `review/TODOS-format.md` 无法被替换规则匹配 | 模板中必须写全 `.claude/skills/review/TODOS-format.md` |
| **替换规则遗漏 Host** | qa/ 路径替换只在 codebuddy 块中 | 所有路径替换放在公共位置，三个 Host 共享 |
| **替换顺序** | 通用规则先于精确规则执行导致错误匹配 | `replaceClaudePaths()` 按从具体到通用的顺序替换 |

### 历史教训：幽灵引用

在 [install-inconsistencies.md](./install-inconsistencies.md) 中记录了上游规划了但从未实现的功能（如 Supabase 遥测同步）在文档中留下大量虚假引用的问题。迁移上游内容时，必须**验证引用的文件/脚本实际存在**，不要信任上游文档中的"已完成"标记——用代码验证。

### 历史教训：上游注释与代码的不一致（Code-Comment Drift）

> 来源：Phase 1.4 — `SKILL_TIER_MAP` 注释说"未激活"，但代码实际已在赋值 tier

上游代码中的**注释有时与实际行为不符**。迁移时不能盲信上游注释——必须**读代码确认实际行为**。

已遇到的案例：
- 代码注释说某功能"NOT yet activated"，但该功能的赋值逻辑已完整工作
- 上游文档说某字段"reserved for future use"，但多个 resolver 已在使用
- 内联注释描述的参数数量与函数签名不一致

**操作要求**：
1. **以代码为准**——注释和 README 仅作为理解上下文的辅助，不作为行为判断的依据
2. **当注释与代码矛盾时**——按代码的实际行为迁移，不要按注释描述的"应有行为"迁移
3. **如果上游注释误导性强**——在我们的代码中修正注释，避免同样的陷阱传递给后续维护者

这与"幽灵引用"问题互补——前者是文档引用了不存在的实现，此处是注释错误描述了已存在的实现。两者的共同教训：**验证优先，不信任文本描述**。

### 平台能力差异表

| 能力 | Claude Code | Codex | CodeBuddy | 迁移影响 |
|------|:----------:|:-----:|:---------:|---------|
| Hooks（前置/后置命令） | ✅ | ❌ | ❌ | 降级为文本约束（规则 2） |
| `$ARGUMENTS` 参数传递 | ✅ | ❌ | ❌ | 改为自然语言描述（规则 1c） |
| `${CLAUDE_SKILL_DIR}` | ✅ | ❌ | ❌ | 替换为 `$_GSTACK_ROOT`（规则 1b） |
| Shell 环境跨 block 持久化 | ✅ | ✅ | ❌ | 每个 block 重新检测（规则 3） |
| 沙盒文件系统 | ❌ | ✅ | ❌ | 不影响 |
| MCP 工具协议 | ✅ | ✅ | 部分 | 按需评估 |
| 内置浏览器预览 | ❌ | ❌ | ✅ | CodeBuddy 独有优势 |
| 多 Agent 协作 | ❌ | ❌ | ✅ | CodeBuddy 独有优势 |
| Automations | ❌ | ❌ | ✅ | CodeBuddy 独有优势 |

### macOS 默认 shell 差异

`b776da9` 的教训：上游在 bash 环境中测试的 shell glob（如 `dist/*/gstack`）在 zsh 上会直接报错退出，影响了 35 个文件。macOS 用户群体占比高，所有迁移的 shell 代码必须在 zsh 下测试。详见规则 9。

### 品牌替换的长尾效应

`e2e5a13`、`3a0d80d` 的教训：品牌参数化不是一次性的。每次上游更新模板，可能引入新的 Claude 引用形式。已发现的变体包括：
- 显式全称：`Claude Code`
- 缩写：`CC`（出现在工作量估算、快捷键描述中）
- 嵌入链接：`[Claude Code](https://claude.com/claude-code)`
- 协作者签名：`Co-Authored-By: Claude Opus 4.6`
- MCP 工具引用：`mcp__claude-in-chrome__*`

每次迁移后必须跑品牌隔离扫描，不能假设"编译器已经处理了所有情况"。
