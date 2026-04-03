# 真正的项目级自包含安装方案

> 创建日期：2026-03-23
> 状态：Phase 6A ✅ 完成 — 构建系统已将运行时资源打包到 dist/；Phase 6B ✅ 完成 — 路径系统重构为自适应探测；Phase 6C ✅ 完成 — setup 全平台物理复制安装（link 模式已删除）；Phase 6D ✅ 完成 — 测试与验证通过
> 前置文档：[migration-plan.md](./migration-plan.md)（Phase 0-5 已完成）、[platform-comparison.md](./platform-comparison.md)
> 作者：CodeBuddy AI

---

## 一、问题陈述

### 1.1 当前状态：「假的自包含」

三个平台（Claude / Codex / CodeBuddy）的安装本质完全相同——**符号链接到源仓库**：

```
~/.codebuddy/skills/gstack → /path/to/gstack-codebuddy  （源仓库的完整目录）
~/.codex/skills/gstack     → /path/to/gstack-codebuddy
.claude/skills/gstack      → (源仓库就住在这个位置)
```

`dist/` 目录只包含编译后的 SKILL.md 文件，**不包含任何运行时依赖**。如果源仓库被删除或移动，所有平台的 skill 都会坏。

### 1.2 运行时缺口矩阵

| 运行时资源 | 文件数 | 总大小 | 引用它的技能 | dist/ 中包含？ |
|-----------|--------|--------|-------------|:----------:|
| `bin/` 下 10 个 shell 脚本 | 10 | ~43 KB | **所有 22 个技能**（Preamble + Telemetry） | ❌ |
| `review/checklist.md` | 1 | 9.9 KB | review, ship | ❌ |
| `review/design-checklist.md` | 1 | 6.5 KB | 含 DESIGN_REVIEW_LITE 的技能 | ❌ |
| `review/greptile-triage.md` | 1 | 8.1 KB | review, ship | ❌ |
| `review/TODOS-format.md` | 1 | 1.6 KB | ship, plan-eng-review, plan-ceo-review, document-release | ❌ |
| `qa/templates/qa-report-template.md` | 1 | 2.9 KB | qa, qa-only | ❌ |
| `qa/references/issue-taxonomy.md` | 1 | 3.5 KB | qa, qa-only | ❌ |
| `browse/dist/browse` 二进制 | 1 | ~70 MB | browse, qa, qa-only, design-review, 根 gstack | ❌ |
| `browse/dist/find-browse` 二进制 | 1 | ~1 MB | browse 技能内部 | ❌ |
| `bin/remote-slug` 脚本 | 1 | 572 B | plan-eng-review, plan-ceo-review | ❌ |
| `browse/bin/find-browse` shim | 1 | 814 B | browse 技能内部 | ❌ |
| `careful/bin/check-careful.sh` | 1 | — | guard, careful (Claude hooks) | ❌ |
| `freeze/bin/check-freeze.sh` | 1 | — | guard, freeze, investigate (Claude hooks) | ❌ |

### 1.3 最终目标

**让 `dist/{host}/` 成为一个完整的、可独立部署的产物**。用户只需要拿到 `dist/codebuddy/` 的内容，放到 `.codebuddy/skills/` 下，无需保留源仓库。

---

## 二、架构设计

### 2.1 目标 `dist/` 结构

```
dist/codebuddy/
├── gstack/                        # 根技能（命令路由）
│   └── SKILL.md
├── review/                        # 代码审查
│   ├── SKILL.md
│   ├── checklist.md               ← 从 review/ 复制
│   ├── design-checklist.md        ← 从 review/ 复制
│   ├── greptile-triage.md         ← 从 review/ 复制
│   └── TODOS-format.md            ← 从 review/ 复制
├── qa/                            # QA 测试
│   ├── SKILL.md
│   ├── templates/
│   │   └── qa-report-template.md  ← 从 qa/templates/ 复制
│   └── references/
│       └── issue-taxonomy.md      ← 从 qa/references/ 复制
├── qa-only/
│   ├── SKILL.md
│   ├── templates/                 ← 同上（或符号链接到 qa/）
│   └── references/
├── ship/                          # 发布流程
│   └── SKILL.md                   # 内部路径引用调整为相对路径
├── browse/                        # 浏览器工具
│   ├── SKILL.md
│   ├── dist/
│   │   ├── browse                 ← 编译后的 CLI 二进制
│   │   ├── find-browse            ← 编译后的查找辅助
│   │   └── .version
│   └── bin/
│       └── find-browse            ← 从 browse/bin/ 复制
├── ...                            # 其余 ~16 个技能
├── bin/                           # 共享运行时脚本（集中一处）
│   ├── gstack-config
│   ├── gstack-telemetry-log
│   ├── gstack-diff-scope
│   ├── gstack-slug
│   ├── gstack-review-log
│   ├── gstack-review-read
│   ├── gstack-analytics
│   └── remote-slug
└── VERSION
```

