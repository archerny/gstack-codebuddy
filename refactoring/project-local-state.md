# 项目级运行时状态目录

> 状态: ✅ 已完成
> 优先级: P1
> 影响范围: ~40 个文件已改动，涉及 ~90 处 `~/.gstack` 引用
> 创建日期: 2026-03-26
> 最后更新: 2026-03-27（全部 5 个 Phase 实施完成，bun test 全部通过）

## 1. 问题陈述

当前 gstack 运行时状态存储在用户全局目录 `~/.gstack/`，包括配置、遥测、设计文档、review 日志、freeze 状态等。即使用 `--project` 安装到项目本地，运行时数据仍然写到全局目录。

**核心原则：状态目录跟随安装方式**

gstack 有两种安装模式，状态目录应该与安装方式一致：

| 安装方式 | 安装命令 | Skill 位置 | 状态目录 |
|---------|---------|-----------|---------|
| **全局安装** | `./setup --host codebuddy` | `~/.codebuddy/skills/gstack/` | `~/.gstack/` |
| **项目安装** | `./setup --host codebuddy --project` | `<project>/.codebuddy/skills/gstack/` | `<project>/.gstack/` |

- 全局安装的 gstack → 运行时状态存储在 **`~/.gstack/`**（与现在一样，无变化）
- 项目安装的 gstack → 运行时状态存储在 **`<project>/.gstack/`**（本方案的改动）
- 非 git 环境（无论安装方式）→ 回退到 **`~/.gstack/`**

**用户期望**：如果我选择了项目安装（`--project`），工具应该保持纯粹——所有运行时状态都在项目目录内，不污染全局 `$HOME`。如果我选择了全局安装，则保持全局目录，这是合理的。

**参考实现**：`browse/src/config.ts` 已经完成了项目级迁移——通过 `git rev-parse --show-toplevel` 检测项目根目录，将状态写入 `<project>/.gstack/browse.json`，并自动将 `.gstack/` 添加到 `.gitignore`。这是本方案的参考模式。

## 2. 现状分析

### 2.1 当前全局目录结构

```
~/.gstack/                              ← 全局（需迁移到项目级）
├── config.yaml                         # 全局配置（telemetry 等）
├── freeze-dir.txt                      # freeze 锁定目录
├── greptile-history.md                 # 全局 Greptile 分诊历史
├── .completeness-intro-seen            # 一次性标记
├── .telemetry-prompted                 # 遥测提示标记
├── analytics/
│   ├── skill-usage.jsonl               # 遥测数据
│   ├── .pending-{session-id}           # 运行中 session 标记
│   ├── .session-tel-start              # 跨 block 遥测开始时间（cross-block-env 方案）
│   └── .session-id                     # 跨 block session ID（cross-block-env 方案）
├── sessions/
│   └── {PPID}                          # 并发 session 追踪（120分钟 TTL）
├── projects/
│   └── {owner-repo}/                   # 按项目分组
│       ├── greptile-history.md         # 项目级 Greptile 历史
│       ├── *-design-*.md               # office-hours 设计文档
│       ├── *-test-plan-*.md            # plan-eng-review 测试计划
│       ├── *-test-outcome-*.md         # QA 测试结果
│       ├── *-design-audit-*.md         # design-review 审计报告
│       ├── {branch}-reviews.jsonl      # ship/review 审查日志
│       └── ceo-plans/                  # plan-ceo-review 计划
│           ├── {date}-{slug}.md
│           └── archive/
└── contributor-logs/
    └── {slug}.md                       # 贡献者 bug 报告

~/.gstack-dev/                          ← 开发者专用（不在此方案范围内）
├── evals/                              # eval 结果
├── e2e-runs/                           # E2E 运行日志
├── e2e-live.json                       # E2E 心跳
└── plans/                              # 本地规划文档
```

### 2.2 目标目录结构

```
<project>/.gstack/                      ← 项目级（.gitignore 排除）
├── config.yaml                         # 项目级配置
├── freeze-dir.txt                      # freeze 状态
├── greptile-history.md                 # 项目级 Greptile 历史
├── .completeness-intro-seen            # 一次性标记
├── .telemetry-prompted                 # 遥测提示标记
├── analytics/
│   ├── skill-usage.jsonl               # 遥测数据
│   ├── .pending-{session-id}           # 运行中 session 标记
│   ├── .session-tel-start              # 跨 block 遥测开始时间
│   └── .session-id                     # 跨 block session ID
├── sessions/
│   └── {PPID}                          # 并发 session 追踪
├── projects/                           # 项目文档（不再按 slug 分组）
│   ├── *-design-*.md
│   ├── *-test-plan-*.md
│   ├── *-test-outcome-*.md
│   ├── *-design-audit-*.md
│   ├── {branch}-reviews.jsonl
│   └── ceo-plans/
├── contributor-logs/
│   └── {slug}.md
├── browse.json                         # browse 服务器状态（已经是项目级）
├── browse-console.log                  # browse 日志（已经是项目级）
├── browse-network.log
├── browse-dialog.log
├── qa-reports/                         # QA 报告（已经是项目级）
├── design-reports/                     # design-review 报告（已经是项目级）
└── test-transcripts/                   # E2E 测试转录（已经是项目级）
```

### 2.3 设计决策

#### Q1: `projects/` 子目录是否还需要按 slug 分组？

