# 跨 Bash Block 环境变量传递方案

> 创建日期：2026-03-26
> 状态：✅ 已完成
> 前置文档：[migration-plan.md](./migration-plan.md)、[self-contained-install.md](./self-contained-install.md)、[project-local-state.md](./project-local-state.md)
> 作者：CodeBuddy AI
> 最后更新：2026-03-27（v2 方案实施完成，824 测试通过）

---

## 一、问题陈述

### 1.1 根因

CodeBuddy 的 `execute_command` 工具在**独立的 shell 进程**中执行每个 ` ```bash``` ` code block。这意味着：

- 一个 block 中 `export` 的变量，下一个 block 里**完全不存在**
- Preamble 中设置的 `$_STATE_DIR`、`$B`（browse 路径）等变量，在后续 block 中全部丢失
- 这不是 gstack 的 bug，而是 CodeBuddy 的执行模型决定的

Claude Code 和 Codex 的 shell 环境**在同一会话内持久化**，所以同样的模板在那两个平台上工作正常。

### 1.2 影响范围（基于 2026-03-27 代码审计）

#### 高严重性

| 变量 | 设置位置 | 使用位置 | 影响 |
|------|---------|---------|------|
| `$_TEL_START` / `$_SESSION_ID` | Preamble bash block | generateCompletionStatus 的 telemetry bash block | **影响所有 16+ 使用 PREAMBLE 的技能。** 持续时间计算错误（`_TEL_DUR` 基于未定义的 `_TEL_START`），session ID 为空，telemetry 数据无效。 |

#### 中严重性

| 变量 | 设置位置 | 使用位置 | 影响 |
|------|---------|---------|------|
| `$_STATE_DIR` | Preamble bash block | generateLakeIntro 的 `touch` bash block（gen-skill-docs.ts ~249 行） | `touch "$_STATE_DIR/.completeness-intro-seen"` 中 `_STATE_DIR` 未定义，标记文件写入错误位置（根目录或不写入）。用户每次启动都会被再次提示 Boil the Lake 介绍。 |
| `$_STATE_DIR` | Preamble bash block | generateTelemetryPrompt 的 `touch` bash block（gen-skill-docs.ts ~272 行） | `touch "$_STATE_DIR/.telemetry-prompted"` 同上。用户每次启动都会被再次询问遥测设置。 |
| `$_STATE_DIR` | Preamble bash block | office-hours/SKILL.md.tmpl 第 43 行 | `ls -t "$_STATE_DIR/projects"/*-design-*.md` 在独立 bash block 中，未定义 `_STATE_DIR`，无法列出历史设计文档。 |
| `$_STATE_DIR` | Preamble bash block | office-hours/SKILL.md.tmpl 第 219 行 | `grep -li ... "$_STATE_DIR/projects"/*-design-*.md` 同上，跨团队设计文档发现功能失效。 |
| `$_SD` + `$BRANCH` | office-hours Phase 5 block 1（第 307-314 行） | office-hours Phase 5 block 2（第 317-318 行） | block 2 的 `PRIOR=$(ls -t "$_SD/projects"/*-$BRANCH-design-*.md)` 使用了 block 1 定义的 `$_SD`。`$BRANCH` 从未在任何 bash block 中定义（它在 prose 中被引用，依赖 AI agent 从 preamble 输出记住分支名）。结果：设计文档谱系功能失效。 |

#### 低严重性

| 变量 | 设置位置 | 使用位置 | 影响 |
|------|---------|---------|------|
| `$_STATE_DIR` | Preamble bash block | generateContributorMode 的 prose（gen-skill-docs.ts ~334 行） | Prose 中引用 `$_STATE_DIR/contributor-logs/`，AI agent 需要推断路径。通常 AI 能正确处理（因为它是 prose 不是 bash），但不保证。 |
| `$PREVIEW_FILE` | design-consultation Phase 5 block 1（第 237-239 行） | block 2（第 243-244 行） | 跨 bash block 引用。AI agent 通常能记住上一个 block 的变量值，但不保证时间戳一致。 |
| `$REPORT_DIR` / `$B` | QA/design-review 定义 block | 后续多个使用 block | AI agent 几乎总能正确携带这些值（因为紧邻的 prose 上下文），但技术上是跨 block 依赖。 |

