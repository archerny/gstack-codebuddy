# Browse Separation: 从 gstack 拆分为独立 Skill

> 状态: ✅ 完成（Phase 0-5 全部完成，Phase 6 确认无需改动）
> 创建日期: 2026-03-24
> 关联文档: [self-contained-install.md](./self-contained-install.md), [migration-plan.md](./migration-plan.md)

## 目标

将 browse 从 gstack 根 skill 中彻底拆分出去，成为一个**完全独立安装的 skill**。
拆分后：

1. `browse/` 作为独立 skill 安装到 `~/.{host}/skills/browse/`（与其他 skill 同级）
2. 其他 skill（qa、design-review 等）仍然可以通过 `{{BROWSE_SETUP}}` 依赖 browse 作为基础设施
3. 根 skill `gstack` 不再包含任何 browse 文档内容，只保留 skill 路由器功能
4. `remote-slug` 迁移到 `bin/`（它是 git 工具，与浏览器无关）

## 现状分析

### browse 的三重身份

| 身份 | 位置 | 说明 |
|------|------|------|
| 共享运行时 | `browse/dist/browse` 二进制 | 9 个 skill 通过 `{{BROWSE_SETUP}}` + `$B` 依赖它 |
| 独立 skill | `browse/SKILL.md.tmpl` | frontmatter `name: browse`，有自己的 QA patterns + User Handoff |
| 根 skill 内嵌 | `SKILL.md.tmpl` 第 55-281 行 | 完整复制了 browse 文档，占根模板 **~60%** 内容 |

### 耦合点清单

#### 模板文件引用

| 占位符/引用 | 使用位置 | 数量 |
|------------|---------|------|
| `{{BROWSE_SETUP}}` | 根、browse、qa、qa-only、design-review、setup-browser-cookies、design-consultation | 7 |
| `$B` 命令使用 | 根、browse、qa、design-review、setup-browser-cookies、design-consultation | 6 |
| `{{COMMAND_REFERENCE}}` | 根、browse | 2 |
| `{{SNAPSHOT_FLAGS}}` | 根、browse | 2 |
| `browse/bin/remote-slug` 硬编码 | plan-eng-review、plan-ceo-review、review/greptile-triage.md | 3 |

#### gen-skill-docs.ts 耦合

| 耦合点 | 行号 | 说明 |
|--------|------|------|
| `import { COMMAND_DESCRIPTIONS }` | L12 | 编译时导入 browse 命令 |
| `import { SNAPSHOT_FLAGS }` | L13 | 编译时导入 snapshot flags |
| `HostPaths.browseDir` | L38 | 接口定义 browse 路径字段 |
| `HOST_PATHS[*].browseDir` | L46,52,58 | 每个 host 定义 browseDir |
| `generateBrowseSetup()` | L418-458 | 生成 browse 二进制发现脚本 |
| `copyRuntimeAssets()` 步骤 4-5 | L1772-1801 | 复制 browse/bin/ 和 browse/dist/ |

#### setup 脚本耦合

| 位置 | 行号 | 说明 |
|------|------|------|
| `BROWSE_BIN` 变量 | L13 | 定义 browse 二进制路径 |
| 智能重编译检测 | L155-178 | 检测 browse 源码变更触发重编译 |
| `link_codex_skill_dirs` skip | L243 | `[ "$skill_name" = "browse" ] && continue` |
| `link_codebuddy_skill_dirs` skip | L295 | 同上 |
| `install_codebuddy_copy` browse 处理 | L333-341 | browse 作为运行时资产独立安装 |
| `install_codebuddy_copy` skill skip | L358 | 跳过 browse 的 skill 安装 |
| `create_agents_sidecar` | L267 | browse 作为运行时资产链接 |
| 成功信息输出 | L376,398,444 | 输出 browse 二进制路径 |

#### package.json 引用

| 字段 | 值 | 说明 |
|------|-----|------|
| `bin.browse` | `./browse/dist/browse` | npm bin 入口 |
| `build` 脚本 | `bun build --compile browse/src/cli.ts ...` | 编译命令 |
| `dev` 脚本 | `bun run browse/src/cli.ts` | 开发运行 |
| `server` 脚本 | `bun run browse/src/server.ts` | 服务器 |
| `test` 脚本 | `bun test browse/test/ ...` | 测试路径 |
| `description` | 含 "headless browser" | 描述信息 |

