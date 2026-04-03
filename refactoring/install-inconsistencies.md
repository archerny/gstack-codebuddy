# 安装模式不一致问题追踪

> 创建日期：2026-03-26
> 最近更新：2026-03-27（全部 15 个问题已修复：代码问题 #10/#12/#14/#15 + 文档问题 #3/#4/#6）
> 状态：✅ 全部修复（15/15）
> 来源：安装模式分析（对比 `setup` 脚本实际代码 vs `self-contained-install.md` 设计文档）
> 关联文档：[self-contained-install.md](./self-contained-install.md)

---

## 问题总览

| # | 问题 | 严重度 | 影响范围 | 状态 |
|---|------|--------|---------|------|
| 1 | `--project` 参数无 host 验证 | 🟡 中 | setup 脚本 | ✅ 已修复（所有 host 均支持 --project） |
| 2 | bin/ 脚本数量：文档声称的幽灵脚本 | 🔴 高 | self-contained-install.md | ✅ 已修复（幽灵脚本引用已清理） |
| 3 | `remote-slug` 位置描述错误 | 🟡 中 | self-contained-install.md 6A 伪代码 | ✅ 已修复（路径引用统一更正） |
| 4 | 6C.2 伪代码与实际 `install_copy()` 不符 | 🟢 低 | self-contained-install.md 6C.2 | ✅ 已修复（伪代码同步为实际实现） |
| 5 | `supabase/config.sh` 声称已打包但实际不存在 | 🔴 高 | self-contained-install.md 6A.4 / 6B.4 | ✅ 已修复（supabase 引用已清理） |
| 6 | dist/ 目标结构图 2.1 中 `browse/` 重复 | 🟡 中 | self-contained-install.md 2.1 | ✅ 已修复（合并为单个 browse/ 条目） |
| 7 | Codex 全局卸载遗漏 `.agents/skills/` | 🔴 高 | setup 脚本 | ✅ 已修复（移除双写后不再存在） |
| 8 | Claude host sidecar 文件路径未替换 | 🔴 高 | gen-skill-docs.ts + dist/claude/ | ✅ 已修复（统一 replaceClaudePaths()） |
| 9 | qa/ 辅助文件路径替换仅 CodeBuddy 有 | 🟡 中 | gen-skill-docs.ts + dist/claude/ + dist/codex/ | ✅ 已修复（qa/ 替换提到公共位置） |
| 10 | setup 脚本 PROJECT_DIR 解析代码重复 | 🟡 中 | setup 脚本 | ✅ 已修复（提取 resolve_project_root()） |
| 11 | document-release 裸相对路径 `review/TODOS-format.md` | 🟡 中 | 模板 + dist/全部 host | ✅ 已修复（模板补上 .claude/skills/ 前缀） |
| 12 | setup 中 `~/.gstack` 冗余创建 | 🟢 低 | setup 脚本 | ✅ 已修复（删除冗余代码） |
| 13 | Codex 双写 REPO_ROOT 推导不可靠 | 🟢 低 | setup 脚本 | ✅ 已修复（移除双写后不再存在） |
| 14 | `SKILLS_DIR` 残留死代码 | 🟢 低 | setup 脚本 | ✅ 已修复（删除未使用变量） |
| 15 | 未知参数静默忽略 | 🟡 中 | setup 脚本 | ✅ 已修复（改为报错退出） |

---

## 问题详情

### 问题 1：`--project` 参数无 host 验证 ✅ 已修复

**原始问题**：`setup` 脚本中所有 host 都接受 `--project` 参数解析，但只有 codebuddy 分支的安装逻辑会使用它。对于 claude/codex host，`--project` 被静默忽略。

**修复方案**：采用方案 C — 所有三个 host 都完整支持 `--project` 参数：
- Claude: `--project` 安装到 `<project>/.claude/skills/`
- Codex: `--project` 安装到 `<project>/.agents/skills/`
- CodeBuddy: `--project` 安装到 `<project>/.codebuddy/skills/`（已有）

**配套修改**：
1. `gen-skill-docs.ts` 中 `generateGstackRootDetect()` 扩展为所有 host 生成 3 优先级探测链
2. `HOST_PATHS` 统一为 `$_GSTACK_ROOT` 运行时变量（不再硬编码 `~/.claude/skills/gstack`）
3. `generateBrowseSetup()` 统一为三个 host 使用探测链
4. `setup` 卸载逻辑统一支持 `--project` 项目级卸载
5. 测试用例同步更新

---

### 问题 2：文档中的幽灵脚本（bin/ 脚本数量不一致）✅ 已修复