**不需要**（仅限项目安装模式）。既然状态已经在项目内，`projects/` 下直接存放文档即可，无需 `{owner-repo}/` 子目录。全局安装模式下保持现有的 `projects/{slug}/` 结构不变。
- 旧路径（全局模式）: `~/.gstack/projects/{slug}/{user}-{branch}-design-*.md` — **不变**
- 新路径（项目模式）: `<project>/.gstack/projects/{user}-{branch}-design-*.md` — 去掉 slug 层
- **影响**：项目模式下 `gstack-review-log`、`gstack-review-read` 不再需要调用 `gstack-slug` 获取 SLUG

#### Q2: 全局 greptile-history 聚合怎么办？

当前 `review/greptile-triage.md` 同时写入 per-project 和 global 两个路径，`/retro` 读取全局路径做跨项目聚合。改为项目级后：
- 项目安装：每个项目有自己的 `<project>/.gstack/greptile-history.md`，不写全局路径
- 全局安装：保持写入 `~/.gstack/projects/{slug}/greptile-history.md` + `~/.gstack/greptile-history.md`（行为不变）
- 如果用户需要跨项目聚合，那是后续功能

#### Q3: config.yaml 是全局还是项目级？

**跟随安装方式**。
- 全局安装 → `~/.gstack/config.yaml`（不变）
- 项目安装 → `<project>/.gstack/config.yaml`（用户在不同项目可以有不同配置，如不同的 telemetry 级别）

#### Q4: `~/.gstack-dev/` 是否迁移？

**不迁移**。这是纯开发者基础设施（evals、E2E 日志），与用户运行时无关，保持全局。共 33 处引用，分布在 15 个文件中，全部保持不变。

#### Q5: 非 git 环境如何回退？

回退到 `$HOME/.gstack`。原因：非 git 目录没有明确的"项目根"，使用 `$PWD` 会导致 cd 后路径断裂。

#### Q6: 全局安装的 gstack 状态目录是什么？

**保持 `~/.gstack/`，不做任何变化。**

这是本方案的核心设计决策：**状态目录跟随安装方式，不是跟随运行环境。**

判定依据：运行时可以通过 `$_GSTACK_ROOT` 探测链的结果来判断安装方式。`$_GSTACK_ROOT` 的 3 级探测链已经区分了全局安装和项目安装：

```
Priority 1: 项目本地 dist/ 自包含安装  → $_GSTACK_ROOT = "$_ROOT/dist/<host>/gstack"    → 项目安装
Priority 2: 项目本地 skills/ 安装      → $_GSTACK_ROOT = "$_ROOT/.<host>/skills/gstack"  → 项目安装
Priority 3: 用户全局 skills/ 安装      → $_GSTACK_ROOT = "$HOME/.<host>/skills/gstack"   → 全局安装
```

因此 `$_STATE_DIR` 检测逻辑应**复用 `$_GSTACK_ROOT` 的结果**，而非独立做 git root 检测：

```bash
# $_STATE_DIR 检测逻辑（依赖 $_GSTACK_ROOT 探测链的结果）
_STATE_DIR="${GSTACK_STATE_DIR:-}"
if [ -z "$_STATE_DIR" ]; then
  _ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
  # 如果 gstack 安装在项目本地（Priority 1 或 2 命中），状态也在项目内
  if [ -n "$_ROOT" ] && [ -n "$_GSTACK_ROOT" ] && case "$_GSTACK_ROOT" in "$_ROOT"*) true;; *) false;; esac; then
    _STATE_DIR="$_ROOT/.gstack"
  else
    # 全局安装 或 非 git 环境：使用全局路径
    _STATE_DIR="$HOME/.gstack"
  fi
fi
```

**关键**：`case "$_GSTACK_ROOT" in "$_ROOT"*) true` 检查 `$_GSTACK_ROOT` 是否以项目根路径开头。如果是（Priority 1 或 2 命中），说明 gstack 安装在项目本地，状态也应在项目内。否则（Priority 3 命中或 `$_GSTACK_ROOT` 为空），使用全局路径。

### 2.4 关键架构发现

#### 两套路径体系的统一

gstack 存在两套独立的路径体系：

1. **Skill/工具安装路径**（`$_GSTACK_ROOT`）：已有 3 级探测链（项目本地 dist/ → 项目本地 skills/ → 全局 skills/），由 `self-contained-install.md` Phase 6 完成
2. **运行时状态路径**（`~/.gstack/`）：全部硬编码，无动态探测机制

**本方案的核心设计：不需要独立的状态目录探测链。** `$_GSTACK_ROOT` 的探测结果已经包含了"全局安装 vs 项目安装"的信息——只需检查 `$_GSTACK_ROOT` 是否以项目根路径开头。这样状态目录的决策**复用已有的安装探测链**，逻辑更简单，也不可能出现"安装在全局但状态在项目内"的不一致情况。

`HOST_PATHS` 接口只定义了 `skillRoot`、`localSkillRoot`、`binDir`、`browseDir`——**不包含 `stateDir`**。gen-skill-docs.ts 中不存在 `STATE_DIR` 相关字符串。迁移后：
- **不需要**在 `HOST_PATHS` 中新增 `stateDir` 字段
- 在 preamble bash 中引入 `$_STATE_DIR` 变量，基于 `$_GSTACK_ROOT` 推导

#### 三套不统一的环境变量

| 环境变量 | 使用者 | 影响 |
|---------|--------|------|
| `GSTACK_STATE_DIR` | `gstack-config`、`gstack-telemetry-log`、`gstack-analytics` | 3 个 bin 脚本 |
| `GSTACK_HOME` | `gstack-review-log`、`gstack-review-read` | 2 个 bin 脚本 |
| `CLAUDE_PLUGIN_DATA` | freeze/guard/investigate/unfreeze 模板 | 5 个模板中的 freeze-dir.txt 路径 |