#### 测试文件引用

| 文件 | 说明 |
|------|------|
| `test/helpers/touchfiles.ts` | browse 相关文件触发映射 |
| `test/skill-validation.test.ts` | 导入 browse/src/commands 和 snapshot |
| `test/gen-skill-docs.test.ts` | 测试 browse SKILL.md 生成、setup 中 browse 链接 |
| `test/helpers/session-runner.ts` | `BROWSE_ERROR_PATTERNS` 和 `browseErrors` |
| `test/helpers/eval-store.ts` | `browse_errors` 字段 |

---

## 重构方案

### 设计原则

1. **不做历史兼容**：项目尚未有真正用户，直接按目标结构实施，不保留 legacy path fallback
2. **逐步迁移**：每个 Phase 独立可提交、可回滚，不需要一次性完成全部改动
3. **测试先行**：每个 Phase 完成后运行 `bun test` 确保不破坏现有功能
4. **文档同步**：每个 Phase 的变更同步更新本文档状态

### Phase 0: 迁移 remote-slug 到 bin/（前置清理）✅

> 预计: human ~1h / CodeBuddy ~10min

**目标**：`remote-slug` 是一个纯 git 工具（提取 owner-repo slug），与浏览器无关。将其从 `browse/bin/` 迁移到 `bin/`，消除一个不必要的 browse 耦合。

**改动清单**：

| 文件 | 操作 | 说明 |
|------|------|------|
| `browse/bin/remote-slug` | 删除 | 原位置不再需要 |
| `bin/remote-slug` | 新建 | 从 browse/bin/ 移动过来，内容不变 |
| `plan-eng-review/SKILL.md.tmpl` | 修改 | `~/.claude/skills/gstack/browse/bin/remote-slug` → `~/.claude/skills/gstack/bin/remote-slug` |
| `plan-ceo-review/SKILL.md.tmpl` | 修改 | 同上 |
| `review/greptile-triage.md` | 修改 | `browse/bin/remote-slug` → `bin/remote-slug` |
| `scripts/gen-skill-docs.ts` | 修改 | `copyRuntimeAssets` 步骤 4：从 `BROWSE_BIN_SCRIPTS` 中移除 `remote-slug`，在步骤 1 的 `BIN_SCRIPTS` 中添加 `remote-slug` |
| `scripts/verify-self-contained.sh` | 修改 | 检查路径从 `browse/bin/remote-slug` 改为 `bin/remote-slug` |

**验证**：
```bash
bun test
bun run build  # 确认 dist/ 输出中 remote-slug 在 bin/ 下
```

**提交**：`refactor(scripts): move remote-slug from browse/bin to bin`

---

### Phase 1: 瘦身根 SKILL.md.tmpl（移除内嵌 browse 文档）✅

> 预计: human ~2h / CodeBuddy ~15min

**目标**：根 `SKILL.md.tmpl` 移除所有内嵌的 browse 文档（~220 行），只保留 skill 路由器功能。根 skill 变成一个纯粹的"入口点 + 路由器"。

**当前根模板结构**（281 行）：
```
L1-47:   frontmatter（description 含 browse 描述 + skill 路由表）
L49-53:  preamble + proactive 开关
L55-60:  "gstack browse: QA Testing" 标题 + 介绍 + BROWSE_SETUP
L62-228: browse 完整文档（QA Workflows、Assertions、Dialogs 等）
L230-265: Snapshot System + SNAPSHOT_FLAGS
L267-269: Command Reference + COMMAND_REFERENCE
L271-281: Tips
```

**目标结构**（~55 行）：
```
L1-31:   frontmatter（description 移除 browse 描述，只保留 skill 路由表）
L33-37:  preamble + proactive 开关
L39-55:  简短的功能概述 + 使用指南（引导用户到各个独立 skill）
```

**改动清单**：

| 文件 | 操作 | 说明 |
|------|------|------|
| `SKILL.md.tmpl` | **大幅修改** | 见下方详细说明 |

**根模板具体改动**：