**原始问题**：
- 1.2 运行时缺口矩阵声称 "12 个 shell 脚本"
- 6A 伪代码 `BIN_SCRIPTS` 列出了 9 个脚本，其中包含 `gstack-telemetry-sync` 和 `gstack-community-dashboard`
- 4.2 可选打包表也列出了 `gstack-community-dashboard`
- 4.1 必须打包表列出了 `gstack-telemetry-sync`
- 6B.4 表格也引用了这两个脚本
- **这两个脚本从未被创建过，文件不存在**

**根因**：远端 Supabase 数据同步功能在设计阶段规划，但在实现阶段明确取消（TODOS.md 标注 CANCELLED），代码正确地跳过了这些脚本，但文档未同步更新。

**修复方式**：从 `self-contained-install.md` 中彻底清理所有幽灵引用：
- 2.1 结构图：移除 `gstack-telemetry-sync` 和 `gstack-community-dashboard`，补上 `remote-slug`
- 1.2 矩阵：脚本数量 12 → 10
- 6A.1 伪代码：`BIN_SCRIPTS` 列表同步为实际的 8 个脚本
- 6A.4 交付物：删除 `supabase/config.sh` 虚假声明
- 4.1 表格：移除 `gstack-telemetry-sync`
- 4.2 表格：移除 `gstack-community-dashboard`
- 6B.4 表格：移除幽灵脚本行和 supabase 复制方案
- 6B.6 交付物：删除 `supabase/config.sh` 虚假声明
- 同步清理 `test/self-contained.test.ts` 中 supabase 条件复制
- 同步清理 `tsconfig.json` 中 `"supabase"` include

---

### 问题 3：`remote-slug` 位置描述错误 ✅ 已修复

**原始问题**：6A 伪代码 `copyRuntimeAssets()` 将 `remote-slug` 复制到 `browse/bin/` 下，2.1 结构图也将其放在 `browse/bin/remote-slug`。

**实际代码**：`remote-slug` 位于顶层 `bin/` 目录中（与 `gstack-config` 等脚本同级），由 `BIN_SCRIPTS` 列表统一复制到 `dist/*/bin/`。`browse/bin/` 下只有 `find-browse`。

**修复方式**：
- 2.1 结构图：将 `remote-slug` 从 `browse/bin/` 移到 `bin/`
- 1.2 矩阵：`browse/bin/remote-slug` → `bin/remote-slug`
- 6A 伪代码：browse/bin/ 复制部分移除 `remote-slug`（已在 BIN_SCRIPTS 中处理）
- 6B.3 表格：目标路径从 `$_GSTACK_ROOT/browse/bin/remote-slug` 改为 `$_GSTACK_ROOT/bin/remote-slug`
- 6D.1 验证脚本：检查路径更正

---

### 问题 4：6C.2 伪代码与实际 `install_copy()` 实现不符 ✅ 已修复

**原始问题**：6C.2 的伪代码显示 `install_codebuddy_copy()` 函数，显式复制 `browse/`、`supabase/` 目录，遍历 `gstack-*/` 模式匹配技能目录。实际实现为统一的 `install_copy()` 函数，接受 host 和 skills_dir 参数，遍历所有 `*/` 子目录。

**修复方式**：将 6C.2 伪代码完全更新为实际的 `install_copy()` 实现：
- 函数名从 `install_codebuddy_copy()` 改为 `install_copy(host, skills_dir)`
- 参数化 host 和安装目录
- 复制逻辑同步为实际的通用遍历（`*/` 子目录，排除 `gstack` 和 `bin`，检查 `SKILL.md` 存在性）
- 注明此函数适用于所有 host

---

### 问题 5：`supabase/config.sh` 声称已打包但实际不存在 ✅ 已修复

**原始问题**：
- 6A.4 交付物明确标注 "[x] supabase/config.sh 和 VERSION 也已打包到 dist/"
- 6B.4 表格中 `gstack-community-dashboard` 引用 `"$GSTACK_DIR/supabase/config.sh"`
- 6B.4 末尾："将 `supabase/config.sh` 也复制到 `dist/{host}/supabase/config.sh`"
- 九、风险表中也提到 "supabase/config.sh 包含敏感信息"
- 实际代码中**没有任何 supabase 相关逻辑**，`supabase/` 目录不存在

**根因**：与问题 2 同源——远端 Supabase 同步功能已取消，`supabase/config.sh` 从未创建，但文档多处声称已完成。

**修复方式**：
- 从 `self-contained-install.md` 中删除所有 supabase 引用（6A.4 交付物、6B.4 表格、6B.6 交付物、6C.2 伪代码、6C.4 交付物、九、风险表）
- 从 `test/self-contained.test.ts` 中移除 supabase 条件复制逻辑
- 从 `tsconfig.json` 中移除 `"supabase"` include

---

### 问题 6：dist/ 目标结构图 2.1 中 `browse/` 重复出现 ✅ 已修复