### 2.2 核心设计决策

#### 决策 1：资源文件打包方式 —— 物理复制，非符号链接

**选择**：在 `bun run build` 时将资源文件**物理复制**到 `dist/` 中。

**理由**：
- 符号链接仍然依赖源仓库存在，不是真正的自包含
- 文件总大小很小（辅助 markdown 共 ~33 KB），复制成本可忽略
- 物理复制后 `dist/` 可以直接打包分发（tarball / npm package）

#### 决策 2：bin/ 脚本的位置 —— 集中式共享目录

**选择**：`dist/{host}/bin/` 作为共享目录，所有技能通过统一路径引用。

**理由**：
- bin 脚本被所有 22 个技能共享，复制到每个技能目录会造成 12 × 22 = 264 份冗余
- 集中一处便于更新和版本管理
- SKILL.md 中的路径引用改为相对于安装根目录：`$GSTACK_ROOT/bin/gstack-config`

#### 决策 3：browse 二进制的位置 —— 跟随 dist/

**选择**：`bun run build` 时将 browse 二进制编译到 `dist/{host}/browse/dist/` 下。

**理由**：
- browse 二进制是约 70 MB 的编译产物，**不应该** check in 到 git
- 但需要在 `bun run build` 时编译并放入 dist/ 结构中
- 用户运行 `./setup` 时，编译后的二进制通过安装脚本复制到位

#### 决策 4：路径解析策略 —— 自适应探测

**选择**：SKILL.md 中的路径引用使用**运行时探测链**，而非硬编码。

```bash
# 新的路径探测模式（编译器生成）
_GSTACK_ROOT=""
# 1. 项目本地安装（自包含）
_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -n "$_ROOT" ] && [ -d "$_ROOT/.codebuddy/skills/gstack/bin" ] && _GSTACK_ROOT="$_ROOT/.codebuddy/skills/gstack"
# 2. 用户全局安装
[ -z "$_GSTACK_ROOT" ] && [ -d "$HOME/.codebuddy/skills/gstack/bin" ] && _GSTACK_ROOT="$HOME/.codebuddy/skills/gstack"
# 3. dist/ 本地开发
[ -z "$_GSTACK_ROOT" ] && [ -d "dist/codebuddy/gstack/bin" ] && _GSTACK_ROOT="dist/codebuddy/gstack"
```

这样同时支持三种场景：
1. **项目级自包含安装**：`dist/codebuddy/` 内容直接放在 `.codebuddy/skills/` 下
2. **用户全局安装**：`setup` 脚本安装到 `~/.codebuddy/skills/`
3. **开发模式**：直接使用 `dist/` 目录

#### 决策 5：辅助 markdown 的路径引用 —— 相对路径

**选择**：SKILL.md 中对辅助文件的引用改为**相对路径**。

**当前**（硬编码绝对路径）：
```
Read .claude/skills/review/checklist.md
```

**目标**（相对路径，编译器自动生成）：
```
Read $GSTACK_ROOT/review/checklist.md
```

`$GSTACK_ROOT` 由 Preamble 中的探测链设定。

---

## 三、分阶段实施计划

### Phase 6A — 构建系统改造：资源文件打包 ✅ 完成

**目标**：修改 `bun run build` 流程，将运行时资源复制到 `dist/` 中。

> **完成于**: 2026-03-23
> **实现**: `scripts/gen-skill-docs.ts` 新增 `copyRuntimeAssets()` 函数，在模板编译后将 7 类运行时资源物理复制到 `dist/{host}/`
> **测试**: `test/self-contained.test.ts`（57 个测试覆盖 3 个 host 的 dist/ 完整性）
> **附加修复**: `test/skill-validation.test.ts` 添加 `RUNTIME_ASSETS` 过滤，避免将 bin/browse/VERSION 误判为技能目录

#### 6A.1 修改 `scripts/gen-skill-docs.ts`

在 `processTemplate()` 之后添加资源复制逻辑：