1. **frontmatter description**（L4-9）：移除 browse 相关描述，改写为纯 skill 路由器：
   ```yaml
   description: |
     gstack development workflow skills. When you notice the user is at
     these stages, suggest the appropriate skill:
     - Testing the app or browsing a URL → suggest /browse
     - Brainstorming a new idea → suggest /office-hours
     ...（其余路由条目不变）
   ```
   注意：在路由列表中把 browse 作为独立 skill 条目加入（当前它不在路由列表里因为是内嵌的）

2. **移除 L55-281**：整个 "gstack browse: QA Testing & Dogfooding" 章节，包括：
   - `{{BROWSE_SETUP}}` 调用
   - 所有 QA Workflows 示例
   - Quick Assertion Patterns
   - `{{SNAPSHOT_FLAGS}}`
   - `{{COMMAND_REFERENCE}}`
   - Tips 章节

3. **保留的内容**：
   - `{{PREAMBLE}}`
   - proactive 开关说明
   - 可选：添加一段简短的"已安装的 skill 概览"段落

**验证**：
```bash
bun test
bun run build
# 检查 dist/{host}/gstack/SKILL.md 不再包含 browse 内容
grep -c "BROWSE_SETUP\|SNAPSHOT_FLAGS\|COMMAND_REFERENCE" dist/claude/gstack/SKILL.md
# 应该输出 0
```

**提交**：`refactor(gstack): remove embedded browse documentation from root skill`

---

### Phase 2: 调整 browse 安装流程（从"运行时资产"变为"独立 skill"）✅

> 预计: human ~3h / CodeBuddy ~20min

**目标**：browse 不再作为 gstack 的内嵌运行时资产安装，而是作为独立 skill 安装到与其他 skill 同级的位置。

**当前安装方式**：
- browse 二进制和脚本嵌入在 `gstack/browse/` 下
- 各 skill 通过 `$_GSTACK_ROOT/browse/dist/browse` 路径访问
- setup 脚本中 browse 被**跳过** skill 安装（因为不作为独立 skill）
- `copyRuntimeAssets` 步骤 4-5 将 browse 文件复制到 `dist/{host}/browse/`

**目标安装方式**：
- browse skill 安装到 `~/.{host}/skills/browse/`（包含 SKILL.md + dist/ + bin/）
- 其他 skill 通过调整后的 `{{BROWSE_SETUP}}` 在新路径找到 browse 二进制
- setup 脚本中 browse 正常参与 skill 安装流程

#### 子步骤 2a：调整 dist 输出结构

**改动**：`scripts/gen-skill-docs.ts`

当前 `copyRuntimeAssets` 将 browse 二进制复制到 `dist/{host}/browse/`。拆分后：
- browse 的 SKILL.md 已经生成到 `dist/{host}/browse/SKILL.md`（现有逻辑不变）
- browse 运行时资产（二进制 + 脚本）也复制到同一目录，形成自包含的 skill 包：

```
dist/{host}/
├── browse/               ← 独立 skill 包
│   ├── SKILL.md          ← gen-skill-docs 已生成
│   ├── dist/
│   │   ├── browse        ← 二进制（~70MB）
│   │   ├── find-browse   ← 二进制
│   │   └── .version
│   └── bin/
│       └── find-browse   ← shim 脚本
├── gstack/               ← 根 skill（纯路由器，不再含 browse）
│   ├── SKILL.md
│   └── （无 browse/ 子目录）
├── bin/                  ← 共享 bin 脚本
│   ├── remote-slug       ← Phase 0 迁移过来
│   └── ...
├── qa/
├── review/
└── ...
```

**关键变更**：
- `copyRuntimeAssets` 中的步骤 4（browse/bin/ scripts）和步骤 5（browse/dist/ binaries）保持不变——它们已经输出到 `dist/{host}/browse/`
- 但 `gstack/browse/` 下不再复制 browse 资产（因为根 skill 不再需要）
- 需要确保 `install_codebuddy_copy` 正确处理 browse skill 的安装

#### 子步骤 2b：调整 setup 脚本

**改动**：`setup`