**原始问题**：2.1 结构图中 `browse/` 出现两次：一次作为技能目录（含 `SKILL.md`），一次在根级出现（含 `dist/` 二进制和 `bin/` 脚本）。实际只有一个 `browse/` 目录。

**修复方式**：合并为单个 `browse/` 条目，同时包含 `SKILL.md`、`dist/`（二进制）和 `bin/`（find-browse shim）：

```
├── browse/                        # 浏览器工具
│   ├── SKILL.md
│   ├── dist/
│   │   ├── browse
│   │   ├── find-browse
│   │   └── .version
│   └── bin/
│       └── find-browse
```

---

### 问题 7：Codex 全局卸载遗漏 `.agents/skills/` ✅ 已修复

**原始问题**：Codex 全局安装会双写到两个位置：`~/.codex/skills/` + `$REPO_ROOT/.agents/skills/`。但全局卸载只清理了 `~/.codex/skills/`，遗漏了 `.agents/skills/`。

**修复方式**：移除 Codex 全局安装的双写逻辑（commit `a572ac1`）。全局安装只写 `~/.codex/skills/`，与 Claude 和 CodeBuddy 行为一致。不装到 `.agents/skills/`，自然也不需要卸载。用户需要项目本地安装时通过 `--project` 显式指定。

---

### 问题 8：Claude host sidecar 文件路径未替换 ✅ 已修复

**根因**：`gen-skill-docs.ts` 中三个 host 的路径替换逻辑分散在三处各写各的，Claude 的后处理过度保守地只替换 `~/` 前缀路径，遗漏了裸路径 `.claude/skills/review/`。

**修复方式**：提取公共函数 `replaceClaudePaths()`，三个 host 统一调用。该函数按从具体到通用的顺序替换模板中硬编码的 Claude 格式路径。对于 probe chain 安全问题，通过精确匹配（`.claude/skills/review` 而非 catch-all `.claude/skills`）和 host 条件判断来保护。同时删除了 CodeBuddy 块中 6 行匹配不到任何内容的死代码。修复后 Claude dist/ 中 9 处错误路径全部消除。

---

### 问题 9：qa/ 辅助文件路径替换仅 CodeBuddy 有 ✅ 已修复

**根因**：`gen-skill-docs.ts` 中 `qa/templates/` 和 `qa/references/` 的路径替换只放在 `if (host === 'codebuddy')` 块中，Claude 和 Codex 缺少此替换。

**修复方式**：将 qa/ 路径替换从 codebuddy 块移到所有 host 共享的公共位置（`replaceClaudePaths()` 之后）。修复后三个 host 的 qa/qa-only SKILL.md 中所有 `qa/templates/` 和 `qa/references/` 均替换为 `$_GSTACK_ROOT/qa/templates/` 和 `$_GSTACK_ROOT/qa/references/`。

---

### 问题 10：setup 脚本 PROJECT_DIR 解析代码重复 ✅ 已修复

**原始问题**：三个 host 安装分支（Claude/Codex/CodeBuddy）各自包含完全相同的 PROJECT_DIR 解析代码（共 ~30 行重复）。

**修复方式**：提取公共函数 `resolve_project_root()`，三个分支中的重复代码替换为函数调用：

```bash
resolve_project_root() {
  if [ -n "$PROJECT_DIR" ]; then
    PROJECT_ROOT="$PROJECT_DIR"
  else
    PROJECT_ROOT="$(pwd)"
  fi
  PROJECT_ROOT="$(cd "$PROJECT_ROOT" 2>/dev/null && pwd)" || {
    echo "Error: project directory does not exist: $PROJECT_DIR" >&2
    exit 1
  }
}
```

---

### 问题 11：document-release 裸相对路径 `review/TODOS-format.md` ✅ 已修复

**根因**：模板 `skill-templates/document-release/SKILL.md.tmpl` 中使用裸路径 `review/TODOS-format.md`，缺少 `.claude/skills/` 前缀，不匹配任何后处理替换规则。

**修复方式**：在模板中将 `review/TODOS-format.md` 改为 `.claude/skills/review/TODOS-format.md`，让 `replaceClaudePaths()` 公共函数能正确匹配并替换为 `$_GSTACK_ROOT/review/TODOS-format.md`。修复后三个 host 的 document-release/ship/plan-eng-review/plan-ceo-review SKILL.md 中所有 TODOS-format 引用均使用 `$_GSTACK_ROOT` 前缀。

---

### 问题 12：setup 中 `~/.gstack` 冗余创建 ✅ 已修复

**原始问题**：`setup` 脚本中 `~/.gstack` 目录被创建了两次。第 181 行 `mkdir -p "$HOME/.gstack/projects"` 已确保 `~/.gstack` 和子目录存在，脚本末尾的第二次创建永远不会触发。