```typescript
function copyRuntimeAssets(host: Host): void {
  const distRoot = path.join(ROOT, 'dist', host);

  // 1. 复制 bin/ 脚本（排除 dev-setup、dev-teardown）
  const BIN_SCRIPTS = [
    'gstack-config', 'gstack-telemetry-log',
    'gstack-diff-scope', 'gstack-slug',
    'gstack-review-log', 'gstack-review-read',
    'gstack-analytics', 'remote-slug',
  ];
  const binDir = path.join(distRoot, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  for (const script of BIN_SCRIPTS) {
    fs.copyFileSync(
      path.join(ROOT, 'bin', script),
      path.join(binDir, script)
    );
    fs.chmodSync(path.join(binDir, script), 0o755);
  }

  // 2. 复制 review/ 辅助文件
  const REVIEW_FILES = [
    'checklist.md', 'design-checklist.md',
    'greptile-triage.md', 'TODOS-format.md',
  ];
  const reviewDir = path.join(distRoot, hostSkillName('review'));
  for (const file of REVIEW_FILES) {
    fs.copyFileSync(
      path.join(ROOT, 'review', file),
      path.join(reviewDir, file)
    );
  }

  // 3. 复制 qa/ 辅助文件
  const qaDir = path.join(distRoot, hostSkillName('qa'));
  fs.mkdirSync(path.join(qaDir, 'templates'), { recursive: true });
  fs.mkdirSync(path.join(qaDir, 'references'), { recursive: true });
  fs.copyFileSync(
    path.join(ROOT, 'qa/templates/qa-report-template.md'),
    path.join(qaDir, 'templates/qa-report-template.md')
  );
  fs.copyFileSync(
    path.join(ROOT, 'qa/references/issue-taxonomy.md'),
    path.join(qaDir, 'references/issue-taxonomy.md')
  );

  // 4. 复制 browse/bin/ 脚本
  const browseBinDir = path.join(distRoot, 'browse', 'bin');
  fs.mkdirSync(browseBinDir, { recursive: true });
  fs.copyFileSync(
    path.join(ROOT, 'browse/bin/find-browse'),
    path.join(browseBinDir, 'find-browse')
  );
  fs.chmodSync(path.join(browseBinDir, 'find-browse'), 0o755);
}
```

#### 6A.2 修改 `package.json` 的 `build` 脚本

browse 二进制的编译输出目标改为 `dist/{host}/browse/dist/`：

```bash
# 原来
bun build --compile browse/src/cli.ts --outfile browse/dist/browse

# 改为：编译到源 browse/dist/（保持开发兼容），然后复制到各 host 的 dist/
bun build --compile browse/src/cli.ts --outfile browse/dist/browse
bun build --compile browse/src/find-browse.ts --outfile browse/dist/find-browse
# gen-skill-docs 的 copyRuntimeAssets() 负责将 browse/dist/* 复制到 dist/{host}/browse/dist/
```

#### 6A.3 qa-only 辅助文件处理

`qa-only/` 引用了和 `qa/` 相同的辅助文件。两个选择：

**方案 A（推荐）**：在 SKILL.md 中将 qa-only 的路径引用指向 `qa/` 的辅助文件：
```
Copy report template from $GSTACK_ROOT/qa/templates/qa-report-template.md
```

**方案 B**：复制一份到 `qa-only/` 下（冗余但独立）。

推荐方案 A，减少冗余。

#### 6A.4 交付物

- [x] `scripts/gen-skill-docs.ts` 新增 `copyRuntimeAssets()` 函数
- [x] `bun run build` 后 `dist/codebuddy/bin/` 包含 10 个运行时脚本
- [x] `bun run build` 后 `dist/codebuddy/review/` 包含 4 个辅助 md 文件
- [x] `bun run build` 后 `dist/codebuddy/qa/` 包含 templates/ 和 references/
- [x] `bun run build` 后 `dist/codebuddy/browse/` 包含编译产物和 bin/ 脚本
- [x] `.gitignore` 排除 browse 二进制（~70MB 不入库）
- [x] `test/self-contained.test.ts` 57 个自动化测试
- [x] `test/skill-validation.test.ts` 适配新的 dist/ 结构

---

### Phase 6B — 路径系统重构：从硬编码到自适应探测 ✅ 完成

**目标**：重写 SKILL.md 中的所有路径引用，从硬编码绝对路径改为运行时探测。

