# gstack → CodeBuddy 重构文档

本目录存放 gstack 项目改造为 CodeBuddy Skill 体系过程中的所有方案文档、技术决策记录和进度追踪。

## 文档清单

| 文件 | 说明 |
|------|------|
| [migration-plan.md](./migration-plan.md) | 总体改造方案（架构设计、分阶段计划、文件变更清单） |
| [platform-comparison.md](./platform-comparison.md) | Claude Code / Codex / CodeBuddy 三平台配置体系全面对比 |
| [self-contained-install.md](./self-contained-install.md) | 自包含安装方案（dist/ 包含完整运行时资源） |
| [cross-block-env.md](./cross-block-env.md) | 跨 Bash Block 环境变量传递方案（CodeBuddy 独立 shell 问题） |
| [project-local-state.md](./project-local-state.md) | 项目级运行时状态目录方案（`~/.gstack/` → `<project>/.gstack/`） |
| [browse-separation.md](./browse-separation.md) | Browse 从 gstack 拆分为独立 Skill 的方案 |
| [install-inconsistencies.md](./install-inconsistencies.md) | 安装模式不一致问题追踪（15 个问题全部已修复） |
| [upstream-sync-rules.md](./upstream-sync-rules.md) | 上游同步通用规则（14 条迁移规则、永久排除清单、操作 Checklist、持续跟踪流程） |
| [upstream-sync-01-v0.14.3.md](./upstream-sync-01-v0.14.3.md) | v0.14.3 迁移分析（具体路线图、已知差异清单、同步日志） |

## 改造目标

将 gstack（原为 Claude Code 专用的 AI 工程工作流系统）适配为 CodeBuddy Skill 体系，使其 22 个技能可在 CodeBuddy IDE 中原生使用。

## 约定

- 所有方案文档在实施前需经过确认
- 技术决策需记录原因和备选方案
- 进度追踪随实施进展实时更新