### 1.3 已经正确处理的模板（不需要修复）

以下模板的 bash block **已经在每个 block 中重新定义了** `_SD`/`_STATE_DIR`：

- `plan-ceo-review/SKILL.md.tmpl`（第 105-111、214-217 行）— 每个 bash block 独立检测 `_SD`
- `plan-eng-review/SKILL.md.tmpl`（第 68-74、153-158 行）— 同上
- `ship/SKILL.md.tmpl`（第 64-68、81-87 行）— 同上
- `design-review/SKILL.md.tmpl`（第 222-227 行）— 同上
- `qa/SKILL.md.tmpl`（第 92-95、282-285 行）— 同上
- `qa-only/SKILL.md.tmpl`（第 56-59、78-81 行）— 同上
- `retro/SKILL.md.tmpl`（第 77-80 行）— Step 1 bash block 内有完整检测
- `design-consultation/SKILL.md.tmpl`（第 55-58 行）— 同上
- `careful/freeze/guard/unfreeze/investigate`（所有 bash block 独立检测 `_SD`）
- `generateCompletionStatus`（telemetry bash block 已有 `_STATE_DIR` 检测）
- `generateDesignMethodology`（Phase 6 bash block 已有 `_STATE_DIR` 检测）

### 1.4 仅 CodeBuddy 受影响

Claude Code 和 Codex 的 shell 环境在会话内持久，不受此问题影响。因此，修复方案必须**在不破坏其他两个 Host 输出的前提下**解决 CodeBuddy 的问题。

### 1.5 与原方案（v1）的关键差异

原方案设计时，**状态目录是硬编码的 `~/.gstack/`**——不需要变量。project-local-state 迁移后，`$_STATE_DIR`/`$_SD` 本身也成了跨块变量问题的一部分。这意味着：

1. 原方案的 `{{BROWSE_ENV}}` 和 `{{SLUG_ENV}}` placeholder 中，`{{SLUG_ENV}}` 已不再需要（大部分 SLUG 引用已在 project-local-state 迁移中移除）
2. **需要新增 `{{STATE_DIR_ENV}}` placeholder** — 解决 `$_STATE_DIR` 问题（v1 方案设计时不存在这个需求）
3. 原方案的 telemetry 文件传递方案仍然正确 — 但路径需要用 `$_STATE_DIR` 而非 `~/.gstack/`
4. "正确做了检测"的手写 bash block（ship, plan-eng-review 等）**不需要改** — 它们已经在每个 block 中重新定义了 `_SD`

---

## 二、方案选型

讨论过三种方案：

### A1：手动重复

在每个需要变量的 block 中**手动复制粘贴**环境设置代码。

- ✅ 最简单直接
- ❌ 模板膨胀严重（10+ block 的 browse 模板每个都要加 10 行）
- ❌ 维护噩梦（路径逻辑变了要改 N 处）

### A2：自动注入所有 block

在 `gen-skill-docs.ts` 中，为 CodeBuddy 的**每一个 bash block** 自动注入环境设置。

- ✅ 模板完全不用改
- ❌ 许多 block 根本不需要这些变量（如纯 `git` 操作），白白增加 prompt token
- ❌ 不够精细，生成结果臃肿

### A3：`{{ENV}}` Placeholder（✅ 选定方案）

新增 `{{BROWSE_ENV}}`、`{{STATE_DIR_ENV}}` placeholder，模板作者在**需要的 block 中手动标记**，编译器根据 Host 展开为对应的环境探测代码。