> **完成于**: 2026-03-23
> **实现**: `scripts/gen-skill-docs.ts` 新增 `generateGstackRootDetect()` 函数，codebuddy host 的 `HOST_PATHS` 改为 `$_GSTACK_ROOT` 变量引用，后处理自动注入探测链到所有包含 `$_GSTACK_ROOT` 的 bash 块
> **测试**: `test/gen-skill-docs.test.ts` 和 `test/self-contained.test.ts` 更新以验证新路径模式（838 个测试全部通过）
> **验证**: dist/codebuddy/ 中 349 个 `$_GSTACK_ROOT` 引用，72 个探测链注入，零 `.claude/skills` 残留，零硬编码 `~/.codebuddy/skills/gstack/bin` 路径
> **向后兼容**: Claude 和 Codex host 完全不受影响（零 `GSTACK_ROOT` 引用）

#### 6B.1 新增 `generateGstackRootDetect()` 函数

替代当前 Preamble 中分散的路径引用，提供统一的根目录探测：

```typescript
function generateGstackRootDetect(ctx: TemplateContext): string {
  const { host, paths } = ctx;
  return `
# Detect gstack installation root
_GSTACK_ROOT=""
_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
# Priority 1: project-local self-contained install
[ -n "$_ROOT" ] && [ -d "$_ROOT/${paths.localSkillRoot}/bin" ] && _GSTACK_ROOT="$_ROOT/${paths.localSkillRoot}"
# Priority 2: project-local skills directory (e.g. .codebuddy/skills/gstack)
[ -z "$_GSTACK_ROOT" ] && [ -n "$_ROOT" ] && [ -d "$_ROOT/.${host}/skills/gstack/bin" ] && _GSTACK_ROOT="$_ROOT/.${host}/skills/gstack"
# Priority 3: user-global install
[ -z "$_GSTACK_ROOT" ] && [ -d "${paths.skillRoot}/bin" ] && _GSTACK_ROOT="${paths.skillRoot}"
`;
}
```

#### 6B.2 重写 `HOST_PATHS` 体系

当前 `HOST_PATHS` 中的 `binDir` 和 `browseDir` 是硬编码的绝对路径。改为：

```typescript
// 编译时仍使用 HOST_PATHS 做路径替换的「种子」
// 但生成的 SKILL.md 中使用 $_GSTACK_ROOT 变量
const HOST_PATHS: Record<Host, HostPaths> = {
  codebuddy: {
    skillRoot: '$_GSTACK_ROOT',                    // 运行时变量
    localSkillRoot: 'dist/codebuddy/gstack',       // 保持不变（开发时用）
    binDir: '$_GSTACK_ROOT/bin',                   // 使用探测到的根
    browseDir: '$_GSTACK_ROOT/browse/dist',        // 使用探测到的根
  },
  // claude 和 codex 暂时保持不变（向后兼容），后续可选迁移
};
```

#### 6B.3 重写辅助文件路径引用

所有模板中对辅助文件的硬编码路径需要参数化：

| 当前硬编码路径 | 目标路径 | 来源模板 |
|--------------|---------|---------|
| `.claude/skills/review/checklist.md` | `$_GSTACK_ROOT/review/checklist.md` | review, ship |
| `.claude/skills/review/design-checklist.md` | `$_GSTACK_ROOT/review/design-checklist.md` | DESIGN_REVIEW_LITE resolver |
| `.claude/skills/review/greptile-triage.md` | `$_GSTACK_ROOT/review/greptile-triage.md` | review, ship |
| `.claude/skills/review/TODOS-format.md` | `$_GSTACK_ROOT/review/TODOS-format.md` | ship, plan-eng-review, plan-ceo-review, document-release |
| `qa/templates/qa-report-template.md` | `$_GSTACK_ROOT/qa/templates/qa-report-template.md` | QA_METHODOLOGY resolver |
| `qa/references/issue-taxonomy.md` | `$_GSTACK_ROOT/qa/references/issue-taxonomy.md` | QA_METHODOLOGY resolver |
| `browse/bin/remote-slug` | `$_GSTACK_ROOT/bin/remote-slug` | plan-eng-review, plan-ceo-review |

**实现方式**：

1. 对于 resolver 函数中的路径（`generateQAMethodology`、`generateDesignReviewLite` 等）：直接使用 `ctx.paths.skillRoot` 变量
2. 对于模板正文中的硬编码路径：在编译器后处理中添加替换规则