设置一个不影响另外两个。迁移后统一为 `GSTACK_STATE_DIR`。

#### browse/ 模块是完成迁移的参考实现

- 使用 `git rev-parse --show-toplevel` + `<project>/.gstack/`
- `ensureStateDir()` 自动将 `.gstack/` 添加到 `.gitignore`
- 零全局路径依赖

## 3. 全量审计结果

以下是基于 2026-03-27 两轮独立全量代码搜索（含交叉对比）的精确清单。

### 3.1 已经正确的部分 ✅

| 组件 | 说明 |
|------|------|
| `browse/src/config.ts` | 使用 `git rev-parse --show-toplevel` + `<project>/.gstack/`，自动更新 `.gitignore` |
| `browse/src/server.ts` | 通过 `BROWSE_STATE_FILE` env 传递项目级路径 |
| `browse/src/cli.ts` | 通过 `resolveConfig()` 使用项目级路径 |
| `.gstack/qa-reports/` | 已经是项目本地 |
| `.gstack/design-reports/` | 已经是项目本地 |
| `.gstack/test-transcripts/` | 已经是项目本地 |
| `.gstack/no-test-bootstrap` | 已经是项目本地 |
| `bin/dev-setup` | 仅操作仓库内部，无 `~/.gstack/` 引用 |
| `bin/dev-teardown` | 同上 |
| `bin/gstack-diff-scope` | 无状态目录依赖 |
| `bin/gstack-slug` | 无状态目录依赖 |
| `bin/remote-slug` | 无状态目录依赖（注释提及 `~/.gstack/projects/`，仅需更新注释） |
| `~/.gstack-dev/` | 开发者基础设施，保持全局不迁移 |

### 3.2 `setup` 脚本（1 处）

| 行号 | 问题 | 改动 |
|------|------|------|
| 185-186 | `mkdir -p "$HOME/.gstack/projects"` — 无条件创建全局目录 | 删除（运行时状态由各 bin 脚本按需创建） |

### 3.3 `bin/` 脚本（5 个文件）

#### 环境变量不统一问题

| 脚本 | 当前变量 | 当前默认值 |
|------|---------|-----------|
| `gstack-config` | `GSTACK_STATE_DIR` | `$HOME/.gstack` |
| `gstack-telemetry-log` | `GSTACK_STATE_DIR` | `$HOME/.gstack` |
| `gstack-analytics` | `GSTACK_STATE_DIR` | `$HOME/.gstack` |
| `gstack-review-log` | `GSTACK_HOME` | `$HOME/.gstack` |
| `gstack-review-read` | `GSTACK_HOME` | `$HOME/.gstack` |

**问题**：两套不同的环境变量名（`GSTACK_STATE_DIR` vs `GSTACK_HOME`），设置一个不影响另一个。

**方案**：统一为 `GSTACK_STATE_DIR`，全部脚本使用相同的路径检测逻辑。

bin 脚本无法直接复用 `$_GSTACK_ROOT`（这是 preamble 中的 bash 变量，不是环境变量），但可以用相同的探测逻辑——检查项目本地是否有 gstack 安装来判断安装方式：

```bash
# 新的标准化路径检测（内联到每个 bin 脚本）
STATE_DIR="${GSTACK_STATE_DIR:-}"
if [ -z "$STATE_DIR" ]; then
  _PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
  if [ -n "$_PROJECT_ROOT" ]; then
    # 检查 gstack 是否安装在项目本地（与 $_GSTACK_ROOT 探测链 Priority 1 & 2 对应）
    _IS_LOCAL=0
    for _d in dist/*/gstack .claude/skills/gstack .codebuddy/skills/gstack .agents/skills/gstack; do
      [ -d "$_PROJECT_ROOT/$_d/bin" ] && _IS_LOCAL=1 && break
    done
    if [ "$_IS_LOCAL" -eq 1 ]; then
      STATE_DIR="$_PROJECT_ROOT/.gstack"
    else
      STATE_DIR="$HOME/.gstack"
    fi
  else
    STATE_DIR="$HOME/.gstack"
  fi
fi
```

**逻辑说明**：
- 如果在 git 仓库内，且项目本地有 gstack 安装（任一 host 的 skill 目录存在）→ 使用 `<project>/.gstack/`
- 如果在 git 仓库内，但 gstack 是全局安装的（项目本地没有 skill 目录）→ 使用 `~/.gstack/`
- 如果不在 git 仓库内 → 使用 `~/.gstack/`
- `GSTACK_STATE_DIR` 环境变量覆盖始终是最高优先级（测试隔离依赖此机制）

#### 各脚本具体读写

| 脚本 | 读取 | 写入 |
|------|------|------|
| `gstack-config` | `$STATE_DIR/config.yaml` | `$STATE_DIR/config.yaml` |
| `gstack-telemetry-log` | `analytics/.pending-*`, `sessions/`, `config.yaml`, `VERSION` | `analytics/skill-usage.jsonl`, 删除 `.pending-*` |
| `gstack-analytics` | `analytics/skill-usage.jsonl` | （无，只读） |
| `gstack-review-log` | （无） | `projects/$SLUG/$BRANCH-reviews.jsonl` → 改为 `projects/$BRANCH-reviews.jsonl` |
| `gstack-review-read` | `projects/$SLUG/$BRANCH-reviews.jsonl` → 改为 `projects/$BRANCH-reviews.jsonl` | （无，只读） |

