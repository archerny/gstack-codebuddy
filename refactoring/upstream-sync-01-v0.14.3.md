# Upstream Sync Strategy — v0.14.3 迁移分析

> 本文档记录 gstack-codebuddy 针对上游 [gstack v0.14.3](https://github.com/garrytan/gstack) 的具体迁移分析、路线图和差异跟踪。
>
> 创建日期：2026-03-31
> 最后更新：2026-04-02（P0 ✅ Phase 1 ✅ Phase 2 基础设施 ✅ Phase 3 ✅ Phase 4 全部完成 ✅ Phase 5 全部完成 ✅ Phase 6 全部完成 ✅）
> 状态：✅ 全部完成 — v0.14.3 upstream sync 完成（P0 ✅ Phase 1-6 全部 ✅）
> 前置文档：[migration-plan.md](./migration-plan.md)（Phase 0-5 + 6 全部完成）、[platform-comparison.md](./platform-comparison.md)、[browse-separation.md](./browse-separation.md)、[cross-block-env.md](./cross-block-env.md)、[project-local-state.md](./project-local-state.md)
> 通用规则：[upstream-sync-rules.md](./upstream-sync-rules.md)（迁移时必须遵守的 12 条规则、排除清单、操作清单）

## 背景

gstack-codebuddy 从 gstack v0.9.0 左右 fork 而来，针对 CodeBuddy IDE 做了深度定制。原始 [gstack](https://github.com/garrytan/gstack) 持续快速迭代（截至分析时已到 v0.14.3），两个仓库之间积累了显著差异。

**核心矛盾**：我们既需要从上游获取高价值演进，又不能盲目合并——因为很多上游变更是围绕 Claude Code / Codex 特有能力设计的，直接搬过来未必适用。

### 我们已经做了什么

在 fork 之后，gstack-codebuddy 已经完成了大量深度改造（详见 [migration-plan.md](./migration-plan.md)），这些改造**改变了代码结构**，使得上游代码不能直接 `git merge`：

| 改造 | 文档 | 对上游同步的影响 |
|------|------|--------------|
| CodeBuddy Host 适配（Phase 0-5） | migration-plan.md | frontmatter 转换、品牌名参数化、路径替换——上游模板直接搬过来会缺少这些处理 |
| 自包含安装（Phase 6A-6D） | self-contained-install.md | `$_GSTACK_ROOT` 探测链、`copyRuntimeAssets()`——上游新增的 bin 脚本/辅助文件需要同步注册 |
| Browse 拆分为独立 Skill | browse-separation.md | browse 安装路径从 `gstack/browse/` 变为 `browse/`——上游 browse 相关变更的路径引用需要适配 |
| 跨 Bash Block 环境变量 | cross-block-env.md | `{{STATE_DIR_ENV}}`——上游新增的模板中如果有跨 block 变量依赖，需要同步处理 |
| 项目级状态目录 | project-local-state.md | `$_STATE_DIR` 替代 `~/.gstack/`——上游模板中的 `~/.gstack/` 硬编码路径需要全部替换 |

---

## 版本差距概览

| 维度 | 上游 (v0.14.3) | 本地 (v0.14.0) | 差距 |
|------|---------------|--------------|------|
| **Resolver 架构** | 13 个模块文件，192KB/4063 行，39 个 placeholder | 单体文件 1920 行，10 个 placeholder | 缺少 29 个 placeholder |
| **Skill 模板** | ~30 个 skill | ~18 个 skill | 缺少 12 个新 skill |
| **Bin 脚本** | 23 个 | 10 个 | 缺少 13 个 |
| **Browse 源文件** | 21 个 | 15 个 | 缺少 6 个 |
| **Browse 测试** | 45 个 | 25 个 | 缺少 20 个 |
| **Browse 命令** | ~35 个 | ~24 个 | 缺少 11 个新命令 |
| **CHANGELOG** | 1675 行 | — | v0.9.0 到 v0.14.3 约 5 个大版本的迭代 |

---

## P0: 安全修复 ✅ 已完成

> ✅ 已于 2026-03-31 完成。

### gstack-slug 安全过滤缺失

**问题**：本地 `bin/gstack-slug`（478B/10 行）缺少上游新增的安全过滤措施。该脚本通过 `eval "$(gstack-slug)"` 被其他脚本调用，输出直接进入 shell 执行。如果 git remote URL 或目录名包含特殊字符，可能导致 shell 注入。

**上游修复内容**（949B/19 行）：
1. `tr -cd 'a-zA-Z0-9._-'` — 输出安全过滤，只保留安全字符
2. `|| true` — 容错处理，git 命令失败时不中断
3. Fallback 链 — remote URL → 目录名 → "unknown"

**迁移方式**：直接对齐上游版本，仅调整状态目录路径（规则 4）。工作量：~15 分钟。

**完成记录**：
- ✅ `tr -cd 'a-zA-Z0-9._-'` 安全过滤已添加（SLUG + BRANCH）
- ✅ `|| true` 容错已添加（两个 git 命令）
- ✅ Fallback 链完整：remote URL → `basename "$PWD"` → `unknown`
- ✅ `set -euo pipefail` 已添加
- ✅ 纯 POSIX 语法（zsh 兼容，规则 9）
- ✅ `bun test` 通过

---

## 上游新增的核心系统

深入分析发现上游引入了多个**贯穿多 skill 的横切系统**，这些系统影响迁移策略的设计：

### 1. Preamble 分层系统 (preambleTier T1-T4)

上游引入 `preambleTier` 概念，不同 skill 使用不同层级的 preamble：

| 层级 | 用途 | 使用 Skill |
|------|------|-----------|
| T1 | 精简版（无 voice/completeness） | browse, benchmark |
| T2 | 标准版 | 大多数 skill |
| T3 | 增强版 | investigate, qa |
| T4 | 完整版（含 completion audit） | ship, review, autoplan |

**影响**：`generatePreamble()` 需要重写为接受 tier 参数，按 tier 决定输出内容。本地当前只有单一版本的 preamble。

### 2. Learnings 系统（跨 session 机构记忆）

通过 `learnings.jsonl` 存储学习记录，贯穿 6 个 skill：
- **review** / **ship** — 搜索相关 learnings + 记录新发现
- **investigate** — 记录调查结论
- **office-hours** — 搜索历史产品决策
- **plan-ceo-review** / **plan-eng-review** — 搜索架构/工程 learnings

依赖：
- `bin/gstack-learnings-log`（31 行）— 写入 learning 记录
- `bin/gstack-learnings-search`（132 行）— 搜索 + 置信度衰减 + 去重 + 跨项目发现
- `scripts/resolvers/learnings.ts`（96 行）— resolver 生成嵌入 prompt

> **当前状态（Phase 2 ✅ + Phase 3 ✅ + Phase 4A ✅）**：以上 3 个基础设施组件 + `bin/gstack-repo-mode`（跨项目搜索依赖）已全部完成迁移。6 个已有 skill 模板的 `{{LEARNINGS_SEARCH}}` / `{{LEARNINGS_LOG}}` 引用已在 Phase 3 添加完成。`/learn` skill 模板已在 Phase 4A 迁移完成。Learnings 系统迁移 **100% 完成**。

### 3. Confidence Calibration（置信度校准）

1-10 分置信度评分体系，控制 finding 显示规则：
- 7+ 分：正常显示
- 5-6 分：附带警告标记
- <5 分：抑制不显示

出现在：review、ship、plan-eng-review

### 4. Adversarial Step（对抗性审查）

**替代了本地硬编码的 Codex second opinion**。模板化的对抗性审查，v0.14.3 起始终启用。流程：Claude subagent 审查 + Codex challenge。

### 5. INVOKE_SKILL 组合机制

`{{INVOKE_SKILL:skill-name:skip=...}}` 允许 skill 内联调用另一个 skill，带默认跳过列表（12 个 section）。目前 plan-ceo-review 用它调用 office-hours。`composition.ts` 仅 48 行。

### 6. Scope Drift Detection（范围漂移检测）

从 `/review` 提取为共享 resolver `generateScopeDrift()`，review 和 ship 共用。本地 review 有硬编码版本，ship 无此功能。

### 7. Test Failure Triage（测试失败分诊）

`TEST_FAILURE_TRIAGE` 区分本分支失败 vs 预存在失败，替代本地的 "any test fails → STOP" 行为。更精细的失败处理策略。

### 8. Plan Completion Audit + Verification

- `PLAN_COMPLETION_AUDIT_SHIP` / `PLAN_COMPLETION_AUDIT_REVIEW` — 跟踪计划完成度
- `PLAN_VERIFICATION_EXEC` — 在 ship 中执行计划验证

### 9. Repo Mode Detection（仓库模式检测）

`bin/gstack-repo-mode`（94 行）检测 solo vs collaborative 仓库模式（90 天内 top author ≥ 80% 判 solo），7 天缓存 TTL。影响 review/ship 中的工作流策略。

> **当前状态（Phase 2.5 ✅）**：bin 脚本已完成迁移，使用 project-local state dir 检测模式。

---

## Placeholder 完整差距分析

上游 39 个 placeholder vs 本地 10 个。以下为完整对比：

### 本地已有（10 个）

| Placeholder | 本地 Resolver | 备注 |
|-------------|-------------|------|
| `COMMAND_REFERENCE` | `generateCommandReference()` | ✅ |
| `SNAPSHOT_FLAGS` | `generateSnapshotFlags()` | ✅ |
| `PREAMBLE` | `generatePreamble()` | 需重写为支持 tier |
| `BROWSE_SETUP` | `generateBrowseSetup()` | ✅ |
| `BASE_BRANCH_DETECT` | `generateBaseBranchDetect()` | 上游新增 GitLab + fallback |
| `QA_METHODOLOGY` | `generateQAMethodology()` | 需对比差异 |
| `DESIGN_METHODOLOGY` | `generateDesignMethodology()` | 需对比差异 |
| `DESIGN_REVIEW_LITE` | `generateDesignReviewLite()` | 需对比差异 |
| `REVIEW_DASHBOARD` | `generateReviewDashboard()` | 需对比差异 |
| `TEST_BOOTSTRAP` | `generateTestBootstrap()` | 上游新增 zsh `setopt` |

### 上游新增——高优先级（16 个，核心系统依赖）

| Placeholder | 上游 Resolver 文件 | 行数 | 依赖 |
|-------------|-------------------|------|------|
| `LEARNINGS_SEARCH` | learnings.ts | ~50 | bin/gstack-learnings-search |
| `LEARNINGS_LOG` | learnings.ts | ~50 | bin/gstack-learnings-log |
| `CONFIDENCE_CALIBRATION` | confidence.ts | 37 | 独立 |
| `ADVERSARIAL_STEP` | review.ts | ~80 | 独立 |
| `SCOPE_DRIFT` | review.ts | ~100 | 独立（替代 review 硬编码） |
| `PLAN_COMPLETION_AUDIT_SHIP` | review.ts | ~60 | 独立 |
| `PLAN_COMPLETION_AUDIT_REVIEW` | review.ts | ~60 | 独立 |
| `PLAN_VERIFICATION_EXEC` | review.ts | ~50 | 独立 |
| `TEST_FAILURE_TRIAGE` | testing.ts | ~80 | 独立 |
| `TEST_COVERAGE_AUDIT_PLAN` | testing.ts | ~100 | 独立 |
| `TEST_COVERAGE_AUDIT_SHIP` | testing.ts | ~100 | 独立 |
| `TEST_COVERAGE_AUDIT_REVIEW` | testing.ts | ~100 | 独立 |
| `INVOKE_SKILL` | composition.ts | 48 | 独立（特殊语法：`{{INVOKE_SKILL:name:skip=...}}`）|
| `CODEX_SECOND_OPINION` | review.ts | ~60 | 独立 |
| `CHANGELOG_WORKFLOW` | utility.ts | ~80 | 独立 |
| `CO_AUTHOR_TRAILER` | utility.ts | ~30 | 独立 |

### 上游新增——中优先级（8 个，特定 skill 使用）

| Placeholder | 上游 Resolver 文件 | 使用 Skill |
|-------------|-------------------|-----------|
| `SLUG_EVAL` | utility.ts | learn |
| `SLUG_SETUP` | utility.ts | setup-deploy |
| `DEPLOY_BOOTSTRAP` | utility.ts | setup-deploy, land-and-deploy |
| `SPEC_REVIEW_LOOP` | review.ts | office-hours, autoplan | ✅ Phase 3.3 |
| `CODEX_PLAN_REVIEW` | review.ts | plan-eng-review | ✅ Phase 3.4 |
| `PLAN_FILE_REVIEW_REPORT` | review.ts | review |
| `BENEFITS_FROM` | review.ts | 多个（conditional 显示） | ✅ Phase 4D |
| `REPO_MODE` | preamble.ts | preamble 内部使用 |

### 上游新增——低优先级（5 个，设计系统/特殊功能）

| Placeholder | 上游 Resolver 文件 | 使用 Skill |
|-------------|-------------------|-----------|
| `DESIGN_SKETCH` | design.ts | office-hours, design-consultation | ✅ Phase 3.3 |
| `DESIGN_EXTERNAL_OPINIONS` | design.ts | design-review, design-consultation |
| `DESIGN_HARD_RULES` | design.ts | design-review, design-consultation |
| `DESIGN_SETUP` | design.ts | design-html, design-shotgun | ✅ Phase 4G-2 |
| `DESIGN_MOCKUP` | design.ts | office-hours | ✅ Phase 3.3 |
| `DESIGN_SHOTGUN_LOOP` | design.ts (新建) | design-shotgun | ✅ Phase 4G-2 |

### 需要特殊处理的 Placeholder

| Placeholder | 原因 | 状态 |
|-------------|------|------|
| `PROACTIVE_PROMPT` | preamble.ts 内部，含 telemetry 引用需剥离 | ✅ Phase 1.4 完成（`generateProactiveCheck()`，telemetry 已剥离） |
| `ROUTING_INJECTION` | preamble.ts 内部，host 路由逻辑 | ✅ 不适用（本地使用 Host 类型系统处理路由，无需独立 placeholder） |
| `VOICE_DIRECTIVE` | preamble.ts 内部，tier 分层输出 | ✅ Phase 1.4 完成（`generateVoiceDirective()`） |
| `SEARCH_BEFORE_BUILDING` | preamble.ts 内部，新增的开发习惯提示 | ✅ Phase 1.4 完成（`generateSearchBeforeBuilding()`） |

---

## Telemetry 移除工作量评估

上游代码中嵌入了大量 telemetry 引用，按永久排除清单必须全部剥离：

| 文件 | 引用数 | 涉及内容 |
|------|-------|---------|
| `scripts/resolvers/preamble.ts` | 36 处 | `_TEL` 变量系列、`gstack-telemetry-log`、`generateTelemetryPrompt()`、"Community mode"、"Telemetry (run last)" 节 |
| `scripts/resolvers/design.ts` | 2 处 | Codex design voice 错误处理中的 telemetry 调用 |
| `scripts/resolvers/composition.ts` | 1 处 | INVOKE_SKILL 默认跳过列表中包含 telemetry 节 |
| **合计** | **39 处** | 需逐一确认可安全删除 |

**策略**：迁移 resolver 时逐文件处理，每个文件迁移完后用 `grep -i telemetry` 确认零残留。

---

## 已有 Skill 模板差异详解

### 上游模板普遍比本地大 10-80%

| Skill | 上游行数 | 本地行数 | 差距 | 主要新增内容 |
|-------|---------|---------|------|------------|
| office-hours | 770 | 529 | +46% | Anti-Sycophancy Rules, Pushback Patterns, Landscape Awareness (WebSearch), 34 个 Founder Resources, Design Mockup/Sketch |
| ship | 627 | 699 | -10% | 移除 review gate 阻断 → 信息性提示；新增 TEST_FAILURE_TRIAGE, PLAN_COMPLETION_AUDIT, PLAN_VERIFICATION_EXEC, SCOPE_DRIFT, CHANGELOG_WORKFLOW, CO_AUTHOR_TRAILER, Distribution Pipeline, Persist ship metrics, GitLab MR 支持 |
| review | 258 | 290 | -11% | 新增 SCOPE_DRIFT, PLAN_COMPLETION_AUDIT_REVIEW, LEARNINGS_SEARCH/LOG, CONFIDENCE_CALIBRATION, TEST_COVERAGE_AUDIT_REVIEW, ADVERSARIAL_STEP, Step 5.8 Persist |
| investigate | ~200 | ~180 | +11% | 新增 LEARNINGS_LOG |
| qa | ~400 | ~380 | +5% | 小幅更新 |
| plan-ceo-review | ~150 | ~130 | +15% | 新增 INVOKE_SKILL:office-hours, LEARNINGS_SEARCH |
| plan-eng-review | ~300 | ~270 | +11% | 新增 CODEX_PLAN_REVIEW, CONFIDENCE_CALIBRATION, LEARNINGS_SEARCH |

### 关键行为变更

1. **ship: Review gate 从阻断变为信息性提示**
   - 本地行为：review 发现问题 → 停止 ship 流程
   - 上游行为：review 结果作为信息显示，不阻断
   - **决策建议**：跟随上游，这是更成熟的工程实践

2. **review: 对抗性审查替代 Codex second opinion**
   - 本地行为：硬编码的 Codex challenge 步骤
   - 上游行为：模板化 `{{ADVERSARIAL_STEP}}`，始终启用
   - **决策建议**：迁移，更灵活且不绑定特定 AI

3. **office-hours: 大量新增产品思考框架**
   - Anti-Sycophancy Rules（防止 AI 过于顺从）
   - Pushback Patterns（建设性挑战用户假设）
   - Landscape Awareness（通过 WebSearch 了解竞品/市场）
   - **决策建议**：高价值内容，应迁移

---

## 新增 Skill 分析

### 可迁移（9 个）

按优先级分组：

#### 高优先级

| Skill | 上游大小 | 核心功能 | 依赖 | 迁移难度 |
|-------|---------|---------|------|---------|
| `/learn` | 5KB | 记录/搜索跨 session learnings | learnings 系统 + bin 脚本 | 低（需先迁移 learnings） |
| `/setup-deploy` | 8KB | 检测部署配置/推荐策略 | SLUG_SETUP, DEPLOY_BOOTSTRAP | 低 |
| `/cso` | 34KB | 安全审计（OWASP/供应链/密钥泄露） | hooks（需降级）+ ADVERSARIAL_STEP | 中 |
| `/autoplan` | 33KB | 自动化 CEO → 设计 → 工程评审流水线 | INVOKE_SKILL + SPEC_REVIEW_LOOP + PLAN_COMPLETION_AUDIT | 中 |

#### 中优先级

| Skill | 上游大小 | 核心功能 | 依赖 | 迁移难度 |
|-------|---------|---------|------|---------|
| `/benchmark` | 9KB | 性能回归检测 | preambleTier T1 + browse | 低 |
| `/canary` | 8KB | 金丝雀部署监控 | browse + 部署基础设施 | 中 |

#### 低优先级（依赖 browse/design 基础设施扩展）

| Skill | 上游大小 | 核心功能 | 依赖 | 迁移难度 |
|-------|---------|---------|------|---------|
| `/land-and-deploy` | 43KB | 合并 + 部署全流程 | 大量 bin 脚本 + 部署基础设施 | 高 |
| `/design-shotgun` | 11KB | 多设计方案并行生成 | design/ 工具包 | 高 |
| `/design-html` | 18KB | 设计转 HTML 实现 | DESIGN_SETUP + design/ | 高 |

### 永久排除（3 个）

| Skill | 排除原因 |
|-------|---------|
| `/connect-chrome` (7KB) | Chrome 扩展绑定 |
| `/gstack-upgrade` (8KB) | 自更新机制 |
| `/browse`（独立 skill）(5KB) | 本地已有独立 browse skill |

---

## Bin 脚本差距分析

上游 23 个 vs 本地 10 个。

### 需要迁移（7 个，已完成 4 个，延后 3 个）

| 脚本 | 行数 | 功能 | 依赖 | 状态 |
|------|------|------|------|------|
| `gstack-learnings-log` | 31 | 写入 learning 记录 | gstack-slug | ✅ Phase 2.2 已完成 |
| `gstack-learnings-search` | 132 | 搜索 + 置信度衰减 + 去重 | gstack-slug, bun | ✅ Phase 2.2 已完成 |
| `gstack-repo-mode` | 94 | solo/collaborative 检测 | gstack-slug | ✅ Phase 2.5 已完成 |
| `gstack-open-url` | 15 | 跨平台 URL 打开 | 独立 | ⏭️ 延后 P4（无模板引用） |
| `gstack-platform-detect` | 21 | 检测已安装 AI agent | 独立 | ⏭️ 延后 P4（无模板引用） |
| `gstack-slug`（更新） | 19 | **安全过滤 + 容错** | 独立（P0） | ✅ 已完成 |
| `gstack-snapshot` | — | 快照相关 | 需评估 | ⏭️ 延后 P4（无模板引用） |

### 永久排除（6 个）

| 脚本 | 排除原因 |
|------|---------|
| `gstack-relink` | 符号链接管理 |
| `gstack-uninstall` | 符号链接管理 |
| `gstack-update-check` | 自更新机制 |
| `gstack-community-log` | 遥测/社区数据 |
| `gstack-community-query` | 遥测/社区数据 |
| `gstack-community-sync` | 遥测/社区数据 |

---

## Browse 差距分析

### 新增源文件（6 个）

| 文件 | 大小 | 功能 | 迁移建议 |
|------|------|------|---------|
| `cdp-inspector.ts` | 24.6KB | CDP 深度 CSS 检查器 | ✅ 有独立价值，不依赖 Chrome 扩展 |
| `platform.ts` | 634B | 跨平台常量（IS_WINDOWS/TEMP_DIR） | ✅ 基础设施改进 |
| `bun-polyfill.cjs` | 2.85KB | Windows 兼容层 | ✅ 基础设施改进 |
| `activity.ts` | 6.4KB | Chrome 扩展活动流（SSE） | ❌ Chrome 扩展排除项 |
| `sidebar-agent.ts` | 14.6KB | 侧边栏 Agent 进程 | ❌ Chrome 扩展排除项 |
| `sidebar-utils.ts` | 629B | URL 安全清洗 | ❌ Chrome 扩展排除项 |

### 新增命令（11 个）

| 命令 | 迁移建议 | 原因 |
|------|---------|------|
| `inspect` | ✅ | CDP CSS 检查，有独立价值 |
| `style` | ✅ | 样式提取 |
| `cleanup` | ✅ | 页面清理 |
| `prettyscreenshot` | ✅ | 增强截图 |
| `frame` | ✅ | iframe 操作 |
| `connect` | ❌ | Chrome 扩展连接 |
| `disconnect` | ❌ | Chrome 扩展断开 |
| `focus` | ❌ | Chrome 扩展侧边栏 |
| `inbox` | ❌ | Chrome 扩展消息 |
| `watch` | ❌ | Chrome 扩展监控 |
| `state` | ❌ | Chrome 扩展状态 |

### server.ts 变更

上游 `server.ts` 从 13KB 增长到 61KB (+360%)，主要新增内容：
- 侧边栏/活动流 SSE 路由（❌ Chrome 扩展，不迁移）
- CDP inspector 路由（✅ 有独立价值）
- 安全内容包装 `wrapUntrustedContent()`（✅ 应迁移）
- `PAGE_CONTENT_COMMANDS` 集合（✅ 应迁移）

**迁移策略**：只提取非 Chrome 扩展相关的改动，预计有效代码约 10-15KB。

---

## 上游 Host 类型差异

上游 `types.ts` 定义：
```typescript
type Host = 'claude' | 'codex' | 'factory'  // 无 'codebuddy'
```

本地需要保持：
```typescript
type Host = 'claude' | 'codex' | 'codebuddy'
```

**注意**：上游 `TemplateContext` 新增了两个字段：
- `benefitsFrom?: string[]` — 条件性显示相关 skill 推荐
- `preambleTier?: number` — T1-T4 分层控制

这两个字段需要在本地的 `TemplateContext` 中同步添加。

---

## 新增基础设施

| 目录/文件 | 上游内容 | 迁移建议 |
|----------|---------|---------|
| `lib/worktree.ts` (9.18KB) | Git worktree 管理器 | ❌ 永久排除（land-and-deploy 模板零 worktree 引用） |
| `design/` (22 文件) | 设计 CLI 工具包 | ⏭️ 跳过（resolver 已内含 binary 检测 + `DESIGN_NOT_AVAILABLE` 降级） |
| `extension/` (15 文件) | Chrome 扩展 | ❌ 永久排除 |

---

## 已批准的结构变更

以下目录新增或模块拆分已征得用户同意，迁移时按此结构执行（参见 [upstream-sync-rules.md](./upstream-sync-rules.md) 关键原则 1、2）：

| 日期 | 变更 | 原因 | 关联 Phase |
|------|------|------|-----------|
| 2026-03-31 | 允许 `scripts/resolvers/` 目录存在 | 上游 39 个 resolver 全部内聚在 `gen-skill-docs.ts` 会导致 ~6000 行巨型文件，严重影响可维护性 | Phase 1 |

---

## 修订后的迁移路线图

基于深入分析结果，按优先级排列。每个 Phase 引用 [upstream-sync-rules.md](./upstream-sync-rules.md) 中的规则编号。

### Phase 0: 安全修复 ✅ 已完成

**目标**：修复 `bin/gstack-slug` 安全漏洞。
**工作量**：~15 分钟。

| 步骤 | 内容 | 规则 | 状态 |
|------|------|------|------|
| 0.1 | 对齐上游 gstack-slug：增加 `tr -cd` 安全过滤、`\|\| true` 容错、fallback 链 | 规则 4（`$_STATE_DIR`）, 规则 9（zsh 兼容） | ✅ |
| 0.2 | `bun test` 确认无破坏 | 规则 8 | ✅ |

### Phase 1: Resolver 模块化 + 核心 Placeholder

**目标**：将 1920 行单体 `gen-skill-docs.ts` 拆分为模块化架构，同时引入高优先级的 16 个核心 placeholder。

> ✅ **架构决策（已批准）**：`scripts/resolvers/` 目录拆分已获批准（2026-03-31），见上方[已批准的结构变更](#已批准的结构变更)。

| 步骤 | 内容 | 风险 | 关键规则 | 状态 |
|------|------|------|---------|------|
| 1.1 | 建立 `scripts/resolvers/` 目录，引入 `types.ts`（添加 `codebuddy` Host + `preambleTier` + `benefitsFrom`）、`constants.ts` | 低 | 规则 8 | ✅ 已完成 |
| 1.2 | 逐个提取现有 10 个 resolver 到模块文件（preamble → browse → design → review → testing → utility），保持输出一致 | 中 | 规则 8（每提取一个就跑 `bun test`） | ✅ 已完成 |
| 1.3 | 引入新 resolver 模块：`confidence.ts`（37 行，独立）、`composition.ts`（48 行，独立）、`codex-helpers.ts`（133 行）+ 参数化 placeholder 语法 | 低 | 规则 6 | ✅ 已完成 |
| 1.4 | 重写 `generatePreamble()` 支持 preambleTier T1-T4 分层 | 中 | 需剥离 36 处 telemetry | ✅ 已完成 |
| 1.5 | 引入 review.ts 中的核心 resolver：ADVERSARIAL_STEP、SCOPE_DRIFT、PLAN_COMPLETION_AUDIT_*、PLAN_VERIFICATION_EXEC、CODEX_SECOND_OPINION | 中 | telemetry 剥离 | ✅ 已完成 |
| 1.6 | 引入 testing.ts：TEST_FAILURE_TRIAGE、TEST_COVERAGE_AUDIT_* | 低 | 独立模块 | ✅ 已完成 |
| 1.7 | 引入 utility.ts：CHANGELOG_WORKFLOW、CO_AUTHOR_TRAILER、DEPLOY_BOOTSTRAP、SLUG_*  + 更新 BASE_BRANCH_DETECT（GitLab 支持） | 低 | 独立 | ✅ 已完成 |
| 1.8 | 建立 `index.ts` 注册中心，`gen-skill-docs.ts` 从 `index.ts` 导入 RESOLVERS | 低 | — | ✅ 已完成 |
| 1.9 | 验证：`bun run gen:skill-docs` 产出与拆分前 diff 为零（对已有 placeholder），新 placeholder 仅在新/更新的模板中使用 | — | 规则 8 | ✅ 已完成 |

**Phase 1 进度总结（2026-03-31）**：

已完成的步骤（1.1 + 1.2 + 1.3 + 1.4 + 1.5 + 1.6 + 1.7 + 1.8 + 1.9）— **Phase 1 全部完成 ✅**：
- ✅ `scripts/resolvers/` 目录建立，含 12 个文件共 ~3000 行
- ✅ `types.ts`：`Host` 含 `codebuddy`、`TemplateContext` 含 `preambleTier` + `benefitsFrom`、`ResolverFn` 类型、品牌名映射常量
- ✅ `constants.ts`：`AI_SLOP_BLACKLIST`、`OPENAI_HARD_REJECTIONS`、`OPENAI_LITMUS_CHECKS`、`codexErrorHandling()`
- ✅ 10 个现有 resolver 全部提取到域模块（preamble.ts / browse.ts / design.ts / review.ts / testing.ts / utility.ts）
- ✅ `index.ts` 注册中心：`RESOLVERS` 映射表含全部 27 个 placeholder，barrel export 统一所有类型和常量
- ✅ `gen-skill-docs.ts` 从 ~1920 行缩减到 ~625 行，零残留 `function generate*`
- ✅ `gen-skill-docs.ts` placeholder 正则升级：支持参数化语法 `{{NAME:arg1:arg2}}`
- ✅ `confidence.ts`（37 行）：CONFIDENCE_CALIBRATION — 1-10 分置信度评分体系
- ✅ `composition.ts`（48 行）：INVOKE_SKILL — 组合机制，支持 `{{INVOKE_SKILL:skill-name:skip=...}}` 参数化语法
- ✅ `codex-helpers.ts`（133 行）：Codex 集成共享辅助函数（codexBinaryDetect / codexReviewBlock / codexAdversarialBlock / crossModelAnalysis / codexPlanReviewBlock / codexReviewPersist）
- ✅ `preamble.ts`：引入 preambleTier T1-T4 分层逻辑 + `generateVoiceDirective()` + `generateSearchBeforeBuilding()` 两个新子生成器
- ✅ `gen-skill-docs.ts`：新增 `SKILL_TIER_MAP`（17 个 skill → tier 映射），tier 赋值代码已就绪但暂未激活（Phase 3 逐 skill 启用）
- ✅ `review.ts`：新增 6 个 resolver（SCOPE_DRIFT / ADVERSARIAL_STEP / CODEX_SECOND_OPINION / PLAN_COMPLETION_AUDIT_SHIP / PLAN_COMPLETION_AUDIT_REVIEW / PLAN_VERIFICATION_EXEC），利用 `codex-helpers.ts` 辅助函数，品牌名参数化 + 路径参数化 + CODEX_BOUNDARY 适配
- ✅ `testing.ts`：新增 4 个 resolver（TEST_FAILURE_TRIAGE / TEST_COVERAGE_AUDIT_PLAN / TEST_COVERAGE_AUDIT_SHIP / TEST_COVERAGE_AUDIT_REVIEW），路径参数化（plan artifact 使用 `ctx.paths.binDir` + `ctx.paths.skillRoot` 推导），品牌名参数化（HOST_SHORT_BRANDS）
- ✅ `utility.ts`：新增 5 个 resolver（SLUG_EVAL / SLUG_SETUP / DEPLOY_BOOTSTRAP / CO_AUTHOR_TRAILER / CHANGELOG_WORKFLOW），更新 BASE_BRANCH_DETECT 新增 GitLab 支持 + git-native fallback
- ✅ `test/helpers/touchfiles.ts` 新增 `'scripts/resolvers/**'` 全局触发
- ✅ 21 个 SKILL.md 全部 FRESH（新增 Voice & Search section，输出一致性验证通过）
- ✅ 全量测试通过（1034 pass, 0 fail）、零 lint 错误

**Phase 1.4 实现说明**：
- `generatePreamble()` 现在根据 `ctx.preambleTier` 决定包含哪些 section：
  - T1（精简）：bash setup + proactive + ask-user + contributor + completion status（无 voice/search/lake/telemetry/completeness）
  - T2-T4（标准/增强/完整）：包含全部 10 个 section
  - undefined（遗留）：包含全部 10 个 section（向后兼容）
- tier 映射已定义在 `SKILL_TIER_MAP` 但**未激活**——所有 skill 当前 preambleTier=undefined，确保零行为变更。激活推迟到 Phase 3（模板升级），逐个 skill 启用并更新对应测试
- telemetry 剥离**未在本步执行**（按文档建议：36 处 telemetry 剥离与 tier 重写不应在同一步完成）
- 新增上游 preamble 子 section：Voice & Communication Style（防 AI sycophancy）、Search Before Building（先搜后建开发习惯）

**Phase 1.5 实现说明**：
- `review.ts` 从 48 行扩展到 ~470 行，新增 6 个公开 resolver + 2 个内部辅助函数
- 6 个新 resolver 覆盖上游 review.ts 中的所有高优先级 placeholder：
  - `generateScopeDrift()` — 范围漂移检测，review/ship 共用，step 编号自动切换
  - `generateAdversarialStep()` — 对抗性审查（始终启用），含 Claude/CodeBuddy 子 agent + Codex 对抗 + 大 diff 结构化审查，codex host 返回空
  - `generateCodexSecondOpinion()` — 跨模型第二意见（office-hours 用），含 Startup/Builder 双模式，codex host 返回空
  - `generatePlanCompletionAuditShip()` / `generatePlanCompletionAuditReview()` — 计划完成度审计，ship 模式有 gate 逻辑，review 模式与 scope drift 集成
  - `generatePlanVerificationExec()` — 计划验证执行，内联 /qa-only 技能
- **CodeBuddy 适配要点**：
  - 品牌名全部参数化（`HOST_PLATFORM_NAMES[ctx.host]`），产出随 host 变化
  - 路径全部参数化（`ctx.paths.binDir`），无硬编码 `~/.claude/` 或 `~/.gstack/`
  - `CODEX_BOUNDARY` 适配为通用描述（"skill definition directories"），不绑定特定平台
  - `generatePlanFileDiscovery()` 中搜索路径使用 `ctx.paths.skillRoot` 推导，无 `~/.gstack/projects/` 硬编码
  - `generatePlanVerificationExec()` 中 `$_GSTACK_ROOT` 替换 `${CLAUDE_SKILL_DIR}`
  - zsh 兼容：plan discovery 含 `setopt +o nomatch` 守卫
  - 非阻塞错误处理：使用 `codexErrorHandling()` 共享函数
- **注册中心**：`index.ts` RESOLVERS 从 12 → 18 个 placeholder
- **测试覆盖**：45 个新测试验证所有 resolver 的输出正确性、host 适配、codex 排除、step 编号切换、路径参数化

Phase 1.6-1.7 已于后续步骤完成，见下方实现说明。

**Phase 1.6 实现说明**：
- `testing.ts` 新增 4 个 resolver：TEST_FAILURE_TRIAGE / TEST_COVERAGE_AUDIT_PLAN / TEST_COVERAGE_AUDIT_SHIP / TEST_COVERAGE_AUDIT_REVIEW
- TEST_FAILURE_TRIAGE：T1-T4 分诊步骤，REPO_MODE 集成，GitHub/GitLab issue 创建，品牌名参数化（`HOST_SHORT_BRANDS`），路径参数化（`$_GSTACK_ROOT/../review/TODOS-format.md`）
- TEST_COVERAGE_AUDIT：共享 `generateTestCoverageAuditInner(ctx, mode)` 内部函数，plan/ship 模式含 artifact 路径（`ctx.paths.binDir` + `ctx.paths.skillRoot`），review 模式无 artifact
- 路径适配：上游 `~/.gstack/projects/$SLUG` → 项目级 `ctx.paths.skillRoot/../..`（state dir）
- 注册中心 18 → 22 个 placeholder

**Phase 1.7 实现说明**：
- `utility.ts` 从 1 个函数扩展到 7 个：SLUG_EVAL / SLUG_SETUP / BASE_BRANCH_DETECT（更新）/ DEPLOY_BOOTSTRAP / CO_AUTHOR_TRAILER / CHANGELOG_WORKFLOW
- BASE_BRANCH_DETECT 扩展：从 GitHub-only 到 GitHub + GitLab（`glab mr view`/`glab repo view`）+ git-native fallback（`git symbolic-ref`）
- CO_AUTHOR_TRAILER：使用 `HOST_COAUTHOR_TRAILERS[ctx.host]` 查表（上游为 hardcoded if/else + factory host）
- SLUG_SETUP：路径参数化（`ctx.paths.binDir` + `ctx.paths.skillRoot/../..`），无 `~/.gstack/projects/$SLUG` 硬编码
- DEPLOY_BOOTSTRAP：检测 6 大部署平台（fly/render/vercel/netlify/heroku/railway）
- CHANGELOG_WORKFLOW：6 步 CHANGELOG 自动生成工作流
- 注册中心 22 → 27 个 placeholder（Phase 1 全部完成）

### Phase 2: Learnings 系统

**目标**：引入跨 session 记忆能力。

| 步骤 | 内容 | 关键规则 | 状态 |
|------|------|---------|------|
| 2.1 | 迁移 `scripts/resolvers/learnings.ts`（96 行） | 规则 1（路径参数化） | ✅ |
| 2.2 | 迁移 `bin/gstack-learnings-log`（31 行）和 `bin/gstack-learnings-search`（132 行） | 规则 4（`$_STATE_DIR`）, 规则 6（注册到 `BIN_SCRIPTS`）, 规则 9（zsh 兼容） | ✅ |
| 2.3 | 迁移 `/learn` skill 模板（5KB） | 规则 1（frontmatter）, 规则 3（跨 block 变量） | ⏭️ 延后至 Phase 4A |
| 2.4 | 适配存储路径——上游用 `~/.gstack/projects/$SLUG/learnings.jsonl`，我们用 `$_STATE_DIR/learnings.jsonl`（项目级，无需 `$SLUG` 分层） | 规则 4 | ✅ 已合并到 2.1/2.2 |
| 2.5 | 迁移 `bin/gstack-repo-mode`（94 行）— learnings 的 `--cross-project` 功能依赖此脚本 | 规则 4, 规则 9 | ✅ |
| 2.6 | 更新已有 skill 模板（review/ship/investigate/office-hours/plan-ceo/plan-eng）添加 `{{LEARNINGS_SEARCH}}` 和 `{{LEARNINGS_LOG}}` | 规则 8 | ⏭️ 延后至 Phase 3 |
| 2.7 | 验证：`bun test` + `bun run gen:skill-docs` + 手动测试 learning 记录/搜索 | 规则 8 | ✅ 1034 tests pass |

**Phase 2 实现说明**：
- `learnings.ts` 从上游直接适配，路径已参数化（`ctx.paths.binDir`）
- bin 脚本使用标准 state dir 检测模式（从 `gstack-config` 复制），存储路径为 `$_STATE_DIR/learnings.jsonl`（无 slug 分层）
- `gstack-learnings-search` 的 `--cross-project` 改为搜索兄弟项目 `.gstack/` 目录 + 全局 `~/.gstack/`（适配 project-local-state 模式）
- `gstack-repo-mode` cache 从 `~/.gstack/projects/$SLUG/repo-mode.json` 改为 `$_STATE_DIR/repo-mode.json`
- 注册中心 27 → 29 个 placeholder，BIN_SCRIPTS 8 → 11 个

**Phase 2 范围调整决策**：

实施过程中发现 Phase 2.3 和 2.6 与 Phase 2 的其他步骤性质不同——2.1/2.2/2.4/2.5 是基础设施层（resolver 函数 + bin 脚本），而 2.3 和 2.6 是模板层：

- **Phase 2.3**（`/learn` skill 模板）→ 延后至 **Phase 4A**。原因：`/learn` 是一个完整的 skill 模板迁移（需要 frontmatter 转换、跨 block 变量处理、CodeBuddy 路径适配），本质上是"新 skill 模板"工作，放在 Phase 4 的 skill 模板迁移批次中与其他新 skill 一起执行更合理。Phase 2 已完成其所有基础设施前置依赖（resolver + bin 脚本）。
- **Phase 2.6**（在 6 个已有 skill 中添加 `{{LEARNINGS_SEARCH}}` 和 `{{LEARNINGS_LOG}}`）→ 延后至 **Phase 3**。原因：这些模板引用需要与 Phase 3 中同一 skill 的其他模板升级（如 SCOPE_DRIFT、ADVERSARIAL_STEP、TEST_FAILURE_TRIAGE 等）在同一次编辑中一起完成，避免对同一个 .tmpl 文件做多次独立修改。

此调整不影响最终交付物——所有功能在 Phase 3/4 完成后与原计划一致。Phase 2 的基础设施层已 100% 完成，为 Phase 3/4 的模板层工作提供了完整前置条件。

### Phase 3: 已有 Skill 模板升级

**目标**：将 7 个已有 skill 的模板对齐上游改进。依赖 Phase 1 完成（新 placeholder 可用）+ Phase 2 基础设施（Learnings resolver + bin 脚本已就绪）。

> **范围变更说明**：Phase 2.6 原计划在 Phase 2 中为 6 个已有 skill 添加 `{{LEARNINGS_SEARCH}}` 和 `{{LEARNINGS_LOG}}`。实施 Phase 2 时决定将此工作延后至 Phase 3 合并执行——原因是这些模板引用与其他模板升级（如 SCOPE_DRIFT、ADVERSARIAL_STEP）需要在同一次模板编辑中一起完成，避免对同一个 skill 模板做多次独立修改。

| 顺序 | Skill | 主要变更 | 工作量 | 来源 | 状态 |
|------|-------|---------|--------|------|------|
| 3.1 | review | +SCOPE_DRIFT, +PLAN_COMPLETION_AUDIT, +CONFIDENCE_CALIBRATION, +ADVERSARIAL_STEP, +TEST_COVERAGE_AUDIT, +**LEARNINGS_SEARCH**, +**LEARNINGS_LOG**, +Step 5.8 Persist | 中 | Phase 1 + **Phase 2.6** | ✅ |
| 3.2 | ship | 移除 review gate 阻断, +TEST_FAILURE_TRIAGE, +PLAN_COMPLETION_AUDIT, +PLAN_VERIFICATION_EXEC, +SCOPE_DRIFT, +CHANGELOG_WORKFLOW, +CO_AUTHOR_TRAILER, +**LEARNINGS_SEARCH**, +**LEARNINGS_LOG**, +GitLab MR | 大 | Phase 1 + **Phase 2.6** | ✅ |
| 3.3 | office-hours | +Anti-Sycophancy Rules, +Pushback Patterns, +Landscape Awareness, +Founder Resources (34), +Design Mockup/Sketch, +SPEC_REVIEW_LOOP, +CODEX_SECOND_OPINION, +**LEARNINGS_SEARCH**, +BROWSE_SETUP, +SLUG_EVAL/SLUG_SETUP, Rule 11 改写 | 大 | Phase 1 + **Phase 2.6** | ✅ |
| 3.4 | plan-eng-review | +CODEX_PLAN_REVIEW, +CONFIDENCE_CALIBRATION, +**LEARNINGS_SEARCH** | 小 | Phase 1 + **Phase 2.6** | ✅ |
| 3.5 | plan-ceo-review | +INVOKE_SKILL:office-hours, +**LEARNINGS_SEARCH** | 小 | Phase 1 + **Phase 2.6** | ✅ |
| 3.6 | investigate | +**LEARNINGS_LOG** | 小 | **Phase 2.6** | ✅ |
| 3.7 | qa | 小幅更新 | 小 | Phase 1 | ✅ |

**关键行为变更决策**：
- ✅ ship: review gate 从阻断改为信息性提示（跟随上游）
- ✅ review: 硬编码 Codex opinion → 模板化 `{{ADVERSARIAL_STEP}}`（更灵活）
- ✅ office-hours: 引入 Anti-Sycophancy（防止 AI 过于顺从）

**预计工作量**：2-3 天。

**Phase 3.1 实现说明（review 模板升级，commit a745d87）**：
- review 模板从 ~290 行升级到 ~360 行
- 新增 6 个 resolver 引用：`{{SCOPE_DRIFT}}`, `{{PLAN_COMPLETION_AUDIT_REVIEW}}`, `{{CONFIDENCE_CALIBRATION}}`, `{{ADVERSARIAL_STEP}}`, `{{TEST_COVERAGE_AUDIT_REVIEW}}`, `{{LEARNINGS_SEARCH}}`
- 新增 `{{LEARNINGS_LOG}}` + Step 5.8 Persist（metrics 持久化到 `~/.gstack/analytics/`）
- frontmatter `allowed-tools` 添加 WebSearch
- 品牌名参数化、路径参数化，zsh 兼容

**Phase 3.2 实现说明（ship 模板升级，commit b06ccb0）**：
- ship 模板从 ~699 行升级到 ~850+ 行
- Review gate 从阻断改为信息性提示（跟随上游）
- 新增 7 个 resolver 引用：`{{TEST_FAILURE_TRIAGE}}`, `{{PLAN_COMPLETION_AUDIT_SHIP}}`, `{{PLAN_VERIFICATION_EXEC}}`, `{{SCOPE_DRIFT}}`, `{{CHANGELOG_WORKFLOW}}`, `{{CO_AUTHOR_TRAILER}}`, `{{LEARNINGS_SEARCH}}` + `{{LEARNINGS_LOG}}`
- 新增 GitLab MR 支持、Distribution Pipeline、ship metrics 持久化

**Phase 3.3 实现说明（office-hours 模板升级）**：
- office-hours 模板从 ~529 行升级到 ~770+ 行（+46%），差异最大的 skill
- 新增 3 个 resolver 实现：`generateDesignSketch()` + `generateDesignMockup()` in `design.ts`、`generateSpecReviewLoop()` in `review.ts`
- 注册中心 29 → 32 个 resolver（DESIGN_SKETCH / DESIGN_MOCKUP / SPEC_REVIEW_LOOP）
- frontmatter 扩展：description 改为 "Proactively invoke"、`allowed-tools` 添加 WebSearch
- Phase 2A 强化：Anti-Sycophancy Rules（5 个 "Never say" + 2 个 "Always do"）、Pushback Patterns（5 个 BAD/GOOD 对比示例）
- 新增 Phase 2.75 Landscape Awareness：WebSearch + privacy gate + 三层综合分析 + eureka check
- Phase 6 Beat 3 按规则 11 改写：去除 Garry Tan 个人宣传 + YC ref CTA → 客观的 Founder Community Prompt（三 tier 结构）
- 新增 Beat 3.5 Founder Resources：34 个资源池（视频/播客/文章）+ dedup 机制 + analytics logging
- `{{SLUG_EVAL}}`/`{{SLUG_SETUP}}` 替代硬编码 state dir 逻辑
- `{{CODEX_SECOND_OPINION}}`、`{{DESIGN_MOCKUP}}`、`{{DESIGN_SKETCH}}`、`{{SPEC_REVIEW_LOOP}}`、`{{LEARNINGS_SEARCH}}`、`{{BROWSE_SETUP}}` 引入
- 14 个新验证测试，全量 1089 tests pass, 0 fail

**Phase 3.4-3.7 实现说明（plan-eng-review / plan-ceo-review / investigate / qa 模板升级）**：
- 新建 `generateCodexPlanReview()` resolver in `review.ts`，利用 `codexPlanReviewBlock()` + `codexBinaryDetect()` + `codexErrorHandling()` 辅助函数，codex host 返回空
- 注册中心 32 → 33 个 resolver（+CODEX_PLAN_REVIEW）
- **plan-eng-review**：
  - frontmatter `allowed-tools` 添加 WebSearch
  - 硬编码 Step 0.5 Codex plan review 替换为 `{{CODEX_PLAN_REVIEW}}`（品牌名参数化，错误处理标准化）
  - 新增 `{{CONFIDENCE_CALIBRATION}}`（1-10 分置信度评分体系）
  - 新增 `{{LEARNINGS_SEARCH}}`（跨 session 机构记忆搜索）
  - Review Log 路径从硬编码 `~/.claude/skills/gstack/bin/` → `$_GSTACK_ROOT/bin/`
- **plan-ceo-review**：
  - frontmatter `allowed-tools` 添加 WebSearch
  - 新增 `{{LEARNINGS_SEARCH}}`（系统审计后、Step 0 前）
  - 新增 `{{INVOKE_SKILL:office-hours:skip=Preamble,Prior Learnings,Confidence Calibration}}`（可选产品头脑风暴）
  - Review Log 路径从硬编码 `~/.claude/skills/gstack/bin/` → `$_GSTACK_ROOT/bin/`
- **investigate**：新增 `{{LEARNINGS_LOG}}`（调查结论记录到 learnings.jsonl）
- **qa**：新增 `{{LEARNINGS_LOG}}`（QA 发现记录到 learnings.jsonl）
- 全部 63 个 SKILL.md FRESH（21 Claude + 20 CodeBuddy + 20 Codex + 2 browse），全量测试通过，零 lint

**Phase 4A 实现说明（/learn skill 模板迁移）**：
- 从上游 `learn/SKILL.md.tmpl` 迁移到 `skill-templates/learn/SKILL.md.tmpl`，完整应用 12 条迁移规则
- **frontmatter 处理**（规则 1）：保留 name/version/description/allowed-tools，移除 `preamble-tier`（由 `SKILL_TIER_MAP` 管理）
- **路径替换**（规则 1/4）：所有 `~/.claude/skills/gstack/bin/` → `$_GSTACK_ROOT/bin/`（编译器自动注入探测链）
- **移除 gstack-slug eval**：上游每个 bash block 开头的 `eval "$(~/.claude/skills/gstack/bin/gstack-slug 2>/dev/null)"` 全部移除（我们的 bin 脚本内建 state dir 检测，不需要外部 slug eval）
- **Stats 命令重写**（规则 4）：上游使用 `GSTACK_HOME/projects/$SLUG/learnings.jsonl` 的 stats 命令完全重写为内联 `$_STATE_DIR` 检测模式（project-local state，无 slug 分层）
- **品牌中性化**（规则 11）：Export 章节中 "CLAUDE.md" 引用改为 "project documentation"
- **6 个命令完整保留**：Show recent / Search / Prune / Export / Stats / Manual add
- **SKILL_TIER_MAP 注册**：`'learn': 2`（T2 — 标准 preamble）
- **构建验证**：全部 3 平台成功生成（22 claude + 21 codebuddy + 21 codex SKILL.md），品牌隔离扫描干净
- **测试覆盖**：12 个新测试 — 存在性检查（3 hosts）、frontmatter、6 命令、bin 脚本引用、HARD GATE、`.claude` 残留、"Claude Code" 残留、`GSTACK_HOME`/`projects/$SLUG` 残留、`$_GSTACK_ROOT` 探测链、preamble 展开
- 全量 1148 tests pass（+12 new）, 0 fail, 零 lint 错误

**Phase 4B 实现说明（/setup-deploy skill 模板迁移）**：
- 从上游 `setup-deploy/SKILL.md.tmpl` 迁移到 `skill-templates/setup-deploy/SKILL.md.tmpl`，完整应用 12 条迁移规则
- **frontmatter 处理**（规则 1a）：保留 name/description/allowed-tools，移除 `preamble-tier: 2` 和 `version: 1.0.0`（由 `SKILL_TIER_MAP` 管理）
- **新增 trigger**：添加 `Proactively suggest when:` 触发短语（上游缺少，我们补充）
- **Shell 语法修正**：上游 Step 2 中有两处 `||` `&&` 混用的优先级 bug（如 `[ -f vercel.json ] || [ -d .vercel ] && echo "PLATFORM:vercel"` — 第一个条件为 true 时短路跳过 echo），添加括号修正为 `([ -f vercel.json ] || [ -d .vercel ]) && echo "PLATFORM:vercel"`
- **CLAUDE.md 引用保留**：模板中多处引用 `CLAUDE.md` 作为部署配置存储文件名，与现有模式一致（如 design-consultation、ship、document-release）——编译器不负责替换此文件名
- **无需规则 4 处理**：模板无 `~/.gstack/` 路径引用
- **无需规则 6 处理**：不引入新 bin 脚本
- **SKILL_TIER_MAP 注册**：`'setup-deploy': 2`（T2 — 标准 preamble）
- **构建验证**：全部 3 平台成功生成（23 claude + 22 codebuddy + 22 codex SKILL.md），品牌隔离扫描干净
- **测试覆盖**：14 个新专用测试 — 存在性检查（3 hosts）、frontmatter（name, no preamble-tier, no version）、6 步骤、6 平台、deploy config template、Important Rules、`.claude` 残留、"Claude Code" 残留、`GSTACK_HOME`/`projects/$SLUG` 残留、`$_GSTACK_ROOT` 探测链、preamble 展开、"Use when" trigger、"Proactively suggest" trigger
- 注册到 5 个跨 skill 测试列表（preambleSkillDirs / contributorSkillDirs / completenessSkillDirs / SKILLS_REQUIRING_TRIGGERS / SKILLS_REQUIRING_PROACTIVE）
- 全量 1184 tests pass（+26 new）, 0 fail, 零 lint 错误

### Phase 4: 新 Skill 模板

按价值逐个迁移。**每个 skill 迁移时都要过一遍 [upstream-sync-rules.md](./upstream-sync-rules.md) 中的"上游同步操作清单"。**

> **范围变更说明**：Phase 2.3 原计划在 Phase 2 中迁移 `/learn` skill 模板（5KB）。实施 Phase 2 时决定将此工作延后至 Phase 4A——原因是 `/learn` 是一个完整的 skill 模板（含 frontmatter 转换、跨 block 变量处理），本质上是"新 skill 模板迁移"，与 Phase 2 的基础设施工作（resolver + bin 脚本）性质不同，放在 Phase 4 的 skill 模板迁移流程中执行更合理。Phase 2 已为其完成了所有基础设施前置依赖。

| 批次 | Skill | 理由 | 特别注意 | 来源 | 状态 |
|------|-------|------|---------|------|------|
| 4A | `/learn` | 学习系统的用户界面 | 基础设施已就绪 ✅（Phase 2 resolver + bin 脚本），模板迁移需规则 1（frontmatter）+ 规则 3（跨 block 变量） | 原 **Phase 2.3** 延后 | ✅ |
| 4B | `/setup-deploy` | 低依赖，独立 skill | 需 SLUG_SETUP + DEPLOY_BOOTSTRAP resolver | 原计划 | ✅ |
| 4C | `/cso` | 安全审计，刚需 | hooks 需降级（规则 2），ADVERSARIAL_STEP | 原计划 | ✅ |
| 4D | `/autoplan` | CEO → 设计 → 工程评审自动化 | INVOKE_SKILL + SPEC_REVIEW_LOOP | 原计划 | ✅ |
| 4E | `/benchmark` | 性能回归检测 | preambleTier T1 | 原计划 | ✅ |
| 4F | `/canary` | 金丝雀监控 | 依赖 browse + 部署基础设施 | 原计划 | ✅ |
| 4G-1 | `/land-and-deploy` | 合并+部署+验证全流程 | 所有 resolver 已就绪（PREAMBLE/BROWSE_SETUP/BASE_BRANCH_DETECT/DEPLOY_BOOTSTRAP/SLUG_EVAL） | 原计划 4G 拆分 | ✅ |
| 4G-2 | `/design-shotgun`、`/design-html` | 设计系统 skill | 新建 DESIGN_SETUP + DESIGN_SHOTGUN_LOOP resolver，design binary 检测 + 多变体生成循环 | 原计划 4G 拆分 | ✅ |

**预计工作量**：3-5 天（分批执行）。

### Phase 5: Browse 增强 ✅ 全部完成

| 步骤 | 内容 | 关键规则 | 状态 |
|------|------|---------|------|
| 5.1 | 迁移 `platform.ts`（18 行）+ `bun-polyfill.cjs`（110 行） | 规则 5 | ✅ |
| 5.2 | 迁移 `cdp-inspector.ts`（870 行）| 规则 5 | ✅ |
| 5.3 | 迁移有价值的新命令：inspect, style, cleanup, prettyscreenshot, frame | 规则 6（注册到 commands.ts） | ✅ |
| 5.4 | 迁移 `server.ts` 中的非 Chrome 扩展改动（inspector HTTP 端点、`isPortAvailable()`、安全内容包装、`PAGE_CONTENT_COMMANDS`） | 仔细区分 Chrome 扩展代码 | ✅ |
| 5.5 | 升级 browse `SKILL.md.tmpl`：新增 CSS Inspector & Style Modification 章节 + preambleTier T1（由 `SKILL_TIER_MAP['browse']=1` 管理，frontmatter 无需 `preamble-tier` 字段） | 规则 1 | ✅ |
| 5.6 | 迁移有价值的新测试（31 个集成测试 + `inspector.html` fixture） | 规则 8 | ✅ |
| 5.7 | Diff 合并现有文件的 bug 修复 — frame context 传播仅限新命令（与上游一致，legacy 命令保持 page-level 操作） | 逐文件 diff | ✅ 评估完毕 |

**预计工作量**：2-3 天。

**Phase 5 实现说明**：

已完成 4 个逻辑 commit（按 bisect 规范拆分）：
1. **feat(browse): add cross-platform abstractions** — `platform.ts`（IS_WINDOWS/TEMP_DIR/isPathWithin()）+ `bun-polyfill.cjs`（Node.js 兼容层：Bun.serve/spawnSync/spawn/sleep）
2. **feat(browse): add CDP inspector engine** — `cdp-inspector.ts`（870 行）：PageLike 类型（Page | Frame）、CDP session 管理（WeakMap per-page + auto-detach on navigation）、`resolveOwnerPage()`/`resolveDocumentRoot()`（Frame→iframe contentDocument 解析）、`inspectElement()`（full CSS cascade + box model + computed styles + specificity sorting + overridden marking）、`modifyStyle()`（CSS.setStyleTexts + inline fallback）、`undoModification()`/`resetModifications()`、`formatInspectorResult()`（CLI 文本输出）、`computeSpecificity()`（CSS specificity 计算）
3. **feat(browse): add inspect, style, cleanup, prettyscreenshot, frame commands** — commands.ts（5 新命令注册 + `PAGE_CONTENT_COMMANDS` + `wrapUntrustedContent()` + load-time bidirectional validation）、read-commands.ts（inspect handler with `getActiveFrameOrPage()`）、write-commands.ts（style/cleanup/prettyscreenshot handlers，cleanup 含 6 类清理 selector）、meta-commands.ts（frame command: CSS selector/`@ref`/`--name`/`--url`/`main`）、server.ts（5 个 inspector HTTP 端点 + `isPortAvailable()` + untrusted content wrapping）、browser-manager.ts（`activeFrame` 字段 + `setFrame()`/`getFrame()`/`getActiveFrameOrPage()` with detach auto-recovery）、browse/SKILL.md.tmpl（CSS Inspector & Style Modification 文档章节）
4. **test(browse): add 31 integration tests for new commands** — `new-commands.test.ts`（283 行，6 describe blocks：inspect 6 / style 7 / cleanup 5 / prettyscreenshot 7 / frame 5 / cross-feature inspect-in-frame 1）+ `inspector.html` fixture（styled elements + cookie banner + ad container + social share + iframe with srcdoc + sticky banner）

**Phase 5.7 评估结论**：
- Legacy 命令（text/html/click/fill 等 ~20 个）使用 `bm.getPage()` 而非 `bm.getActiveFrameOrPage()` — **与上游行为一致**，frame 命令仅用于新增的 inspector 相关命令
- server.ts 中 3 个 inspector HTTP 端点使用 `browserManager.getPage()` — HTTP API 不支持 iframe context，但 CLI 命令层已正确使用 `getActiveFrameOrPage()`，实际使用场景不受影响
- 将 frame context 传播到所有 legacy 命令是一个**独立增强**，不属于上游同步范围
- browse/src/ 目录下零 TODO/FIXME 残留

### Phase 6: 运维与工具链 ✅ 全部完成

| 步骤 | 内容 | 状态 |
|------|------|------|
| 6.1 | 迁移通用 bin 脚本：gstack-open-url (15 行)、gstack-platform-detect (21 行)、gstack-snapshot | ⏭️ 延后（无模板引用，P4 优先级，已记录在 TODOS.md） |
| 6.2 | 评估引入 `lib/worktree.ts`（land-and-deploy 依赖） | ❌ 永久排除（land-and-deploy 模板零 worktree 引用，无运行时依赖） |
| 6.3 | 评估引入 `design/` 目录（design-html/design-shotgun 依赖） | ⏭️ 跳过（`scripts/resolvers/design.ts` 已内含 design binary 检测 + `DESIGN_NOT_AVAILABLE` 优雅降级） |
| 6.4 | 同步有价值的上游测试（audit-compliance 等） | ✅ 无需操作（已有 1487+ 测试，含 audit-compliance 模式，覆盖全面） |
| 6.5 | 同步文档改进：ARCHITECTURE.md、ETHOS.md、BROWSER.md | ✅ 已完成（`docs/architecture.md` ✅ 已有、`docs/browser.md` ✅ 已有、`ETHOS.md` ✅ 已创建） |

**Phase 6 评估结论**：经过逐项评估，Phase 6 的 5 个子步骤中，仅 6.5 需要实际工作（创建 `ETHOS.md`），其余均为"无需操作"或"延后/排除"。6.1 的 3 个 bin 脚本无任何 skill 模板引用，降级为 P4 优先级在 TODOS.md 跟踪。6.2 `lib/worktree.ts` 确认无运行时依赖后永久排除。6.3 `design/` 目录的检测和降级逻辑已内建在 resolver 中。6.4 现有 1487+ 测试已充分覆盖。

**Phase 6.5 实现说明**：
- `docs/architecture.md`（23.8KB）：已有，覆盖 daemon model、execution model、security architecture
- `docs/browser.md`（16.49KB）：已有，覆盖 command reference 和 internals
- `ETHOS.md`：新创建，包含 Search Before Building 完整框架（三层：Codebase search / World search / Eureka moments），供 `/office-hours` 模板 Phase 2.75 Landscape Awareness 引用

---

## 已知差异清单

截至本文档最后更新时（基于 gstack v0.14.3 vs gstack-codebuddy v0.14.0），完整差异如下：

### 架构差异

| 差异项 | 上游 | 本地 | 迁移状态 | 所属 Phase |
|--------|------|------|---------|-----------|
| Resolver 模块化 | 13 文件/4063 行 | 12 文件/~3000 行（已模块化） | ✅ Phase 1 全部完成（架构已建立，全部 36 个 resolver 就绪） | 1+3+4G-2 |
| Placeholder 数量 | 39 个 | 36 个（已模块化管理） | ✅ Phase 1 全部完成 + Phase 3.3 新增 3 个 + Phase 3.4 新增 1 个 + Phase 4G-2 新增 2 个 | 1+3+4G-2 |
| Preamble 分层 (T1-T4) | ✅ | ✅ | ✅ Phase 1.4 已完成（tier 定义 + 生成器支持，激活延迟到 Phase 3） | 1 |
| TemplateContext 扩展 | `benefitsFrom` + `preambleTier` | ✅ 已添加 | ✅ Phase 1.1 已完成 | 1 |
| Host 类型 | `claude\|codex\|factory` | `claude\|codex\|codebuddy` | ✅ 已处理 | — |

### 横切系统差异

| 差异项 | 上游 | 本地 | 迁移状态 | 所属 Phase |
|--------|------|------|---------|-----------|
| Learnings 系统 | 跨 6 skill | ✅ resolver + bin 已就绪 + 6/6 模板已引用 | ✅ 基础设施 Phase 2 + 模板引用 Phase 3 全部完成 | 2+3 |
| Confidence Calibration | 跨 3 skill | ✅ resolver + 模板引用完成 | ✅ resolver Phase 1.3 + 模板引用 Phase 3 | 1+3 |
| Adversarial Step | 模板化，始终启用 | ✅ resolver + 模板引用完成 | ✅ resolver Phase 1.5 + 模板引用 Phase 3.1 | 1+3 |
| INVOKE_SKILL 组合 | ✅ | ✅ resolver + 模板引用完成 | ✅ resolver Phase 1.3 + 模板引用 Phase 3.5 | 1+3 |
| Scope Drift Detection | 共享 resolver | ✅ resolver + 模板引用完成 | ✅ resolver Phase 1.5 + 模板引用 Phase 3.1-3.2 | 1+3 |
| Test Failure Triage | ✅ | ✅ resolver + 模板引用完成 | ✅ resolver Phase 1.6 + 模板引用 Phase 3.2 | 1+3 |
| Test Coverage Audit | ✅ | ✅ resolver + 模板引用完成 | ✅ resolver Phase 1.6 + 模板引用 Phase 3.1-3.2 | 1+3 |
| Plan Completion Audit | ✅ | ✅ resolver + 模板引用完成 | ✅ resolver Phase 1.5 + 模板引用 Phase 3.1-3.2 | 1+3 |
| Repo Mode Detection | ✅ | ✅ bin 脚本已就绪 | ✅ Phase 2.5 已完成 | 2 |
| Telemetry | 39 处引用 | ❌ 永久排除 | 🔧 迁移时剥离 | — |

### Skill 模板差异

| Skill | 迁移状态 | 所属 Phase | 备注 |
|-------|---------|-----------|------|
| review (升级) | ✅ +6 新 placeholder + LEARNINGS | 3.1 | Phase 2.6 延后工作已合并 |
| ship (升级) | ✅ +7 新 placeholder + LEARNINGS + 行为变更 | 3.2 | review gate 阻断→信息性 + Phase 2.6 |
| office-hours (升级) | ✅ +46% 内容 + 3 新 resolver + Rule 11 | 3.3 | 差异最大 + Phase 2.6 + 规则 11 改写 |
| plan-eng-review (升级) | ✅ +CODEX_PLAN_REVIEW + CONFIDENCE + LEARNINGS | 3.4 | 含 Phase 2.6 + 新 CODEX_PLAN_REVIEW resolver |
| plan-ceo-review (升级) | ✅ +INVOKE_SKILL:office-hours + LEARNINGS | 3.5 | 含 Phase 2.6 |
| investigate (升级) | ✅ +LEARNINGS_LOG | 3.6 | Phase 2.6 延后工作 |
| qa (升级) | ✅ +LEARNINGS_LOG | 3.7 | 小幅更新 |
| `/autoplan` (新) | ✅ 已迁移 | 4D | 33KB |
| `/benchmark` (新) | ✅ 已迁移 | 4E | 9KB |
| `/canary` (新) | ✅ 已迁移 | 4F | 8KB |
| `/cso` (新) | ✅ 已迁移 | 4C | 34KB |
| `/design-html` (新) | ✅ 已迁移 | 4G-2 | 18KB，新建 DESIGN_SETUP resolver |
| `/design-shotgun` (新) | ✅ 已迁移 | 4G-2 | 11KB，新建 DESIGN_SHOTGUN_LOOP resolver |
| `/land-and-deploy` (新) | ✅ 已迁移 | 4G-1 | 43KB，所有 resolver 已就绪 |
| `/learn` (新) | ✅ 已迁移 | 4A | 5KB，Phase 2 基础设施 + Phase 4A 模板迁移完成 |
| `/setup-deploy` (新) | ✅ 已迁移 | 4B | 8KB，Phase 1 resolver（SLUG_SETUP + DEPLOY_BOOTSTRAP）已就绪 |
| `/connect-chrome` | ❌ 永久排除 | — | Chrome 扩展 |
| `/gstack-upgrade` | ❌ 永久排除 | — | 自更新机制 |
| `/browse` (独立 skill) | ✅ 已升级 | 5.5 | CSS Inspector 文档 + preambleTier T1 |

### Browse 差异

| 差异项 | 迁移状态 | 所属 Phase |
|--------|---------|-----------|
| `SKILL.md.tmpl` 新增 CSS Inspector 章节 + preambleTier T1 | ✅ 已完成 | 5.5 |
| `cdp-inspector.ts` (870 行) | ✅ 已完成 | 5.2 |
| `platform.ts` (18 行) | ✅ 已完成 | 5.1 |
| `bun-polyfill.cjs` (110 行) | ✅ 已完成 | 5.1 |
| `activity.ts` / `sidebar-*.ts` | ❌ 永久排除 | — |
| 5 个有价值的新命令 (inspect/style/cleanup/prettyscreenshot/frame) | ✅ 已完成 | 5.3 |
| 6 个 Chrome 扩展命令 | ❌ 永久排除 | — |
| `server.ts` 非扩展改动 (inspector 端点 + isPortAvailable + wrapUntrustedContent) | ✅ 已完成 | 5.4 |
| 31 个集成测试 + inspector.html fixture | ✅ 已完成 | 5.6 |
| 现有文件 bug 修复 (frame context 传播 — 与上游一致，仅限新命令) | ✅ 评估完毕 | 5.7 |
| `PAGE_CONTENT_COMMANDS` + `wrapUntrustedContent()` | ✅ 已完成 | 5.4 |

### Bin 脚本差异

| 脚本 | 迁移状态 | 所属 Phase |
|------|---------|-----------|
| `gstack-slug` (安全更新) | ✅ P0 已完成 | 0 |
| `gstack-learnings-log` | ✅ 已迁移 | 2.2 |
| `gstack-learnings-search` | ✅ 已迁移 | 2.2 |
| `gstack-repo-mode` | ✅ 已迁移 | 2.5 |
| `gstack-open-url` | ⏭️ 延后（无模板引用，P4） | 6.1 |
| `gstack-platform-detect` | ⏭️ 延后（无模板引用，P4） | 6.1 |
| `gstack-snapshot` | ⏭️ 延后（无模板引用，P4） | 6.1 |
| `gstack-relink` | ❌ 永久排除 | — |
| `gstack-uninstall` | ❌ 永久排除 | — |
| `gstack-update-check` | ❌ 永久排除 | — |
| `gstack-community-*` (3 个) | ❌ 永久排除 | — |

### 基础设施差异

| 差异项 | 迁移状态 | 所属 Phase |
|--------|---------|-----------|
| `lib/worktree.ts` (9.18KB) | ❌ 永久排除（无运行时依赖） | 6.2 |
| `design/` (22 文件) | ⏭️ 跳过（resolver 已内含检测+降级） | 6.3 |
| Chrome 扩展 (15 文件) | ❌ 永久排除 | — |
| `.github/` CI | ✅ 无需操作（已有充分测试覆盖） | 6.4 |
| `ARCHITECTURE.md` | ✅ 已有（`docs/architecture.md`） | 6.5 |
| `ETHOS.md` | ✅ 已创建 | 6.5 |
| `BROWSER.md` | ✅ 已有（`docs/browser.md`） | 6.5 |
| `DESIGN.md` | ❌ 永久排除 | — |

---

## 迁移工作量估算

| Phase | 内容 | 预计工作量 | 依赖 | 状态 |
|-------|------|-----------|------|------|
| **P0** | gstack-slug 安全修复 | 15 分钟 | 无 | ✅ 已完成 |
| **Phase 1** | Resolver 模块化 + 核心 Placeholder | 2-3 天 | 无 | ✅ 全部完成（1.1-1.9） |
| **Phase 2** | Learnings 系统 | 1-2 天 | Phase 1 | ✅ 基础设施完成（2.1/2.2/2.4/2.5 ✅, 2.3/2.6 延后） |
| **Phase 3** | 已有 Skill 模板升级 | 2-3 天 | Phase 1 + Phase 2（含 Phase 2.6 延后的 LEARNINGS 模板引用） | ✅ 全部完成（3.1-3.7 ✅） |
| **Phase 4** | 新 Skill 模板 | 3-5 天 | Phase 1-2（含 Phase 2.3 延后的 `/learn` 模板） | ✅ 全部完成（4A ✅ 4B ✅ 4C ✅ 4D ✅ 4E ✅ 4F ✅ 4G-1 ✅ 4G-2 ✅） |
| **Phase 5** | Browse 增强 | 2-3 天 | 无（可并行） | ✅ 全部完成（5.1-5.7） |
| **Phase 6** | 运维与工具链 | 1-2 天 | 部分依赖 Phase 4 | ✅ 全部完成（6.1 ⏭️ 延后 P4、6.2 ❌ 排除、6.3 ⏭️ 跳过、6.4 ✅ 无需操作、6.5 ✅ ETHOS.md 已创建） |
| **合计** | | **约 12-19 天** | | |

> 注：Phase 5 可与 Phase 2-4 并行执行，实际日历时间可压缩。

---

## 本次分析的特定风险

### 1. 上游架构演进风险

上游已经完成了 resolver 模块化（13 个文件，192KB），我们的 1920 行单体文件与上游的 diff 已经无法直接对比。建议：
- **Phase 1 应优先执行**——拖得越久，与上游的结构差距越大，后续迁移的人力成本指数增长
- 模块化完成后，后续每个 resolver 的迁移变为独立、低风险的操作

### 2. Telemetry 剥离风险

39 处 telemetry 引用分布在 3 个核心 resolver 文件中，剥离时需要确保：
- 不破坏周围的逻辑流
- 不遗留对 telemetry 变量的引用
- `grep -i telemetry` 后确认零残留

### 3. Preamble 重写风险

preamble 是最复杂的 resolver（604 行/31KB），重写为支持 T1-T4 tier 时：
- ✅ 保持现有输出不变——tier 未激活时所有 section 包含（向后兼容零 diff），已通过 877 测试验证
- ✅ 36 处 telemetry 剥离与 tier 重写**分步完成**——Phase 1.4 仅做 tier 分层，telemetry 剥离留给后续独立步骤

### 4. 版本号策略

建议在完成每个 Phase 后 bump 版本号：
- P0 完成：v0.9.1（安全修复）— ✅ 已完成
- Phase 1 完成：v0.10.0（架构升级）— ✅ 已完成
- Phase 2 完成：v0.11.0（learnings 系统）— ✅ 基础设施完成
- Phase 3 完成：v0.12.0（skill 模板升级）— ✅ 已完成
- Phase 4-6 完成：v0.13.0（新 skill + browse + 工具链）— ✅ 已完成

> **实际执行**：由于 P0-Phase 6 在密集的开发周期中连续完成，未逐 phase bump。最终统一 bump 到 **v0.14.0**（2026-04-03），CHANGELOG 和 VERSION 已同步更新。

---

## upstream-sync-rules.md 修订建议

基于本次分析，建议对通用规则文档做以下更新：

1. ✅ **项目目录结构章节**：已修订原则 2 为"模块拆分需征得同意"，`scripts/resolvers/` 已记录在"已批准的结构变更"表中（2026-03-31）。
2. ✅ **上游内容归属映射表**：已更新 "Resolver / 公共函数" 行的目标位置为 `scripts/resolvers/` 目录。
3. **永久排除清单**：确认 Chrome 扩展排除项覆盖了上游新增的 `activity.ts`、`sidebar-agent.ts`、`sidebar-utils.ts` 以及 connect/disconnect/focus/inbox/watch/state 命令。

---

## 同步日志

> 每次评估上游变更后在此追加记录。

| 日期 | 上游版本 | 评估内容 | 决策 | 执行状态 |
|------|---------|---------|------|---------|
| 2026-03-31 | v0.14.3 | 全量对比分析（初步） | 制定迁移路线图 (Phase 1-5) | ✅ 已完成 |
| 2026-03-31 | v0.14.3 | 深入分析（resolver/模板/bin/browse/基础设施） | 修订路线图为 P0 + Phase 1-6，补充 29 个 placeholder 差异、39 处 telemetry 剥离、安全修复 | ✅ 详细规划完成 |
| 2026-03-31 | v0.14.3 | 执行 P0 + Phase 1.1/1.2/1.8/1.9 | P0: gstack-slug 安全修复；Phase 1: 建立 resolvers/ 目录（types.ts + constants.ts），提取 10 个 resolver 到 6 个域模块，建立 index.ts 注册中心，gen-skill-docs.ts 从 1920→586 行 | ✅ 执行完成，全流程 review 通过（21 SKILL.md FRESH，全量测试通过，零 lint） |
| 2026-03-31 | v0.14.3 | 执行 Phase 1.3 | 新建 3 个 resolver 模块（confidence.ts / composition.ts / codex-helpers.ts），升级 gen-skill-docs.ts placeholder 正则支持参数化语法 `{{NAME:arg1:arg2}}`，注册中心 10→12 个 resolver，重新生成全部 63 个 SKILL.md | ✅ 执行完成（825 tests pass, 0 fail） |
| 2026-03-31 | v0.14.3 | 执行 Phase 1.4 | 重写 `generatePreamble()` 支持 preambleTier T1-T4，新增 `generateVoiceDirective()` + `generateSearchBeforeBuilding()`，新增 `SKILL_TIER_MAP`（17 个 skill→tier 映射），tier 赋值延迟激活 | ✅ 执行完成（880 tests pass, 0 fail） |
| 2026-03-31 | v0.14.3 | 执行 Phase 1.5 | review.ts 新增 6 个 resolver（SCOPE_DRIFT / ADVERSARIAL_STEP / CODEX_SECOND_OPINION / PLAN_COMPLETION_AUDIT_SHIP / PLAN_COMPLETION_AUDIT_REVIEW / PLAN_VERIFICATION_EXEC），注册中心 12→18 个 resolver，品牌名参数化 + 路径参数化 + CODEX_BOUNDARY 适配，dist/ 零变更（resolver 待 Phase 3 模板引用） | ✅ 执行完成（925 tests pass, 0 fail） |
| 2026-03-31 | v0.14.3 | 执行 Phase 1.6 | testing.ts 新增 4 个 resolver（TEST_FAILURE_TRIAGE / TEST_COVERAGE_AUDIT_PLAN / TEST_COVERAGE_AUDIT_SHIP / TEST_COVERAGE_AUDIT_REVIEW），路径参数化（plan artifact 用 `ctx.paths.binDir` + `ctx.paths.skillRoot`），品牌名参数化（HOST_SHORT_BRANDS），注册中心 18→22 个 resolver | ✅ 执行完成 |
| 2026-03-31 | v0.14.3 | 执行 Phase 1.7 | utility.ts 新增 5 个 resolver（SLUG_EVAL / SLUG_SETUP / DEPLOY_BOOTSTRAP / CO_AUTHOR_TRAILER / CHANGELOG_WORKFLOW），更新 BASE_BRANCH_DETECT（+GitLab + git-native fallback），注册中心 22→27 个 resolver，**Phase 1 全部完成**（1034 tests pass, 0 fail） | ✅ 执行完成 |
| 2026-03-31 | v0.14.3 | 执行 Phase 2 基础设施（2.1/2.2/2.4/2.5） | 新建 `scripts/resolvers/learnings.ts`（LEARNINGS_SEARCH + LEARNINGS_LOG），新建 3 个 bin 脚本（gstack-learnings-log / gstack-learnings-search / gstack-repo-mode），state dir 检测适配（project-local-state 模式），cross-project 搜索改为兄弟项目模式，注册中心 27→29 个 resolver，BIN_SCRIPTS 8→11 个。Phase 2.3（`/learn` 模板）和 2.6（模板引用）延后至 Phase 3/4 | ✅ 执行完成（1034 tests pass, 0 fail） |
| 2026-04-01 | v0.14.3 | 执行 Phase 3.1（review 模板升级） | review 模板升级 ~290→~360 行，新增 6 个 resolver 引用 + LEARNINGS + Step 5.8 Persist，frontmatter 添加 WebSearch | ✅ 执行完成（commit a745d87） |
| 2026-04-01 | v0.14.3 | 执行 Phase 3.2（ship 模板升级） | ship 模板升级 ~699→~850+ 行，review gate 从阻断改为信息性提示，新增 7 个 resolver + LEARNINGS + GitLab MR + Distribution Pipeline + ship metrics 持久化 | ✅ 执行完成（commit b06ccb0） |
| 2026-04-01 | v0.14.3 | 执行 Phase 3.3（office-hours 模板升级） | office-hours 模板从 ~529→~770+ 行（+46%），新增 3 个 resolver 实现（DESIGN_SKETCH / DESIGN_MOCKUP / SPEC_REVIEW_LOOP），注册中心 29→32 个 resolver，Anti-Sycophancy Rules + Pushback Patterns + Phase 2.75 Landscape Awareness + Founder Resources(34) + Rule 11 改写（去 Garry Tan 宣传），14 个新验证测试 | ✅ 执行完成（1089 tests pass, 0 fail） |
| 2026-04-01 | v0.14.3 | 执行 Phase 3.4-3.7（plan-eng-review / plan-ceo-review / investigate / qa 模板升级） | 新建 CODEX_PLAN_REVIEW resolver（review.ts），注册中心 32→33 个 resolver。plan-eng-review: +CODEX_PLAN_REVIEW + CONFIDENCE_CALIBRATION + LEARNINGS_SEARCH + WebSearch，review-log 路径参数化。plan-ceo-review: +INVOKE_SKILL:office-hours + LEARNINGS_SEARCH + WebSearch，review-log 路径参数化。investigate: +LEARNINGS_LOG。qa: +LEARNINGS_LOG。**Phase 3 全部完成。** | ✅ 执行完成（63 SKILL.md FRESH，全量测试通过，零 lint） |
| 2026-04-01 | v0.14.3 | 执行 Phase 4A（/learn skill 模板迁移） | 从上游 `learn/SKILL.md.tmpl` 完整迁移 `/learn` skill 模板（6 命令：show recent/search/prune/export/stats/manual add），规则 1 frontmatter 处理 + 规则 4 stats 命令重写（`$_STATE_DIR` 替代 `GSTACK_HOME/projects/$SLUG/`）+ 移除 per-block gstack-slug eval + 规则 11 品牌中性化。SKILL_TIER_MAP 注册 `'learn': 2`（T2）。3 平台 SKILL.md 生成（22+21+21），12 个新验证测试 | ✅ 执行完成（1148 tests pass, 0 fail） |
| 2026-04-01 | v0.14.3 | 执行 Phase 4B（/setup-deploy skill 模板迁移） | 从上游 `setup-deploy/SKILL.md.tmpl` 完整迁移 `/setup-deploy` skill 模板（6 步：check existing config / detect platform / platform-specific setup / write config / verify / summary）。规则 1a frontmatter 处理（去 preamble-tier + version），新增 "Proactively suggest" trigger。修正上游 shell 语法 bug（`||` `&&` 优先级问题添加括号）。SKILL_TIER_MAP 注册 `'setup-deploy': 2`（T2）。3 平台 SKILL.md 生成（23+22+22），14 个新专用测试 + 注册到 5 个跨 skill 测试列表 | ✅ 执行完成（1184 tests pass, 0 fail） |
| 2026-04-01 | v0.14.3 | 执行 Phase 4C（/cso skill 模板迁移） | 从上游 `cso/SKILL.md.tmpl` 完整迁移 `/cso` 安全审计 skill 模板。规则 1a frontmatter 处理，hooks 降级为安全提示（规则 2），ADVERSARIAL_STEP resolver 引用，ACKNOWLEDGEMENTS.md sidecar。SKILL_TIER_MAP 注册 `'cso': 2`（T2）。3 平台 SKILL.md 生成 | ✅ 执行完成（commits 6299a89, 4405cd2, 0719b70） |
| 2026-04-01 | v0.14.3 | 执行 Phase 4D（/autoplan skill 模板迁移） | 从上游 `autoplan/SKILL.md.tmpl` 完整迁移 `/autoplan` 自动评审编排 skill 模板。新增 BENEFITS_FROM resolver（review.ts），注册中心 33→34 个 resolver。规则 1a frontmatter 处理，benefitsFrom 提取逻辑。SKILL_TIER_MAP 注册 `'autoplan': 4`（T4）。3 平台 SKILL.md 生成，52 个新验证测试 + 9 个 BENEFITS_FROM 单元测试 | ✅ 执行完成（commits b1355c3, 510d838, 31c6670, 4e90496） |
| 2026-04-01 | v0.14.3 | 执行 Phase 4E（/benchmark skill 模板迁移） | 从上游 `benchmark/SKILL.md.tmpl` 完整迁移 `/benchmark` 性能回归检测 skill 模板（9 阶段：Setup → Page Discovery → Performance Data Collection → Baseline Capture → Comparison → Slowest Resources → Performance Budget → Trend Analysis → Save Report）。规则 1a 删除 preamble-tier + version，移除 gstack-slug eval（bin 脚本已内建 state dir 检测）。SKILL_TIER_MAP 注册 `'benchmark': 1`（T1）。3 平台 SKILL.md 生成，无新 resolver（复用 PREAMBLE + BROWSE_SETUP），注册到 3 个跨 skill 测试列表（preamble / contributor / triggers），24 个新验证测试 | ✅ 执行完成 |
| 2026-04-02 | v0.14.3 | 执行 Phase 4F（/canary skill 模板迁移） | 从上游 `canary/SKILL.md.tmpl` 完整迁移 `/canary` 金丝雀部署监控 skill 模板（7 阶段：Setup → Baseline Capture → Page Discovery → Pre-Deploy Snapshot → Continuous Monitoring Loop → Health Report → Baseline Update）。规则 1a 删除 preamble-tier + version，移除 gstack-slug eval，规则 4 重写 state dir 日志逻辑（`$_STATE_DIR` 替代 `~/.gstack/projects/$SLUG`）。SKILL_TIER_MAP 注册 `'canary': 2`（T2）。3 平台 SKILL.md 生成（536/536/530 行），无新 resolver（复用 PREAMBLE + BROWSE_SETUP + BASE_BRANCH_DETECT），注册到 4 个跨 skill 测试列表（preamble / contributor / completeness / triggers），24 个新验证测试。修复 benchmark T1 preamble 测试（AskUserQuestion RECOMMENDATION 中引用了 Completeness Principle 文字） | ✅ 执行完成 |
| 2026-04-02 | v0.14.3 | 执行 Phase 4G-1（/land-and-deploy skill 模板迁移） | 从上游 `land-and-deploy/SKILL.md.tmpl` 完整迁移 `/land-and-deploy` 合并+部署+验证全流程 skill 模板（918 行，10 步：Pre-flight → First-run Dry-run → Pre-merge Checks → Wait CI → Pre-merge Readiness Gate → Merge PR → Deploy Strategy → Wait Deploy → Canary Verification → Revert → Deploy Report → Follow-ups）。规则 1a 删除 preamble-tier + version（保留 sensitive: true），移除 `{{SLUG_EVAL}}` + `~/.gstack/projects/$SLUG` → 重写为 `$_STATE_DIR` 内联检测模式（3 处 bash block），`~/.claude/skills/gstack/bin/` → `$_GSTACK_ROOT/bin/`（gstack-review-read / gstack-diff-scope），`~/.claude/skills/gstack/review/` → `$_GSTACK_ROOT/review/`。SKILL_TIER_MAP 注册 `'land-and-deploy': 4`（T4）。3 平台 SKILL.md 生成（1360/1359/1353 行），无新 resolver（复用 PREAMBLE + BROWSE_SETUP + BASE_BRANCH_DETECT + DEPLOY_BOOTSTRAP），注册到 4 个跨 skill 测试列表（preamble / contributor / completeness / triggers），28 个新验证测试。Phase 4G 拆分为 4G-1（land-and-deploy ✅）和 4G-2（design-shotgun + design-html，依赖 DESIGN_SETUP resolver + design/ 工具包，📋） | ✅ 执行完成 |
| 2026-04-02 | v0.14.3 | 执行 Phase 4G-2（/design-shotgun + /design-html skill 模板迁移） | 从零构建 `/design-shotgun`（并行设计探索，5 阶段）和 `/design-html`（设计转代码，7 阶段）两个 skill 模板。新建 2 个 resolver：`generateDesignSetup()`（design binary 检测 + state dir 设置 + DESIGN.md 约束检查）、`generateDesignShotgunLoop()`（多变体生成 `$D variants` + 对比看板 `$D compare --serve` + 反馈循环 `$D iterate` + approval 持久化 `approved.json`），注册中心 34→36 个 resolver。SKILL_TIER_MAP 注册 `'design-shotgun': 2` + `'design-html': 2`（T2）。3 平台 SKILL.md 生成（design-shotgun: 401/401/395 行，design-html: 443/443/435 行），品牌隔离验证干净（零 `.claude/skills` + 零 "Claude Code" 残留），`$_GSTACK_ROOT` 探测链注入正常。注册到 4 个跨 skill 测试列表（preamble / contributor / completeness / triggers），61 个新验证测试（design-shotgun 21 + design-html 22 + resolver count 修正）。**Phase 4 全部完成。** | ✅ 执行完成（1487 tests pass, 0 fail） |
| 2026-04-02 | v0.14.3 | 执行 Phase 5（Browse 增强，全部步骤 5.1-5.7） | 4 个 bisected commits：(1) feat(browse): add cross-platform abstractions — `platform.ts`（IS_WINDOWS/TEMP_DIR/isPathWithin）+ `bun-polyfill.cjs`（Node.js 兼容层）；(2) feat(browse): add CDP inspector engine — `cdp-inspector.ts`（870 行，PageLike 类型/CDP session 管理/inspectElement/modifyStyle/undoModification/resetModifications/computeSpecificity/formatInspectorResult）；(3) feat(browse): add inspect, style, cleanup, prettyscreenshot, frame commands — 5 新命令注册 + PAGE_CONTENT_COMMANDS + wrapUntrustedContent + 命令实现 + 5 个 inspector HTTP 端点 + isPortAvailable + browser-manager frame context（activeFrame/setFrame/getFrame/getActiveFrameOrPage with detach auto-recovery）+ SKILL.md.tmpl CSS Inspector 文档；(4) test(browse): add 31 integration tests — 6 describe blocks（inspect 6/style 7/cleanup 5/prettyscreenshot 7/frame 5/cross-feature 1）+ inspector.html fixture。Phase 5.7 评估：frame context 传播仅限新命令（与上游一致），legacy 命令保持 page-level 操作。**Phase 5 全部完成。** | ✅ 执行完成 |
| 2026-04-02 | v0.14.3 | 评估并完成 Phase 6（运维与工具链） | 逐项评估全部 5 个子步骤：6.1 三个 bin 脚本（gstack-open-url/gstack-platform-detect/gstack-snapshot）无任何 skill 模板引用 → ⏭️ 延后 P4（TODOS.md 跟踪）；6.2 `lib/worktree.ts` 确认 land-and-deploy 模板零 worktree 引用 → ❌ 永久排除；6.3 `design/` 目录的 resolver 已内含 binary 检测 + DESIGN_NOT_AVAILABLE 优雅降级 → ⏭️ 跳过；6.4 已有 1487+ 测试含 audit-compliance 模式 → ✅ 无需操作；6.5 `docs/architecture.md` ✅ 已有 + `docs/browser.md` ✅ 已有 + `ETHOS.md` ✅ 新创建（Search Before Building 三层框架，供 /office-hours Phase 2.75 引用）。**Phase 6 全部完成。v0.14.3 upstream sync 全部完成。** | ✅ 评估+执行完成 |
| 2026-04-03 | v0.14.3 | 版本号 bump v0.14.0 + CHANGELOG | VERSION 0.9.0→0.14.0, package.json 0.3.3→0.14.0, CHANGELOG.md 新增 0.14.0 条目（9 new skills / cross-session memory / smarter reviews / browser CSS inspector / resolver architecture / 1487 tests）。**upstream sync v0.14.3 正式关闭。** | ✅ 执行完成 |