```typescript
// 新增后处理：辅助文件路径参数化
if (host === 'codebuddy') {
  // review 辅助文件
  content = content.replace(
    /\.claude\/skills\/review\/(\w[\w-]*\.md)/g,
    `$_GSTACK_ROOT/review/$1`
  );
  // qa 辅助文件
  content = content.replace(
    /qa\/templates\//g,
    `$_GSTACK_ROOT/qa/templates/`
  );
  content = content.replace(
    /qa\/references\//g,
    `$_GSTACK_ROOT/qa/references/`
  );
}
```

#### 6B.4 重写 bin/ 脚本内部的路径引用

部分 bin/ 脚本内部有对源仓库结构的依赖：

| 脚本 | 内部路径引用 | 处理方式 |
|------|------------|---------|
| `gstack-telemetry-log` | `GSTACK_DIR=$(cd "$(dirname "$0")/.." && pwd)` | ✅ 已通过相对路径解析，自包含后仍然正确 |
| `gstack-review-log` | `SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)` | ✅ 同上 |
| `gstack-review-read` | `SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)` | ✅ 同上 |
| `gstack-config` | 无外部路径依赖 | ✅ 已自包含 |
| `gstack-slug` | 无外部路径依赖 | ✅ 已自包含 |
| `gstack-diff-scope` | 无外部路径依赖 | ✅ 已自包含 |
| `gstack-analytics` | 无外部路径依赖 | ✅ 已自包含 |

**好消息**：大部分脚本使用 `$(dirname "$0")/..` 做相对路径解析，在 `dist/{host}/bin/` 结构下自然指向 `dist/{host}/`——这正是我们的安装根。只要 `dist/{host}/` 结构正确，脚本不需要修改。

#### 6B.5 VERSION 文件

bin 脚本中引用了 `$GSTACK_DIR/VERSION`。需要在 build 时将 `VERSION` 文件也复制到 `dist/{host}/`。

#### 6B.6 交付物

- [x] `generateGstackRootDetect()` 函数实现（3 优先级探测链：项目本地 dist/ → 项目本地 .codebuddy/skills/ → 全局 ~/.codebuddy/skills/）
- [x] Preamble 中所有路径引用使用 `$_GSTACK_ROOT`
- [x] 模板正文中辅助文件路径参数化（review/, qa/ sidecar 文件 + 后处理自动注入）
- [x] 所有 bin/ 脚本在新目录结构下正确工作（使用 `$(dirname "$0")/..` 相对路径解析）
- [x] 辅助文件（greptile-triage.md, design-checklist.md）路径替换修复（`copyRuntimeAssets` 增加 codebuddy host 路径替换）
- [x] 后处理自动注入：正则扫描所有 bash 块，对包含 `$_GSTACK_ROOT` 但缺少探测链的块自动注入
- ❌ gstack-upgrade 模板特殊处理：已移除（gstack-upgrade 功能整体删除，用户手动更新安装）
- [x] 测试更新：`gen-skill-docs.test.ts` 和 `self-contained.test.ts` 适配 `$_GSTACK_ROOT` 路径

---

### Phase 6C — 安装系统重写：真正的项目级安装 ✅ 完成

**目标**：重写 `setup` 脚本，支持将 `dist/` 产物直接复制（非符号链接）到目标目录。

> **完成于**: 2026-03-24
> **实现**: `setup` 脚本统一为 `install_copy()` 函数，物理复制安装到所有 host，支持 `--project` 参数实现项目级安装
> **验证**: 项目级安装（`--project`）和全局安装均通过端到端测试，19 个技能 + 全部运行时资源就位，零符号链接
> **后续更新（2026-03-26）**: `--mode` 参数已废弃（仍接受但打印 warning），link 模式已删除，所有平台统一物理复制

#### 6C.1 统一物理复制安装

> **注意**：`--mode copy|link` 参数已在 2026-03-26 废弃。所有平台统一使用物理复制，`--mode` 仍被接受但会打印 deprecated 警告。

```bash
./setup                                          # 默认安装到 ~/.claude/skills/（物理复制）
./setup --host codebuddy                         # 安装到 ~/.codebuddy/skills/（物理复制）
./setup --host codebuddy --project               # 安装到当前项目 .codebuddy/skills/（物理复制）
```

#### 6C.2 `install_copy()` 统一安装函数

> **注意**：原设计为 `install_codebuddy_copy()`，实际实现已演化为统一的 `install_copy()` 函数，替代了之前 4 个 host 各自的 symlink 函数。