- ✅ 精确控制：只在需要的 block 注入
- ✅ 模板可读性好：一行 `{{STATE_DIR_ENV}}` 清晰表达意图
- ✅ Host-aware：Claude/Codex 展开为空（变量已存在），CodeBuddy 展开为完整探测链
- ✅ 复用现有编译基础设施（RESOLVERS map + 已有的 auto-inject `$_GSTACK_ROOT` 先例）
- ✅ 已验证的模式：gen-skill-docs.ts 第 1679-1691 行已实现了 `$_GSTACK_ROOT` 的自动注入

---

## 三、详细设计

### 3.1 新增 Placeholder

#### `{{STATE_DIR_ENV}}`

在每个需要 `$_STATE_DIR` 的独立 bash block 中使用。根据 Host 展开为：

**所有 Host（统一）：**

```bash
_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
_STATE_DIR="${GSTACK_STATE_DIR:-$HOME/.gstack}"
for _d in dist/*/gstack .claude/skills/gstack .codebuddy/skills/gstack .agents/skills/gstack; do [ -n "$_ROOT" ] && [ -d "$_ROOT/$_d/bin" ] && _STATE_DIR="$_ROOT/.gstack" && break; done
```

> 设计决策：所有 Host 使用相同的展开代码。Claude/Codex 虽然不需要（shell 持久化），但这 3 行代码不会影响它们的行为，且保持了模板简单性。如果未来发现 token 开销是问题，可以改为 CodeBuddy-only 展开。

#### `{{BROWSE_ENV}}`

在每个需要 `$B` 的独立 bash block 中使用。这复用 `{{BROWSE_SETUP}}` 的 `$_GSTACK_ROOT` 探测链和 `$B` 推导逻辑：

**所有 Host（统一）：**

```bash
# Re-derive browse binary path for this bash block
_GSTACK_ROOT=""
_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -n "$_ROOT" ] && [ -d "$_ROOT/{localSkillRoot}/bin" ] && _GSTACK_ROOT="$_ROOT/{localSkillRoot}"
[ -z "$_GSTACK_ROOT" ] && [ -n "$_ROOT" ] && [ -d "$_ROOT/{hostSkillsDir}/skills/gstack/bin" ] && _GSTACK_ROOT="$_ROOT/{hostSkillsDir}/skills/gstack"
[ -z "$_GSTACK_ROOT" ] && [ -d "$HOME/{globalDir}/skills/gstack/bin" ] && _GSTACK_ROOT="$HOME/{globalDir}/skills/gstack"
_BROWSE_ROOT=""; [ -n "$_GSTACK_ROOT" ] && _BROWSE_ROOT="$(dirname "$_GSTACK_ROOT")/browse"
B=""; [ -n "$_BROWSE_ROOT" ] && [ -x "$_BROWSE_ROOT/dist/browse" ] && B="$_BROWSE_ROOT/dist/browse"
```

> 注：`{localSkillRoot}`、`{hostSkillsDir}`、`{globalDir}` 由 `gen-skill-docs.ts` 根据 Host 替换。

### 3.2 `gen-skill-docs.ts` 修改

在 `RESOLVERS` map 中注册新 resolver：

```typescript
const RESOLVERS: Record<string, (ctx: TemplateContext) => string> = {
  // ... 现有 resolvers ...
  STATE_DIR_ENV: generateStateDirEnv,
  BROWSE_ENV: generateBrowseEnv,
  // ...
};
```

新增 generator 函数：

- `generateStateDirEnv(ctx)` — 生成 3 行 `$_STATE_DIR` 检测代码
- `generateBrowseEnv(ctx)` — 生成 `$B` 探测代码（复用 `generateGstackRootDetect` + browse 推导）

### 3.3 Telemetry 跨 Block 修复

Preamble 中设置的 `_TEL_START` 和 `_SESSION_ID` 需要在 Completion 统计 block 中使用。改用**文件传递**：