**额外改动**：`gstack-review-log` 和 `gstack-review-read` 不再需要调用 `gstack-slug` 获取 `$SLUG`，因为项目级目录下 `projects/` 直接按 branch 组织。

### 3.4 `scripts/gen-skill-docs.ts` Preamble（15 处硬编码路径）

所有路径在 `generatePreambleBash()`、`generateLakeIntro()`、`generateTelemetryPrompt()`、`generateCompletionStatus()`、`generateContributorMode()`、`generateDesignMethodology()` 函数中。

| 函数 | 行号 | 路径 | 操作 | 改为 |
|------|------|------|------|------|
| `generatePreambleBash` | 204 | `~/.gstack/sessions` | mkdir | `$_STATE_DIR/sessions` |
| | 205 | `~/.gstack/sessions/"$PPID"` | touch | `$_STATE_DIR/sessions/"$PPID"` |
| | 206 | `~/.gstack/sessions` | find (count) | `$_STATE_DIR/sessions` |
| | 207 | `~/.gstack/sessions` | find -delete | `$_STATE_DIR/sessions` |
| | 213 | `~/.gstack/.completeness-intro-seen` | 读取检测 | `$_STATE_DIR/.completeness-intro-seen` |
| | 216 | `~/.gstack/.telemetry-prompted` | 读取检测 | `$_STATE_DIR/.telemetry-prompted` |
| | 221 | `~/.gstack/analytics` | mkdir | `$_STATE_DIR/analytics` |
| | 222 | `~/.gstack/analytics/skill-usage.jsonl` | 追加写入 | `$_STATE_DIR/analytics/skill-usage.jsonl` |
| | 223 | `~/.gstack/analytics/.pending-*` | 遍历读取 | `$_STATE_DIR/analytics/.pending-*` |
| `generateLakeIntro` | 240 | `~/.gstack/.completeness-intro-seen` | touch | `$_STATE_DIR/.completeness-intro-seen` |
| `generateTelemetryPrompt` | 263 | `~/.gstack/.telemetry-prompted` | touch | `$_STATE_DIR/.telemetry-prompted` |
| `generateCompletionStatus` | 390 | `~/.gstack/analytics/.pending-"$_SESSION_ID"` | rm -f | `$_STATE_DIR/analytics/.pending-"$_SESSION_ID"` |
| `generateContributorMode` | 325 | `~/.gstack/contributor-logs/{slug}.md` | 写入 | `$_STATE_DIR/contributor-logs/{slug}.md` |
| `generateDesignMethodology` | 1029 | `~/.gstack/projects/$SLUG` | mkdir | `.gstack/projects` |
| | 1031 | `~/.gstack/projects/{slug}/...` | 写入 | `.gstack/projects/{user}-{branch}-design-audit-{datetime}.md` |

**关键架构问题**：`HOST_PATHS` 接口（行 34-39）只定义了 `skillRoot`、`localSkillRoot`、`binDir`、`browseDir`——不包含 `stateDir`。需要决定：
- **方案 A**：在 `HOST_PATHS` 中新增 `stateDir` 字段，通过模板变量替换
- **方案 B**：在 preamble bash 中基于 `$_GSTACK_ROOT` 推导 `$_STATE_DIR`（**推荐**，因为不引入新的探测逻辑，而是复用已有的安装位置判断）

**实现方式（方案 B）**：在 preamble bash 中，`$_GSTACK_ROOT` 探测链之后追加 `$_STATE_DIR` 推导：

```bash
# 在 $_GSTACK_ROOT 探测链之后追加（preamble bash）
_STATE_DIR="${GSTACK_STATE_DIR:-}"
if [ -z "$_STATE_DIR" ]; then
  # 如果 gstack 安装在项目本地，状态也在项目内；否则用全局路径
  if [ -n "$_ROOT" ] && [ -n "$_GSTACK_ROOT" ] && case "$_GSTACK_ROOT" in "$_ROOT"*) true;; *) false;; esac; then
    _STATE_DIR="$_ROOT/.gstack"
  else
    _STATE_DIR="$HOME/.gstack"
  fi
fi
```

**原理**：`$_ROOT` 和 `$_GSTACK_ROOT` 都已经在 preamble 的探测链中设置好了。如果 `$_GSTACK_ROOT` 以 `$_ROOT` 开头（即 Priority 1 或 2 命中 → 项目安装），状态目录在项目内；否则（Priority 3 命中 → 全局安装）用 `$HOME/.gstack`。

### 3.5 `scripts/analytics.ts`（1 处硬编码路径）

> **第二轮审计新发现：第一轮遗漏了此文件**

| 行号 | 路径 | 操作 | 改为 |
|------|------|------|------|
| 26 | `path.join(os.homedir(), '.gstack', 'analytics', 'skill-usage.jsonl')` | 读取 | git root 检测 + 项目级路径 |

此文件是一个独立的 CLI 工具（`bun run scripts/analytics.ts`），需要添加与 `browse/src/config.ts` 类似的 git root 检测逻辑。

### 3.6 Skill 模板（18 个文件，~50 处引用）

#### 3.6.1 `analytics/skill-usage.jsonl` 写入（6 个模板 + 2 个 hook 脚本）

这些模板在激活时直接写入 `~/.gstack/analytics/skill-usage.jsonl`，绕过 `gstack-telemetry-log` 脚本：