```bash
install_copy() {
  local host="$1"       # claude, codex, or codebuddy
  local skills_dir="$2" # e.g. ~/.codebuddy/skills or ./.codebuddy/skills
  local dist_src="$GSTACK_DIR/dist/$host"

  # Validate dist/ is a self-contained build
  if [ ! -d "$dist_src/bin" ]; then
    echo "Error: dist/$host/ is not a self-contained build." >&2
    echo "Run 'bun run build' first." >&2
    return 1
  fi

  local gstack_root="$skills_dir/gstack"

  # bin/ scripts
  rm -rf "$gstack_root/bin"
  mkdir -p "$gstack_root/bin"
  cp -R "$dist_src/bin/"* "$gstack_root/bin/"
  chmod +x "$gstack_root/bin/"*

  # VERSION
  [ -f "$dist_src/VERSION" ] && cp "$dist_src/VERSION" "$gstack_root/VERSION"

  # Root skill (gstack/SKILL.md)
  [ -f "$dist_src/gstack/SKILL.md" ] && cp "$dist_src/gstack/SKILL.md" "$gstack_root/SKILL.md"

  # Individual skill directories (iterate all, skip gstack/ and bin/)
  for skill_dir in "$dist_src"/*/; do
    [ -d "$skill_dir" ] || continue
    local skill_name=$(basename "$skill_dir")
    [ "$skill_name" = "gstack" ] || [ "$skill_name" = "bin" ] && continue
    [ -f "$skill_dir/SKILL.md" ] || continue
    rm -rf "$skills_dir/$skill_name"
    cp -R "$skill_dir" "$skills_dir/$skill_name"
  done

  echo "gstack installed ($host, self-contained copy)."
}
```

#### 6C.3 项目级安装模式

新增 `--project` 标志，将 dist/ 内容安装到当前项目的 `.codebuddy/skills/` 下：

```bash
./setup --host codebuddy --project
# 安装到: ./.codebuddy/skills/gstack/  （项目本地）
```

这是**真正的项目级自包含安装**——dist/ 内容被完整复制到项目目录内，项目可以独立运行，不依赖任何外部路径。

#### 6C.4 交付物

- [x] `setup` 脚本统一为 `install_copy()` 物理复制安装（`--mode` 参数已废弃，仍接受但打印 warning）
- [x] `setup` 脚本支持 `--project` 标志
- [x] 复制模式下所有运行时资源就位（bin/ 脚本, browse/bin/, VERSION, review sidecar 文件, qa sidecar 文件）
- [x] 参数验证：`--project` 仅支持 codebuddy host
- [x] 所有平台统一物理复制，link 模式已删除
- [x] 安装后零符号链接，全部物理复制

---

### Phase 6D — 测试与验证 ✅ 完成

**目标**：完整验证自包含安装的正确性，包括手动脚本和自动化测试。

> **完成于**: 2026-03-24
> **实现**: `scripts/verify-self-contained.sh` 手动 Acid Test 脚本（41 项检查），`test/self-contained.test.ts` 扩展至 69 个测试（新增 12 个 Phase 6D 端到端验证）
> **修复**: `package.json` build 顺序调整（browse 二进制编译移到 gen-skill-docs 之前，确保 copyRuntimeAssets 能复制最新二进制）
> **验证**: 847 个测试全部通过（0 失败），手动验证脚本 41 项全部通过

#### 6D.1 自包含完整性测试

```bash
# 1. 构建自包含产物
bun run build

# 2. 验证 dist/ 结构完整性
test -f dist/codebuddy/bin/gstack-config || echo "FAIL: bin/ missing"
test -f dist/codebuddy/review/checklist.md || echo "FAIL: review assets missing"
test -f dist/codebuddy/qa/templates/qa-report-template.md || echo "FAIL: qa assets missing"
test -f dist/codebuddy/browse/bin/find-browse || echo "FAIL: browse bin missing"
test -f dist/codebuddy/VERSION || echo "FAIL: VERSION missing"

# 3. 模拟自包含安装
TEMP_DIR=$(mktemp -d)
cp -R dist/codebuddy/* "$TEMP_DIR/"

# 4. 从临时目录验证脚本可执行
"$TEMP_DIR/bin/gstack-config" list
"$TEMP_DIR/bin/gstack-slug"

# 5. 验证 SKILL.md 中无断裂路径
grep -r '~/.claude/skills' dist/codebuddy/ && echo "FAIL: stale .claude path" || echo "OK: no .claude paths"
grep -r '~/.codebuddy/skills/gstack/bin' dist/codebuddy/ && echo "WARN: hardcoded absolute path found"

# 6. 清理
rm -rf "$TEMP_DIR"
```