1. **移除 browse 跳过逻辑**：
   - `link_codex_skill_dirs`（L243）：移除 `[ "$skill_name" = "browse" ] && continue`
   - `link_codebuddy_skill_dirs`（L295）：移除 `[ "$skill_name" = "browse" ] && continue`
   - `install_codebuddy_copy`（L358）：移除 browse 跳过

2. **移除 browse 作为运行时资产的特殊处理**：
   - `install_codebuddy_copy`（L333-341）：移除 browse 作为运行时资产的复制逻辑（`if [ -d "$dist_src/browse" ]; then ... fi`）
   - browse 现在通过正常的 skill 安装流程安装到 `$skills_dir/browse/`

3. **调整 `create_agents_sidecar`**（L267）：
   - `for asset in bin browse review qa` → 移除 `browse`（browse 现在是独立 skill，不需要在 agents sidecar 中链接）
   - 或者改为链接到新位置

4. **调整成功信息输出**：
   - 不再单独输出 `browse: $BROWSE_BIN`（browse 作为普通 skill 安装即可）

#### 子步骤 2c：调整 BROWSE_SETUP 探测路径

**改动**：`scripts/gen-skill-docs.ts` 中的 `generateBrowseSetup()`

当前探测链在 `gstack/browse/dist/browse` 路径下找二进制。拆分后需要在新路径找：

**Claude host**（当前）：
```bash
_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
B=""
[ -n "$_ROOT" ] && [ -x "$_ROOT/dist/claude/gstack/browse/dist/browse" ] && B="$_ROOT/dist/claude/gstack/browse/dist/browse"
[ -z "$B" ] && B=~/.claude/skills/gstack/browse/dist/browse
```

**Claude host**（拆分后）：
```bash
_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
B=""
# Priority 1: project-local browse skill
[ -n "$_ROOT" ] && [ -x "$_ROOT/dist/claude/browse/dist/browse" ] && B="$_ROOT/dist/claude/browse/dist/browse"
# Priority 2: user-global browse skill
[ -z "$B" ] && [ -x ~/.claude/skills/browse/dist/browse ] && B=~/.claude/skills/browse/dist/browse
```

**CodeBuddy host** 同理，直接指向独立 skill 路径 `browse/dist/browse`，不保留旧的 `gstack/browse/dist/browse` fallback。

**改动也影响 `HostPaths` 接口**：
- `browseDir` 字段含义从 "gstack 下的 browse" 变为 "browse skill 的 dist 目录"
- 或者新增 `browseSkillRoot` 字段

**改动清单**：

| 文件 | 操作 | 说明 |
|------|------|------|
| `scripts/gen-skill-docs.ts` | 修改 | `HostPaths.browseDir` 路径更新；`generateBrowseSetup()` 探测链更新；`copyRuntimeAssets` 不再复制到 gstack/ 下 |
| `setup` | 修改 | 移除 browse 跳过逻辑；移除 browse 运行时资产特殊处理 |
| `scripts/verify-self-contained.sh` | 修改 | 调整 browse 检查路径 |

**验证**：
```bash
bun test
bun run build
# 确认 browse skill 在 dist/ 中有完整的 SKILL.md + dist/ + bin/
ls dist/codebuddy/browse/
# 应输出: SKILL.md dist/ bin/
ls dist/codebuddy/browse/dist/
# 应输出: browse find-browse .version

# 确认 gstack 根 skill 下不再有 browse
ls dist/codebuddy/gstack/
# 应输出: SKILL.md（无 browse/ 子目录）

# 测试安装
./setup --host codebuddy --project /tmp/test-install
ls /tmp/test-install/.codebuddy/skills/browse/
# 应输出: SKILL.md dist/ bin/
```

**提交**：`refactor(setup): install browse as standalone skill instead of embedded runtime`

---

### Phase 3: 清理 gen-skill-docs.ts 中的 browse 耦合 ✅

> 预计: human ~1h / CodeBuddy ~10min

**目标**：确认和清理 gen-skill-docs.ts 中与 browse 拆分相关的残留耦合。

**改动清单**：