| 文件 | 行号 | 改为 |
|------|------|------|
| `careful/SKILL.md.tmpl` | 29-30 | 使用 `$_STATE_DIR/analytics/` |
| `careful/bin/check-careful.sh` | 105-106 | 使用 STATE_DIR 变量 |
| `freeze/SKILL.md.tmpl` | 34-35 | 使用 `$_STATE_DIR/analytics/` |
| `freeze/bin/check-freeze.sh` | 63-64 | 使用 STATE_DIR 变量 |
| `unfreeze/SKILL.md.tmpl` | 19-20 | 使用 `$_STATE_DIR/analytics/` |
| `guard/SKILL.md.tmpl` | 43-44 | 使用 `$_STATE_DIR/analytics/` |

**注意**：这些模板中的 analytics 写入没有通过 `gstack-telemetry-log` 脚本，而是直接硬编码 `mkdir -p ~/.gstack/analytics && echo ... >> ~/.gstack/analytics/skill-usage.jsonl`。需要改为使用 STATE_DIR 变量。

#### 3.6.2 `freeze-dir.txt` 读写（5 个模板）

| 文件 | 行号 | 当前路径解析 | 改为 |
|------|------|------------|------|
| `freeze/SKILL.md.tmpl` | 56-58 | `STATE_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.gstack}"` | git root 检测 |
| `freeze/bin/check-freeze.sh` | 11-12 | 同上 | git root 检测 |
| `guard/SKILL.md.tmpl` | 65-67 | 同上 | git root 检测 |
| `unfreeze/SKILL.md.tmpl` | 26-29 | 同上 | git root 检测 |
| `investigate/SKILL.md.tmpl` | 76-78 | 同上 | git root 检测 |

**注意**：这些模板使用 `CLAUDE_PLUGIN_DATA` 环境变量作为 Claude Code 的路径覆盖。迁移后统一为 git root 检测模式，不再依赖 `CLAUDE_PLUGIN_DATA`。

#### 3.6.3 `projects/$SLUG/` 读写（10 个模板）

| 文件 | 读写内容 | 路径变更 |
|------|---------|---------|
| `office-hours/SKILL.md.tmpl` (7 处) | 设计文档读写、跨团队发现 | `~/.gstack/projects/$SLUG/*-design-*` → `.gstack/projects/*-design-*` |
| `plan-eng-review/SKILL.md.tmpl` (4 处) | 设计文档读取、测试计划写入 | 同上 |
| `plan-ceo-review/SKILL.md.tmpl` (7 处) | 设计文档读取、CEO 计划写入、归档 | 同上，含 `ceo-plans/` 和 `ceo-plans/archive/` |
| `ship/SKILL.md.tmpl` (2 处) | review override 日志读写 | `~/.gstack/projects/$SLUG/$BRANCH-reviews.jsonl` → `.gstack/projects/$BRANCH-reviews.jsonl` |
| `design-review/SKILL.md.tmpl` (2 处) | 设计审计报告写入 | 同上模式 |
| `qa/SKILL.md.tmpl` (4 处) | 测试计划读取、测试结果写入 | 同上模式 |
| `qa-only/SKILL.md.tmpl` (4 处) | 同 qa | 同上模式 |
| `design-consultation/SKILL.md.tmpl` (1 处) | office-hours 文件读取 | 同上模式 |
| `review/greptile-triage.md` (5 处) | greptile 历史的双路径读写 | 简化为单路径 `.gstack/greptile-history.md` |

**关键变更**：
- 所有 `~/.gstack/projects/$SLUG/` → `.gstack/projects/`（去掉 slug 分层）
- 不再需要 `source <(gstack-slug)` 获取 `$SLUG`
- `greptile-triage.md` 的"全局聚合"写入删除，只写项目级

#### 3.6.4 其他全局路径

| 文件 | 行号 | 路径 | 改为 |
|------|------|------|------|
| `retro/SKILL.md.tmpl` | 101 | `~/.gstack/greptile-history.md` | `.gstack/greptile-history.md` |
| | 113 | `~/.gstack/analytics/skill-usage.jsonl` | `.gstack/analytics/skill-usage.jsonl` |
| | 151, 167, 370 | 文档描述中引用 `~/.gstack/` | 更新为项目级路径 |

#### 3.6.5 无需修改的模板

| 文件 | 原因 |
|------|------|
| `document-release/SKILL.md.tmpl` | 仅在 `find` 排除模式中引用 `.gstack/`，正确 |

### 3.7 测试文件（6 个文件）

| 文件 | 引用 | 影响 | 改动 |
|------|------|------|------|
| `test/telemetry.test.ts` | `GSTACK_STATE_DIR` 隔离到临时目录 | **不会断裂** | 无需改（env 覆盖机制保持有效） |
| `test/hook-scripts.test.ts` | `CLAUDE_PLUGIN_DATA` 临时目录隔离 | **不会断裂** | 无需改（临时目录隔离有效） |
| `test/gen-skill-docs.test.ts` 行 183 | 断言 `~/.gstack/analytics` 存在于生成的 SKILL.md 中 | **会断裂** | 改为断言新的项目级路径模式（如 `$_STATE_DIR/analytics`） |
| `test/gen-skill-docs.test.ts` 行 1109 | 断言 `.telemetry-prompted` 存在于 SKILL.md 中 | **不会断裂** | 无需改（只检查子串，不检查路径前缀） |
| `test/skill-validation.test.ts` 行 238-267 | 验证 greptile 双路径架构（3 处断言） | **会断裂** | 改为验证单路径架构 |
| `test/skill-llm-eval.test.ts` 行 428-435 | LLM judge prompt 中描述双路径架构 | **会断裂** | 重写 prompt，改为项目级单路径架构 |
| `test/skill-e2e.test.ts` 行 352 | 创建 `~/.gstack/contributor-logs/` 的 OVERRIDE 指令 | **不会断裂** | 无需改（已使用临时目录覆盖） |
| `test/skill-e2e.test.ts` 行 1539 | `/plan-eng-review writes test-plan artifact to ~/.gstack/projects/` | **不影响运行** | 更新测试名和注释为项目级路径 |
| `test/helpers/observability.test.ts` | 断言 `~/.gstack-dev/e2e-live.json` | **不会断裂** | 无需改（开发者基础设施不迁移） |