#### 6D.2 自动化测试用例

在 `test/` 下新增 `self-contained.test.ts`：

```typescript
describe('self-contained dist', () => {
  test('dist/codebuddy/bin/ contains all required scripts', () => { ... });
  test('dist/codebuddy/review/ contains auxiliary files', () => { ... });
  test('dist/codebuddy/qa/ contains templates and references', () => { ... });
  test('no stale .claude paths in codebuddy dist', () => { ... });
  test('bin scripts resolve GSTACK_DIR correctly from dist/', () => { ... });
  test('VERSION file present in dist/', () => { ... });
});
```

#### 6D.3 交付物

- [x] 手动验证脚本 `scripts/verify-self-contained.sh`（41 项检查：结构完整性 + Acid Test + 路径完整性 + setup 验证）
- [x] 自动化测试 `test/self-contained.test.ts`（69 个测试：57 Phase 6A + 12 Phase 6D Acid Test）
- [x] 所有现有测试通过（`bun test` — 847 个测试）
- [x] `package.json` build 顺序修复（browse 编译 → gen-skill-docs，确保 copyRuntimeAssets 可靠复制二进制）

---

## 四、bin/ 脚本分类

### 4.1 必须打包的脚本（技能运行时依赖）

| 脚本 | 引用者 | 重要度 |
|------|--------|--------|
| `gstack-config` | 所有技能 Preamble + telemetry | 🔴 关键 |
| `gstack-telemetry-log` | 所有技能 Completion Status | 🔴 关键 |
| `gstack-slug` | 11 个技能 | 🔴 关键 |
| `gstack-diff-scope` | ship, DESIGN_REVIEW_LITE | 🟡 重要 |
| `gstack-review-log` | ship, plan-eng-review, plan-ceo-review, codex, DESIGN_REVIEW_LITE | 🟡 重要 |
| `gstack-review-read` | REVIEW_DASHBOARD | 🟡 重要 |

### 4.2 可选打包的脚本（用户工具）

| 脚本 | 用途 | 打包？ |
|------|------|--------|
| `gstack-analytics` | 用户手动查看使用统计 | ✅ 打包（轻量） |

### 4.3 不需要打包的脚本（开发者工具）

| 脚本 | 用途 | 理由 |
|------|------|------|
| `dev-setup` | 开发模式设置 | 仅开发者使用 |
| `dev-teardown` | 开发模式清理 | 仅开发者使用 |

---

## 五、browse 二进制的特殊处理

### 5.1 问题

browse 二进制是 ~70 MB 的编译产物，不适合 check in 到 git。当前 `bun run build` 编译到 `browse/dist/`。

### 5.2 方案

1. **开发模式**：`bun run build` 仍然编译到 `browse/dist/`（保持现有行为）
2. **自包含 build**：`copyRuntimeAssets()` 将 `browse/dist/browse` 和 `browse/dist/find-browse` 复制到 `dist/{host}/browse/dist/`
3. **SKILL.md 路径探测**：`generateBrowseSetup()` 的探测链已支持多个位置，新增 `$_GSTACK_ROOT/browse/dist/browse` 为首选

### 5.3 .gitignore 调整

确保 `dist/*/browse/dist/` 被 gitignore（二进制不入库）：

```
# .gitignore
dist/*/browse/dist/browse
dist/*/browse/dist/find-browse
dist/*/browse/dist/.version
```

只有 SKILL.md 和辅助 markdown 文件入库，二进制在用户本地 `bun run build` 时生成。

---

## 六、向后兼容

### 6.1 所有平台统一为物理复制 ✅

> **更新于 2026-03-26**：`--mode` 参数和 `--host auto` 已从 setup 脚本中完全移除。所有平台（Claude / Codex / CodeBuddy）统一使用物理复制安装，安装行为必须通过 `--host` 显式指定目标平台。

### 6.2 开发模式仍然使用符号链接

`bin/dev-setup` 创建的开发模式符号链接继续保持——开发者需要即时看到模板修改的效果。

### 6.3 迁移路径

```
Phase 6A ✅: dist/ 包含全部运行时资源（build 产物丰富化）
    ↓
Phase 6B ✅: SKILL.md 路径引用改为自适应探测
    ↓
Phase 6C ✅: setup 全平台物理复制安装（link 模式已删除）
    ↓
Phase 6D ✅: 测试验证，确保独立运行
```