1. **Preamble block**：在现有代码末尾追加，写入 `$_STATE_DIR/analytics/.session-tel-start` 和 `.session-id`
2. **Completion block**：从文件读取，使用后 `rm -f` 清理

```bash
# Preamble 末尾追加：
echo "$_TEL_START" > "$_STATE_DIR/analytics/.session-tel-start-$$"
echo "$_SESSION_ID" > "$_STATE_DIR/analytics/.session-id-$$"

# Completion block 开头追加（在 _STATE_DIR 检测之后）：
_TEL_START=$(cat "$_STATE_DIR/analytics/.session-tel-start-$$" 2>/dev/null || echo "0")
_SESSION_ID=$(cat "$_STATE_DIR/analytics/.session-id-$$" 2>/dev/null || echo "unknown")
# ... 原有的 telemetry 代码 ...
rm -f "$_STATE_DIR/analytics/.session-tel-start-$$" "$_STATE_DIR/analytics/.session-id-$$"
```

> 注意：使用 `$$`（PID）作为文件名后缀避免并发 session 冲突。Preamble 和 Completion 在同一个 skill session 中运行，`$$` 在 CodeBuddy 的不同 `execute_command` 调用中可能不同（每次新 shell）。因此改用 `_SESSION_ID`（已在 Preamble 中生成）作为文件名后缀更可靠。

**修正方案**：

```bash
# Preamble 末尾追加（_SESSION_ID 已经定义）：
echo "$_TEL_START" > "$_STATE_DIR/analytics/.session-tel-start"
echo "$_SESSION_ID" > "$_STATE_DIR/analytics/.session-id"

# Completion block：
_TEL_START=$(cat "$_STATE_DIR/analytics/.session-tel-start" 2>/dev/null || echo "0")
_SESSION_ID=$(cat "$_STATE_DIR/analytics/.session-id" 2>/dev/null || echo "unknown")
# ... 使用完毕后 ...
rm -f "$_STATE_DIR/analytics/.session-tel-start" "$_STATE_DIR/analytics/.session-id"
```

> 竞态风险：如果用户同时开两个 CodeBuddy 会话运行 gstack 技能，后一个会覆盖前一个的值。这在实践中很少发生（两个会话同时运行同一 skill），且后果仅是遥测数据不准确（不是功能性错误）。暂时接受此限制。

### 3.4 generateLakeIntro / generateTelemetryPrompt 修复

这两个函数生成的 bash block 需要 `$_STATE_DIR`。有两种选择：

**选择 A：在函数内部直接使用 `generateStateDirEnv` 输出**

```typescript
function generateLakeIntro(ctx: TemplateContext): string {
  const stateDirDetect = generateStateDirEnv(ctx);
  return `...