**会断裂的测试汇总**：3 个文件，5 处断言需要更新。

### 3.8 文档文件

> **第二轮审计修正：第一轮错误地将 CONTRIBUTING.md 和 docs/architecture.md 标记为"无需改"**

| 文件 | 引用详情 | 改动 |
|------|---------|------|
| `README.md` 行 171 | `~/.gstack/analytics/skill-usage.jsonl` | 更新为项目级路径说明 |
| `docs/skills.md` 行 85, 137, 218 | `~/.gstack/projects/`（3 处写入说明） | 更新为项目级路径 |
| `docs/skills.md` 行 793 | `~/.gstack/greptile-history.md`（1 处） | 更新为项目级路径 |
| `CONTRIBUTING.md` 行 28 | `~/.gstack/contributor-logs/`（贡献者日志说明） | 更新为项目级路径 |
| `CONTRIBUTING.md` 行 42 | `~/.gstack/contributor-logs/`（查看日志命令） | 更新为项目级路径 |
| `docs/architecture.md` 行 255 | `~/.gstack/sessions/$PPID`（preamble 说明） | 更新为项目级路径 |
| `docs/architecture.md` 行 256 | `~/.gstack/contributor-logs/`（contributor mode 说明） | 更新为项目级路径 |
| `refactoring/cross-block-env.md` | telemetry 文件传递路径 | 更新为 `$_STATE_DIR/analytics/` |
| `CHANGELOG.md` | 无 `~/.gstack` 引用（第一轮误报） | **无需改** |
| `TODOS.md` 行 352, 373 | `~/.gstack-dev/evals/` 引用 | **无需改**（开发者基础设施不迁移） |
| `TODOS.md` 行 520 | `~/.gstack/investigate-sessions/`（规划项） | **无需改**（未实现的规划项） |
| `TODOS.md` 行 563 | `~/.gstack/config.yaml`（已完成项描述） | **无需改**（历史记录） |
| `CLAUDE.md` | 只引用 `~/.gstack-dev/` | **无需改** |
| `CODEBUDDY.md` | 只引用 `~/.gstack-dev/` | **无需改** |
| `docs/browser.md` | 全部项目本地路径 | **无需改** |

**需要更新的文档文件汇总**：6 个文件（README.md、docs/skills.md、CONTRIBUTING.md、docs/architecture.md、refactoring/cross-block-env.md、bin/remote-slug 注释）。

## 4. 实施方案

### Phase 1: bin 脚本路径检测统一 ✅

**目标**：让所有 bin 脚本根据安装方式决定状态目录——项目安装用 `<project>/.gstack/`，全局安装保持 `~/.gstack/`。

**改动清单**：

1. `bin/gstack-config` — `STATE_DIR` 改为安装方式检测（见 §3.3 标准化路径检测代码）
2. `bin/gstack-telemetry-log` — `STATE_DIR` 改为安装方式检测
3. `bin/gstack-analytics` — `STATE_DIR` 改为安装方式检测
4. `bin/gstack-review-log` — `GSTACK_HOME` 改为 `GSTACK_STATE_DIR` + 安装方式检测；项目安装模式下去掉 `$SLUG` 分层
5. `bin/gstack-review-read` — 同上
6. `bin/remote-slug` — 更新注释

**确保 `GSTACK_STATE_DIR` 环境变量覆盖仍然有效**（测试隔离依赖此机制）。

**风险**：bin 脚本在 skill 模板中被调用，模板的 `pwd` 就是项目目录，所以 `git rev-parse --show-toplevel` 和项目本地安装检测应该能正确工作。

### Phase 2: gen-skill-docs.ts preamble 更新 ✅

**目标**：生成的 SKILL.md preamble 中引入 `$_STATE_DIR` 变量，基于 `$_GSTACK_ROOT` 推导安装方式——项目安装用项目级路径，全局安装保持全局路径。

**改动清单**：

1. 在 `generatePreambleBash()` 的 `$_GSTACK_ROOT` 探测链之后，追加 `$_STATE_DIR` 推导逻辑（见 §3.4 实现方式代码）
2. `generatePreambleBash()` — 9 处 `~/.gstack/` 改为 `$_STATE_DIR/`
3. `generateLakeIntro()` — 1 处
4. `generateTelemetryPrompt()` — 1 处
5. `generateCompletionStatus()` — 1 处
6. `generateContributorMode()` — 1 处
7. `generateDesignMethodology()` — 2 处（项目安装模式下含 `projects/$SLUG/` 路径简化）
8. 重新生成所有 SKILL.md（`bun run gen:skill-docs`）

### Phase 3: skill 模板路径迁移 ✅

**目标**：所有 skill 模板中的 `~/.gstack/` 引用改为使用 `$_STATE_DIR`（由 preamble 探测链设置——项目安装指向 `<project>/.gstack/`，全局安装指向 `~/.gstack/`）。

**分批改动**：

**3a. analytics 硬编码路径**（6 个模板 + 2 个 hook 脚本）：
- `careful/SKILL.md.tmpl`、`careful/bin/check-careful.sh`
- `freeze/SKILL.md.tmpl`、`freeze/bin/check-freeze.sh`
- `unfreeze/SKILL.md.tmpl`、`guard/SKILL.md.tmpl`
- 将 `~/.gstack/analytics` 改为通过 STATE_DIR 变量引用