每个阶段都可以独立完成和验证，不需要一步到位。

---

## 七、时间估算

| 阶段 | 预计耗时 | 累计 | 状态 |
|------|---------|------|------|
| Phase 6A — 构建系统改造 | 1 天 | 1 天 | ✅ 完成 |
| Phase 6B — 路径系统重构 | 2 天 | 3 天 | ✅ 完成 |
| Phase 6C — 安装系统重写 | 1 天 | 4 天 | ✅ 完成 |
| Phase 6D — 测试与验证 | 0.5 天 | 4.5 天 | ✅ 完成 |

**最小可用版本**：Phase 6A 完成后，`dist/` 已经包含完整资源，手动复制即可实现自包含安装。

**完整版本**：4.5 天，支持 `./setup --host codebuddy --project` 一键项目级安装。

---

## 八、验证标准

### 最终验收测试（The Acid Test）

```bash
# 1. 从零开始构建
git clone ... && cd gstack-codebuddy
bun install && bun run build

# 2. 复制 dist/ 到一个全新目录
mkdir /tmp/test-project/.codebuddy/skills -p
cp -R dist/codebuddy/* /tmp/test-project/.codebuddy/skills/

# 3. 删除源仓库（模拟用户只拿到 dist/ 产物）
# (不实际删除，用 PATH 隔离代替)

# 4. 从项目目录验证
cd /tmp/test-project
# 所有 bin/ 脚本可执行
.codebuddy/skills/gstack/bin/gstack-config list
.codebuddy/skills/gstack/bin/gstack-slug

# 5. 辅助文件可读
cat .codebuddy/skills/review/checklist.md > /dev/null
cat .codebuddy/skills/qa/templates/qa-report-template.md > /dev/null

# 6. browse 二进制可执行（如果已编译）
.codebuddy/skills/gstack/browse/dist/browse --version 2>/dev/null

# 7. SKILL.md 中无断裂引用
grep -rn 'gstack-codebuddy' .codebuddy/skills/ && echo "FAIL" || echo "PASS: no source repo references"

# 8. 清理
rm -rf /tmp/test-project
```

**通过标准**：上述所有步骤成功完成，无报错，无断裂引用。

---

## 九、风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| bin/ 脚本中有未发现的源仓库路径依赖 | 脚本运行时报错 | 中 | 全量审查脚本；自包含完整性测试 |
| browse 二进制太大导致复制/安装慢 | 用户体验差 | 低 | 可选安装：`--skip-browse` 跳过浏览器 |
| 路径探测链在某些 shell 环境失败 | Preamble 报错 | 低 | 探测链每步都有 `|| true` 保护 |
| `$_GSTACK_ROOT` 变量在 AI 上下文中不可靠 | AI 可能不正确使用路径 | 中 | 探测链在 Preamble bash 中执行，结果通过 echo 暴露给 AI |
| dist/ 结构变更导致现有符号链接模式断裂 | 已有安装受影响 | 低 | 符号链接模式的 dist/ 结构不变，新资源只是增量添加 |

---

## 十、与现有重构计划的关系

本文档是 [migration-plan.md](./migration-plan.md) 的后续演进：

```
migration-plan.md (Phase 0-5)         self-contained-install.md (Phase 6)
─────────────────────────────         ─────────────────────────────────────
Phase 0 ✅ 统一 dist/ 目录             Phase 6A ✅ 构建系统改造（资源打包）
Phase 1 ✅ 模板编译器扩展              Phase 6B ✅ 路径系统重构（自适应探测）
Phase 2 ✅ CODEBUDDY.md                Phase 6C ✅: 安装系统重写（copy 模式）
Phase 3 ✅ Preamble 适配               Phase 6D ✅: 测试与验证
Phase 4 ✅ Setup 脚本                  ← Phase 6C 已完全重写此部分
Phase 5 ✅ Setup 脚本 + 浏览器引擎    ← 已完成（MCP 封装不做，终端命令已满足需求）
```

Phase 6 实施完成后，gstack 在 CodeBuddy 上将实现**真正的项目级自包含安装**——这是第一个让 dist/ 成为完整可部署产物的 AI 工程工作流系统。

> ✅ **Phase 6 全部完成**（2026-03-24）。`dist/codebuddy/` 已成为完整、自包含、可独立部署的产物。847 个自动化测试通过，手动 Acid Test 41 项验证通过。