\`\`\`bash
${stateDirDetect}open https://...
touch "$_STATE_DIR/.completeness-intro-seen"
\`\`\`
...`;
}
```

**选择 B：在模板处使用 `{{STATE_DIR_ENV}}`**

不可行——因为 `generateLakeIntro` 是 `{{PREAMBLE}}` 的组成部分，不是模板直接引用的。

**结论：使用选择 A。** 在 `generateLakeIntro` 和 `generateTelemetryPrompt` 内部调用 `generateStateDirEnv` 生成检测代码。

### 3.5 office-hours 模板修复

office-hours 有 3 处需要修复的 bash block：

| 行号 | 当前代码 | 修复 |
|------|---------|------|
| 43 | `ls -t "$_STATE_DIR/projects"/*-design-*.md` | 在 block 开头添加 `{{STATE_DIR_ENV}}` 展开 |
| 219 | `grep -li ... "$_STATE_DIR/projects"/*-design-*.md` | 同上 |
| 317-318 | `PRIOR=$(ls -t "$_SD/projects"/*-$BRANCH-design-*.md)` | 统一为 `$_STATE_DIR` + 在 block 中添加 `BRANCH=$(git rev-parse --abbrev-ref HEAD \| tr '/' '-')` |

> 注：第 307-314 行的 Phase 5 block 1 已经有完整的 `_SD` 检测（✅ 正确），但 block 2（第 317-318 行）没有。需要将 block 2 合并到 block 1，或在 block 2 中添加检测。

### 3.6 模板修改清单

| 模板 | 修复方式 | 改动量 |
|------|---------|-------|
| `gen-skill-docs.ts` — `generateStateDirEnv` | 新增函数 | +8 行 |
| `gen-skill-docs.ts` — `generateBrowseEnv` | 新增函数 | +12 行 |
| `gen-skill-docs.ts` — `generateLakeIntro` | 在 bash block 中内联 `_STATE_DIR` 检测 | +3 行 |
| `gen-skill-docs.ts` — `generateTelemetryPrompt` | 同上 | +3 行 |
| `gen-skill-docs.ts` — `generatePreambleBash` | 追加 telemetry 文件写入 | +2 行 |
| `gen-skill-docs.ts` — `generateCompletionStatus` | 追加 telemetry 文件读取 + 清理 | +3 行 |
| `office-hours/SKILL.md.tmpl` | 3 处 bash block 添加 `_STATE_DIR` 检测 + `BRANCH` 定义 | +10 行 |
| `design-consultation/SKILL.md.tmpl` | 合并 `$PREVIEW_FILE` 的两个 bash block 为一个 | -2 行（净减） |

### 3.7 不需要修改的模板

以下模板的 bash block 已经正确处理了跨 block 依赖（每个 block 独立检测 `_SD`），**不需要修改**：

- `plan-ceo-review`, `plan-eng-review`, `ship`, `design-review`, `qa`, `qa-only`, `retro`
- `careful`, `freeze`, `guard`, `unfreeze`, `investigate`

### 3.8 `$B` 和 `$REPORT_DIR` 的跨 block 问题

`$B`（browse 二进制路径）在 `{{BROWSE_SETUP}}` 中定义，后续所有 browse 命令 block 中使用。`$REPORT_DIR` 在一个 block 中定义，后续多个 block 使用。

**当前状态**：AI agent 在实际使用中通常能正确处理这些跨 block 引用（因为 prose 上下文足够强），且这些变量的值是简单的（路径字符串），AI agent 容易记住。

**本次方案不修复这些问题**——它们的严重性较低，且修复需要在所有 browse 命令 block（几十处）中添加 `{{BROWSE_ENV}}`，改动量大且收益不确定。如果将来 AI agent 行为变化导致这些问题变得突出，可以通过以下方式补充修复：

1. 在 `gen-skill-docs.ts` 中使用类似 `$_GSTACK_ROOT` 的自动注入机制（第 1679-1691 行），检测引用了 `$B` 但没有定义的 bash block，自动注入 `{{BROWSE_ENV}}` 展开
2. 在模板中手动添加 `{{BROWSE_ENV}}`（A1 方式）

---

## 四、实施状态

### 已完成 ✅

所有 Phase 已实施并通过测试（824 tests pass, 0 fail）。

#### Phase 1：gen-skill-docs.ts 核心函数
1. ✅ 新增 `generateStateDirEnv(ctx)` 函数 — 3 行紧凑的 `$_STATE_DIR` 检测代码
2. ✅ 修改 `generateLakeIntro(ctx)` — bash block 内联 `_STATE_DIR` 检测
3. ✅ 修改 `generateTelemetryPrompt(ctx)` — bash block 内联 `_STATE_DIR` 检测
4. ✅ 修改 `generatePreambleBash` — 末尾追加 telemetry 文件写入（`.session-tel-start` + `.session-id`）
5. ✅ 修改 `generateCompletionStatus` — 从文件读取 `_TEL_START` / `_SESSION_ID`，使用后清理

#### Phase 2：模板修复
1. ✅ `office-hours/SKILL.md.tmpl` — 3 处 bash block 修复：
   - 第 42 行：设计文档列表 block 添加 `_STATE_DIR` 检测
   - 第 221 行：design discovery grep block 添加 `_STATE_DIR` 检测
   - 第 322-325 行：design lineage block 合并到 Phase 5 block 1（消除跨 block `$_SD` + `$BRANCH` 依赖）
2. ✅ `design-consultation/SKILL.md.tmpl` — `$PREVIEW_FILE` block 改为 `ls -t` 重新发现模式

#### Phase 3：构建 + 测试
1. ✅ `bun run build` 重新生成所有 SKILL.md
2. ✅ `bun test` 824 测试全部通过

---

## 五、风险与注意事项

1. **Telemetry 竞态**：当前设计使用固定文件名（`.session-tel-start`、`.session-id`）。如果用户同时开两个 CodeBuddy 会话运行 gstack 技能，后一个会覆盖前一个的值。后果仅是遥测数据不准确（不影响功能）。暂时接受。

2. **`{{STATE_DIR_ENV}}` 在所有 Host 展开**：当前设计在 Claude/Codex 上也展开检测代码（3 行），增加少量 prompt token（~40 token）。这比维护条件逻辑更简单。如果未来 token 成本敏感，可以改为 CodeBuddy-only 展开。

3. **`$B` 和 `$REPORT_DIR` 推迟修复**：这些问题目前由 AI agent 的行为"隐式修复"——AI 通常能从 prose 上下文推断出正确的路径。但如果未来 AI agent 行为变化，可能需要补充修复。

4. **`$BRANCH` 变量**：office-hours 模板中 `$BRANCH` 在 bash 中从未定义，依赖 AI agent 从 preamble 输出记住分支名。修复方案：在需要 `$BRANCH` 的 bash block 中添加 `BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null | tr '/' '-' || echo 'no-branch')`。

5. **生成文件体量**：模板修改加上 `bun run gen:skill-docs` 重新生成的 `dist/` 下 SKILL.md 文件（不在 git 中跟踪）。实际 git 提交只涉及 ~5 个源文件。

---

## 六、与原方案（v1）的对比

| 维度 | v1 方案 | v2 方案（本文档） |
|------|--------|----------------|
| 状态目录 | 硬编码 `~/.gstack/`，无需变量 | `$_STATE_DIR` 需要在每个独立 bash block 中检测 |
| `{{SLUG_ENV}}` | 需要（多处引用 `$SLUG`） | **不再需要**（project-local-state 迁移已移除大部分 SLUG 引用） |
| `{{STATE_DIR_ENV}}` | 不存在 | **新增**（核心变化） |
| `{{BROWSE_ENV}}` | 需要 | 保留但推迟实施（AI agent 目前能正确处理 `$B`） |
| Telemetry 文件传递 | `~/.gstack/analytics/.session-*` | `$_STATE_DIR/analytics/.session-*`（路径改为状态目录感知） |
| 实施状态 | 代码已在 stash 中（已废弃） | 从零实施 |
| 模板改动量 | 11 个模板文件 | **5 个文件**（因为 v2 聚焦于最高优先级问题） |

---

## 七、验证检查清单

实施完成后，验证以下场景：

- [ ] 在项目安装模式下运行 `/office-hours`，设计文档写入 `<project>/.gstack/projects/`
- [ ] 在全局安装模式下运行 `/office-hours`，设计文档写入 `~/.gstack/projects/`
- [ ] 首次运行 Boil the Lake 介绍后，`touch` 命令写入正确位置，二次运行跳过
- [ ] Telemetry 数据在 completion block 中正确记录（持续时间 > 0，session ID 非空）
- [ ] `bun test` 819+ 测试全部通过
- [ ] 生成的 SKILL.md 在 Claude/Codex 上无行为变化（变量检测代码不影响已有环境）