**3b. freeze-dir.txt 路径**（5 个模板）：
- `freeze/`、`guard/`、`unfreeze/`、`investigate/` 模板
- `freeze/bin/check-freeze.sh`
- 将 `CLAUDE_PLUGIN_DATA:-$HOME/.gstack` 改为 git root 检测

**3c. projects/ 路径**（10 个模板）：
- `office-hours/`、`plan-eng-review/`、`plan-ceo-review/`、`ship/`、`design-review/`
- `qa/`、`qa-only/`、`design-consultation/`
- `review/greptile-triage.md`
- 将 `~/.gstack/projects/$SLUG/` 改为 `.gstack/projects/`

**3d. retro 路径**（1 个模板）：
- `retro/SKILL.md.tmpl` — 改为项目级路径

**注意**：模板是 AI 读取的 prompt，bash block 之间变量不共享（参见 `cross-block-env.md`）。每个独立 bash block 中需要重新检测 STATE_DIR。

### Phase 4: scripts + setup 清理 ✅

**目标**：setup 脚本按安装方式创建正确的状态目录，修复遗漏的脚本。

1. `setup` 第 185-186 行 `mkdir -p "$HOME/.gstack/projects"` — 改为按安装方式分支：
   - 全局安装（无 `--project`）：保持 `mkdir -p "$HOME/.gstack/projects"`
   - 项目安装（有 `--project`）：改为 `mkdir -p "$PROJECT_ROOT/.gstack/projects"` + 确保 `.gstack/` 在 `.gitignore` 中
2. 在 `--project` 安装时确保 `.gstack/` 在目标项目的 `.gitignore` 中（参考 `browse/src/config.ts` 的 `ensureStateDir()` 逻辑）
3. `scripts/analytics.ts` 行 26 — 改为安装方式检测 + 对应路径（参考 `browse/src/config.ts`）

### Phase 5: 测试和文档更新 ✅

**目标**：所有测试通过，文档同步。

**测试更新**：
1. `test/gen-skill-docs.test.ts` 行 183 — preamble 断言从 `~/.gstack/analytics` 改为新路径模式（如 `$_STATE_DIR/analytics`）
2. `test/skill-validation.test.ts` 行 238-267 — greptile 验证从双路径改为单路径（3 处断言）
3. `test/skill-llm-eval.test.ts` 行 428-435 — 重写 greptile 架构一致性 prompt（双路径 → 单路径）
4. `test/skill-e2e.test.ts` 行 1539 — 更新测试名和注释（路径描述）
5. 验证 `bun test` 全部通过

**文档更新**：
6. `README.md` 行 171 — 更新 analytics 路径说明
7. `docs/skills.md` 行 85, 137, 218, 793 — 更新所有 projects/ 和 greptile 路径说明
8. `CONTRIBUTING.md` 行 28, 42 — 更新 contributor-logs 路径说明
9. `docs/architecture.md` 行 255, 256 — 更新 preamble 中 sessions 和 contributor-logs 说明
10. `refactoring/cross-block-env.md` — 更新 telemetry 文件传递路径

## 5. 迁移考虑

### 5.1 全局安装用户

**全局安装的用户完全不受影响。** 全局安装（`./setup --host codebuddy`，不带 `--project`）的 gstack 将继续使用 `~/.gstack/` 作为状态目录，行为与迁移前完全一致。这是因为 `$_GSTACK_ROOT` 探测链命中 Priority 3（`$HOME/.codebuddy/skills/gstack`），`$_STATE_DIR` 推导结果为 `$HOME/.gstack`。

### 5.2 已有的 `~/.gstack/` 数据

对于从全局安装切换到项目安装的用户，`~/.gstack/` 中可能已有该项目的数据。方案：
- **不做自动迁移**。旧数据保留在 `~/.gstack/`，用户可以手动复制需要的内容
- 新的项目安装直接使用 `<project>/.gstack/` 路径
- 在项目安装模式首次检测到旧全局目录有该项目数据时，输出一行提示

### 5.3 多项目共享

旧方案的一个"功能"是跨项目的设计文档发现（`office-hours` 中 grep 所有项目的 design docs）。项目安装后这个功能消失（但全局安装保持不变）。
- **可接受**：项目安装的用户选择了隔离性，每个项目的设计文档在自己项目内更合理

### 5.4 .gitignore

`browse/src/config.ts` 的 `ensureStateDir()` 已经有把 `.gstack/` 添加到 `.gitignore` 的逻辑。这个行为应复用到：
- `setup` 脚本的 `--project` 安装模式
- preamble 中项目安装模式首次创建 `.gstack/` 目录时
- 全局安装不需要此操作（`~/.gstack/` 不在任何 git 仓库内）

## 6. 工作量估计

| Phase | 文件数 | 估计时间 |
|-------|--------|---------|
| Phase 1: bin 脚本 | 6 | 30 min |
| Phase 2: gen-skill-docs preamble | 1 | 30 min |
| Phase 3: skill 模板 | 18 | 1.5 hours |
| Phase 4: scripts + setup | 2 | 20 min |
| Phase 5: 测试+文档 | ~12 | 1.5 hours |
| **合计** | **~39** | **~4.5 hours** |

## 7. 风险