| 改动点 | 说明 |
|--------|------|
| `import { COMMAND_DESCRIPTIONS }` | **保留**。browse 仍然是项目的一部分，编译时导入其命令注册表来生成文档是合理的 |
| `import { SNAPSHOT_FLAGS }` | **保留**。同上 |
| `HostPaths.browseDir` | **更新**路径指向独立 skill 位置（Phase 2c 已处理） |
| `generateBrowseSetup()` | **更新**探测链（Phase 2c 已处理） |
| `copyRuntimeAssets` 步骤 4-5 | **保留**但确认输出到正确的 `dist/{host}/browse/` 路径 |

注意：`{{COMMAND_REFERENCE}}` 和 `{{SNAPSHOT_FLAGS}}` 解析器在根模板中不再使用（Phase 1 已移除），但仍在 `browse/SKILL.md.tmpl` 中使用。解析器本身保留。

**验证**：
```bash
bun test
bun run gen:skill-docs --dry-run  # 所有应该 FRESH
```

**提交**：`refactor(gen-skill-docs): clean up browse path references for standalone skill`

---

### Phase 4: 更新 package.json 和项目描述 ✅

> 预计: human ~30min / CodeBuddy ~5min

**目标**：更新 package.json 中与 browse 拆分相关的内容。

**改动清单**：

| 文件 | 字段 | 变更 |
|------|------|------|
| `package.json` | `description` | 移除 "headless browser" 相关描述，改为 "AI engineering workflow skills" |
| `package.json` | `bin.browse` | **保留**。browse 二进制仍然在这个 repo 中编译，npm bin 入口仍然有用 |
| `package.json` | `build` 脚本 | **不变**。browse 的编译仍然在 build 中 |
| `package.json` | `keywords` | 调整：保留 `browser`, `automation`, `playwright` 但可能加 `ai-workflow`, `skills` |
| `CODEBUDDY.md` | 项目描述 | 更新描述，反映 browse 是独立 skill |
| `README.md` | 项目描述 | 更新描述 |

**提交**：`docs: update project description to reflect browse separation`

---

### Phase 5: 更新测试 ✅

> 预计: human ~1h / CodeBuddy ~10min

**目标**：确保所有测试在新结构下通过。

**改动清单**：

| 文件 | 变更 |
|------|------|
| `test/gen-skill-docs.test.ts` | 命令类别/命令/snapshot flags/unicode arrows 测试改为从 browse SKILL.md 读取；根模板占位符断言移除 `COMMAND_REFERENCE` 和 `SNAPSHOT_FLAGS`；`create_agents_sidecar` 断言移除 browse |
| `test/skill-e2e.test.ts` | `setupBrowseShims` 中 remote-slug 移到 `bin/`；`skillmd-setup-discovery`、`skillmd-no-local-binary`、`skillmd-outside-git` 改为从 browse SKILL.md 提取 SETUP block |
| `test/skill-llm-eval.test.ts` | `command reference table`、`snapshot flags reference`、`setup block`、`regression vs baseline`、`baseline score pinning` 改为从 browse SKILL.md 提取 |
| `test/helpers/touchfiles.ts` | LLM judge touchfiles 中 command/snapshot/setup/baseline 测试依赖改为 browse；E2E touchfiles 中 skillmd-* 测试依赖改为 browse |
| `test/self-contained.test.ts` | `remote-slug` 从 `REQUIRED_BROWSE_BIN_SCRIPTS` 移到 `REQUIRED_BIN_SCRIPTS` |
| `test/touchfiles.test.ts` | 更新断言：`skillmd-setup-discovery` 不再被根模板变更触发 |

**验证**：
```bash
bun test  # 全部通过
```

**提交**：`test: update assertions for browse standalone skill structure`

---

### Phase 6: telemetry 和 bin 脚本清理 ✅

> 预计: human ~30min / CodeBuddy ~5min

**目标**：确认 `bin/gstack-telemetry-log` 中的 `--used-browse` 参数不受影响（它记录的是 browse 使用情况，与安装路径无关），以及其他 bin 脚本无需改动。

**结果**：确认无需改动。telemetry 只关心 "是否使用了 $B"，不关心 browse 从哪里安装。已通过 Phase 5 的测试确认。

---

## 实施顺序与依赖