**修复方式**：删除脚本末尾冗余的 `if [ ! -d "$HOME/.gstack" ]; then mkdir -p "$HOME/.gstack"; fi` 代码块。

---

### 问题 13：Codex 双写 REPO_ROOT 推导不可靠 ✅ 已修复

**原始问题**：Codex 全局安装时双写到 `.agents/skills/` 的 REPO_ROOT 推导逻辑依赖目录命名约定（判断父目录是否叫 `skills`）。对于独立 clone 的仓库，`REPO_ROOT` 会回退为 `$GSTACK_DIR` 自身，导致双写写入无意义的位置。

**修复方式**：移除 Codex 全局安装的双写逻辑（commit `a572ac1`）。不再需要推导 REPO_ROOT，问题自然消除。

---

### 问题 14：`SKILLS_DIR` 残留死代码 ✅ 已修复

**原始问题**：`setup` 第 13 行定义了 `SKILLS_DIR="$(dirname "$GSTACK_DIR")"`，但移除 Codex 双写后，整个脚本不再有任何地方引用 `SKILLS_DIR`。

**修复方式**：删除该行。

---

### 问题 15：未知参数静默忽略 ✅ 已修复

**原始问题**：`setup` 第 36 行的 `*) shift ;;` 会静默忽略所有未知参数。拼错参数不报错，直接执行默认行为。

**修复方式**：将 `*) shift ;;` 改为 `*) echo "Unknown option: $1" >&2; exit 1 ;;`，未知参数立即报错退出。

---

## 关联影响

### 文档幽灵问题组（问题 2 + 5）✅ 已全部清理
- 远端 Supabase 同步功能已明确取消（TODOS.md 标注 CANCELLED）
- `gstack-telemetry-sync`、`gstack-community-dashboard`（幽灵脚本）和 `supabase/config.sh`（幽灵资源）的所有引用已从文档、测试、配置中彻底清理
- 涉及文件：`self-contained-install.md`、`test/self-contained.test.ts`、`tsconfig.json`

### 路径替换不一致组（问题 8 + 9 + 11）✅ 已全部修复
- 三个问题都源于同一根因：`gen-skill-docs.ts` 后处理中各 host 的路径替换规则不统一
- 问题 8：提取 `replaceClaudePaths()` 公共函数，统一三个 host 的 Claude 格式路径替换
- 问题 9：将 qa/ 辅助文件路径替换从 codebuddy 专属移到所有 host 共享位置
- 问题 11：模板中裸路径 `review/TODOS-format.md` 补上 `.claude/skills/` 前缀

### Codex 卸载完整性组（问题 7 + 13）✅ 已消除
- 问题 7 和 13 都因移除 Codex 全局安装双写而自然消除（commit `a572ac1`）
- 不再有双写，不再需要推导 REPO_ROOT，不再有卸载遗漏

### setup 代码质量组（问题 10 + 12 + 14 + 15）✅ 已全部修复
- 问题 10：提取 `resolve_project_root()` 消除三处 ~30 行重复代码
- 问题 12：删除脚本末尾冗余的 `~/.gstack` 目录创建
- 问题 14：删除移除双写后遗留的 `SKILLS_DIR` 死代码
- 问题 15：未知参数从静默忽略改为报错退出

### 文档准确性组（问题 3 + 4 + 6）✅ 已全部修复
- 问题 3：`remote-slug` 位置从 `browse/bin/` 更正为 `bin/`（影响 2.1 结构图、1.2 矩阵、6A 伪代码、6B.3 表格）
- 问题 4：6C.2 伪代码从过时的 `install_codebuddy_copy()` 更新为实际的 `install_copy(host, skills_dir)`
- 问题 6：2.1 结构图中两个 `browse/` 合并为单个条目

## 修复优先级建议

### 第一优先级（🔴 高 — 文档虚假声明）✅ 已全部修复
1. **问题 2**（幽灵脚本）+ **问题 5**（supabase 幽灵资源）— ✅ 已从文档、测试、配置中彻底清理

### 第二优先级（🟡 中 — 一致性 / 健壮性）✅ 已全部修复
2. **问题 15**（未知参数静默忽略）— ✅ 改为报错退出
3. **问题 10**（PROJECT_DIR 代码重复）— ✅ 提取 `resolve_project_root()` 公共函数
4. **问题 3**（remote-slug 位置）+ **问题 6**（browse 重复）— ✅ 文档结构图更正

### 第三优先级（🟢 低 — 低影响优化）✅ 已全部修复
5. **问题 4**（伪代码过时）— ✅ 同步为实际 `install_copy()` 实现
6. **问题 12**（~/.gstack 冗余创建）— ✅ 删除冗余代码
7. **问题 14**（SKILLS_DIR 残留死代码）— ✅ 删除未使用变量