1. **Skill 模板的 bash block 路径硬编码**：模板中大量直接写 `~/.gstack/...`，不是通过变量引用。需要逐个替换。每个独立 bash block 中需要 `$_STATE_DIR` 检测（因为 bash block 之间变量不共享）。
2. **测试隔离**：telemetry 测试使用 `GSTACK_STATE_DIR` 环境变量隔离。改为安装方式检测后，测试中需要确保环境变量覆盖**仍然优先**。当前设计中 env 覆盖是第一优先级，这是正确的。
3. **非 git 环境**：如果用户在非 git 目录运行 skill，回退到 `$HOME/.gstack`（非 `$PWD/.gstack`，避免 cd 后路径断裂）。这与"全局安装保持全局目录"的原则一致。
4. **`projects/` slug 去除**（仅限项目安装模式）：影响 `gstack-review-log`、`gstack-review-read` 等脚本，它们当前用 slug+branch 组织文件。项目安装模式下改为直接用 branch 组织（因为已经在项目内，无需 slug 区分）。全局安装模式保持 slug 分层不变。需确保无文件名冲突。
5. **`CLAUDE_PLUGIN_DATA` 兼容**：freeze/guard/investigate 模板使用 `CLAUDE_PLUGIN_DATA` 作为 Claude Code 的路径覆盖。迁移后统一使用 `$_STATE_DIR`（基于 `$_GSTACK_ROOT` 推导），不再依赖 `CLAUDE_PLUGIN_DATA`。需确认 Claude Code 用户是否受影响。
6. **cross-block-env 依赖**：`cross-block-env.md` 方案中的 telemetry 文件传递路径（`~/.gstack/analytics/.session-tel-start`）需要在本方案中一并更新为 `$_STATE_DIR/analytics/.session-tel-start`。如果 cross-block-env 的 stash 先合并，需要二次修改。
7. **`scripts/analytics.ts` 的迁移需保持 CLI 兼容**：这是一个独立的 CLI 工具，改为安装方式检测时需要处理"不在 git 项目中运行"和"全局安装"的回退场景，两者都应使用 `~/.gstack/`。
8. **bin 脚本的安装检测开销**：每个 bin 脚本需要检查项目本地是否有 gstack 安装（遍历 dist/、.claude/、.codebuddy/、.agents/ 四个目录）。这是 `stat` 调用，开销极低（<1ms），可接受。

## 8. 与其他重构方案的关系

```
self-contained-install.md (Phase 6, ✅ 全部完成)
    │
    │  前置: dist/ 结构 + $_GSTACK_ROOT 探测链 + install_copy()
    │
    ├──→ cross-block-env.md (A3, 代码完成未提交)
    │     │  写入: ~/.gstack/analytics/.session-tel-start
    │     │  写入: ~/.gstack/analytics/.session-id
    │     │         ↑ 这些路径需要本方案一并更新为 $_STATE_DIR/analytics/
    │     │
    │     └──→ project-local-state.md (本文档, ✅ 已完成)
    │
    └──→ project-local-state.md (本文档, ✅ 已完成)
          核心原则: 状态目录跟随安装方式
          $_GSTACK_ROOT 以项目路径开头 → $_STATE_DIR = <project>/.gstack/
          $_GSTACK_ROOT 以 $HOME 开头   → $_STATE_DIR = ~/.gstack/（不变）
```

**建议实施顺序**：
1. 先实施本方案（project-local-state）
2. 再合并 cross-block-env 的 stash（此时直接使用项目级路径）
3. 这样避免 cross-block-env 合并后又要二次修改路径

## 9. 交叉对比审计日志

> 以下记录第二轮独立审计与第一轮的差异，作为审计质量改进的证据。

### 9.1 第一轮遗漏项（第二轮新发现）

| 类别 | 遗漏 | 影响 |
|------|------|------|
| 源文件 | `scripts/analytics.ts` 行 26 硬编码路径 | 漏了 1 个需要改的文件 |
| 文档 | `CONTRIBUTING.md` 行 28, 42 的 `~/.gstack/contributor-logs/` 引用 | 第一轮错误标记为"无需改" |
| 文档 | `docs/architecture.md` 行 255, 256 的 sessions 和 contributor-logs 引用 | 第一轮错误标记为"无需改"（只说"只引用 eval 基础设施"） |
| 文档 | `README.md` 行 171 的 analytics 路径引用 | 第一轮只说"路径说明更新"，未给出具体行号和内容 |
| 架构 | `HOST_PATHS` 接口不包含 `stateDir` 的关键发现 | 影响 Phase 2 的实现方案选择 |
| 架构 | 三套不统一的环境变量名（含 `CLAUDE_PLUGIN_DATA`） | 第一轮只提到两套 |

### 9.2 第一轮不准确项（已修正）

| 项目 | 第一轮 | 第二轮修正 |
|------|--------|----------|
| 影响范围 | ~35 个文件、67 处引用 | ~40 个文件、~90 处引用 |
| gen-skill-docs.ts 引用数 | 13 处 | 15 处（漏计行 222 analytics 写入、行 223 pending 遍历） |
| CHANGELOG.md | "新增条目"（暗示有引用需改） | 0 处 `~/.gstack` 引用，只需新增发布条目 |
| `docs/architecture.md` | "无需改（只引用 eval 基础设施）" | 2 处非 dev 引用需要更新 |
| `CONTRIBUTING.md` | "无需改（只引用 `~/.gstack-dev/`）" | 2 处 `~/.gstack/contributor-logs/` 引用需要更新 |
| Phase 4 scope | 只包含 setup 脚本 | 应包含 scripts/analytics.ts |
| 工作量估计 | ~33 文件、~3.75 hours | ~39 文件、~4.5 hours |