```
Phase 0 (remote-slug 迁移) ✅
    │
    ▼
Phase 1 (瘦身根模板) ✅ ──────────┐
    │                              │
    ▼                              ▼
Phase 2 (安装流程调整) ✅    Phase 4 (package.json) ✅
    │
    ▼
Phase 3 (gen-skill-docs 清理) ✅
    │
    ▼
Phase 5 (测试更新) ✅
    │
    ▼
Phase 6 (telemetry 确认) ✅
```

- Phase 0 是独立的前置清理，可以最先做
- Phase 1 和 Phase 2 是核心，必须按顺序
- Phase 4 可以在 Phase 1 之后任何时候做
- Phase 3 紧跟 Phase 2
- Phase 5 在所有改动完成后统一确认
- Phase 6 是最后的审查

## 风险评估

### 高风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| `{{BROWSE_SETUP}}` 探测链中断 | 所有使用 browse 的 skill 失效 | 每个 Phase 后运行 `bun test`；探测链逻辑有完整测试覆盖 |

### 中风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| setup 脚本改动影响 Claude/Codex 安装 | 非 CodeBuddy host 安装异常 | Phase 2 同时测试所有 host |
| dist 输出结构变化影响 CI | CI 找不到预期文件 | Phase 2 更新 verify-self-contained.sh |

### 低风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| 根 SKILL.md 变小导致路由质量下降 | AI 可能不知道有 browse 功能 | description 中明确包含 browse 路由条目 |
| 测试覆盖不足 | 隐藏的回归 | 逐 Phase 运行 `bun test` |

## 回滚策略

每个 Phase 独立提交，可以通过 `git revert` 回滚单个 Phase。

关键回滚场景：
- 如果 Phase 2（安装流程）出问题 → revert Phase 2，Phase 1 的根模板瘦身不受影响
- 如果 Phase 1（根模板瘦身）导致路由质量下降 → revert Phase 1，恢复内嵌文档
- 如果 Phase 0（remote-slug 迁移）影响 plan-eng-review → revert Phase 0

## 拆分前后对比

### 根 skill (gstack) 变化

| 维度 | 拆分前 | 拆分后 |
|------|--------|--------|
| SKILL.md 大小 | ~281 行模板 → ~900+ 行生成 | ~55 行模板 → ~500 行生成 |
| 功能 | browse 文档 + skill 路由器 | 纯 skill 路由器 |
| description | "Fast headless browser..." + 路由表 | 纯路由表 |
| 占位符 | PREAMBLE, BROWSE_SETUP, SNAPSHOT_FLAGS, COMMAND_REFERENCE | 仅 PREAMBLE |

### browse skill 变化

| 维度 | 拆分前 | 拆分后 |
|------|--------|--------|
| 安装位置 | `gstack/browse/`（嵌套） | `browse/`（独立，与 qa 同级） |
| SKILL.md | 已存在（browse/SKILL.md.tmpl） | **不变** |
| 二进制路径 | `gstack/browse/dist/browse` | `browse/dist/browse` |
| 依赖它的 skill | 通过 `gstack/browse/...` 路径 | 通过 `browse/dist/...` 路径 |

### 其他 skill 变化

| Skill | 变化 |
|-------|------|
| qa, qa-only, design-review, setup-browser-cookies, design-consultation | `{{BROWSE_SETUP}}` 生成的探测链自动更新，**模板文件无需改动** |
| plan-eng-review, plan-ceo-review | Phase 0 中 `remote-slug` 路径已更新 |
| review/greptile-triage.md | Phase 0 中路径已更新 |
| 其余 skill | 无变化 |

## 完成标准

- [x] `remote-slug` 在 `bin/` 下，`browse/bin/` 下不再有
- [x] 根 `SKILL.md.tmpl` 不包含任何 browse 文档内容
- [x] `dist/{host}/browse/` 包含完整的独立 skill（SKILL.md + dist/ + bin/）
- [x] `dist/{host}/gstack/` 下无 `browse/` 子目录
- [x] `setup` 脚本正确安装 browse 为独立 skill
- [x] 所有使用 `$B` 的 skill 仍能找到 browse 二进制
- [x] `bun test` 全部通过
- [x] `bun run build` 成功
- [x] `./setup --host codebuddy --project /tmp/test` 正确安装
