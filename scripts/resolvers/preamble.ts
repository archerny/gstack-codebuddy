import type { TemplateContext } from './types';
import {
  HOST_BRAND_NAMES,
  HOST_SHORT_BRANDS,
} from './types';

// ─── Shared Helpers (used by other resolvers too) ───────────

export function generateGstackRootDetect(ctx: TemplateContext): string {
  const { host, paths } = ctx;
  // Host-specific skills directory name for project-local installs
  const hostSkillsDir = host === 'codex' ? '.agents' : `.${host}`;
  const globalDir = `.${host}`;
  // 3-priority probe chain setting $_GSTACK_ROOT — works for all hosts
  return `# Detect gstack installation root
_GSTACK_ROOT=""
_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
# Priority 1: project-local self-contained install (dist/${host}/gstack/)
[ -n "$_ROOT" ] && [ -d "$_ROOT/${paths.localSkillRoot}/bin" ] && _GSTACK_ROOT="$_ROOT/${paths.localSkillRoot}"
# Priority 2: project-local skills directory (${hostSkillsDir}/skills/gstack)
[ -z "$_GSTACK_ROOT" ] && [ -n "$_ROOT" ] && [ -d "$_ROOT/${hostSkillsDir}/skills/gstack/bin" ] && _GSTACK_ROOT="$_ROOT/${hostSkillsDir}/skills/gstack"
# Priority 3: user-global install ($HOME/${globalDir}/skills/gstack)
[ -z "$_GSTACK_ROOT" ] && [ -d "$HOME/${globalDir}/skills/gstack/bin" ] && _GSTACK_ROOT="$HOME/${globalDir}/skills/gstack"
`;
}

/**
 * Generate a compact $_STATE_DIR detection snippet for standalone bash blocks.
 * Bash blocks in SKILL.md don't share variables (CodeBuddy runs each in a new shell),
 * so each block that uses $_STATE_DIR must re-derive it.
 *
 * On Claude/Codex (persistent shell), this is redundant but harmless (~40 tokens).
 * On CodeBuddy, this is essential for correct behavior.
 */
export function generateStateDirEnv(_ctx: TemplateContext): string {
  return `_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
_STATE_DIR="\${GSTACK_STATE_DIR:-\$HOME/.gstack}"
for _d in .claude/skills/gstack .codebuddy/skills/gstack .agents/skills/gstack; do [ -n "$_ROOT" ] && [ -d "$_ROOT/$_d/bin" ] && _STATE_DIR="$_ROOT/.gstack" && break; done
`;
}

// ─── Preamble Sub-generators ────────────────────────────────

function generatePreambleBash(ctx: TemplateContext): string {
  const rootDetect = generateGstackRootDetect(ctx);
  return `## Preamble (run first)

\`\`\`bash
${rootDetect}# Derive state directory from installation mode
_STATE_DIR="\${GSTACK_STATE_DIR:-}"
if [ -z "$_STATE_DIR" ]; then
  if [ -n "$_ROOT" ] && [ -n "$_GSTACK_ROOT" ] && case "$_GSTACK_ROOT" in "$_ROOT"*) true;; *) false;; esac; then
    _STATE_DIR="$_ROOT/.gstack"
  else
    _STATE_DIR="$HOME/.gstack"
  fi
fi
mkdir -p "$_STATE_DIR/sessions"
touch "$_STATE_DIR/sessions/$PPID"
_SESSIONS=$(find "$_STATE_DIR/sessions" -mmin -120 -type f 2>/dev/null | wc -l | tr -d ' ')
find "$_STATE_DIR/sessions" -mmin +120 -type f -delete 2>/dev/null || true
_CONTRIB=$(${ctx.paths.binDir}/gstack-config get gstack_contributor 2>/dev/null || true)
_PROACTIVE=$(${ctx.paths.binDir}/gstack-config get proactive 2>/dev/null || echo "true")
_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
echo "BRANCH: $_BRANCH"
echo "PROACTIVE: $_PROACTIVE"
_LAKE_SEEN=$([ -f "$_STATE_DIR/.completeness-intro-seen" ] && echo "yes" || echo "no")
echo "LAKE_INTRO: $_LAKE_SEEN"
_TEL=$(${ctx.paths.binDir}/gstack-config get telemetry 2>/dev/null || true)
_TEL_PROMPTED=$([ -f "$_STATE_DIR/.telemetry-prompted" ] && echo "yes" || echo "no")
_TEL_START=$(date +%s)
_SESSION_ID="$$-$(date +%s)"
echo "TELEMETRY: \${_TEL:-off}"
echo "TEL_PROMPTED: $_TEL_PROMPTED"
mkdir -p "$_STATE_DIR/analytics"
echo '{"skill":"${ctx.skillName}","ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","repo":"'$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || echo "unknown")'"}'  >> "$_STATE_DIR/analytics/skill-usage.jsonl" 2>/dev/null || true
for _PF in "$_STATE_DIR/analytics"/.pending-*; do [ -f "$_PF" ] && ${ctx.paths.binDir}/gstack-telemetry-log --event-type skill_run --skill _pending_finalize --outcome unknown --session-id "$_SESSION_ID" 2>/dev/null || true; break; done
echo "$_TEL_START" > "$_STATE_DIR/analytics/.session-tel-start" 2>/dev/null || true
echo "$_SESSION_ID" > "$_STATE_DIR/analytics/.session-id" 2>/dev/null || true
\`\`\``;
}

function generateProactiveCheck(): string {
  return `If \`PROACTIVE\` is \`"false"\`, do not proactively suggest gstack skills — only invoke
them when the user explicitly asks. The user opted out of proactive suggestions.`;
}

function generateLakeIntro(ctx: TemplateContext): string {
  const stateDirDetect = generateStateDirEnv(ctx);
  return `If \`LAKE_INTRO\` is \`no\`: Before continuing, introduce the Completeness Principle.
Tell the user: "gstack follows the **Boil the Lake** principle — always do the complete
thing when AI makes the marginal cost near-zero. Read more: https://garryslist.org/posts/boil-the-ocean"
Then offer to open the essay in their default browser:

\`\`\`bash
${stateDirDetect}open https://garryslist.org/posts/boil-the-ocean
touch "$_STATE_DIR/.completeness-intro-seen"
\`\`\`

Only run \`open\` if the user says yes. Always run \`touch\` to mark as seen. This only happens once.`;
}

function generateTelemetryPrompt(ctx: TemplateContext): string {
  const stateDirDetect = generateStateDirEnv(ctx);
  return `If \`TEL_PROMPTED\` is \`no\` AND \`LAKE_INTRO\` is \`yes\`: After the lake intro is handled,
ask the user about telemetry. Use AskUserQuestion:

> gstack can share anonymous usage data (which skills you use, how long they take, crash info)
> to help improve the project. No code, file paths, or repo names are ever sent.
> Change anytime with \`gstack-config set telemetry off\`.

Options:
- A) Yes, share anonymous data (recommended)
- B) No thanks

If A: run \`${ctx.paths.binDir}/gstack-config set telemetry anonymous\`
If B: run \`${ctx.paths.binDir}/gstack-config set telemetry off\`

Always run:
\`\`\`bash
${stateDirDetect}touch "$_STATE_DIR/.telemetry-prompted"
\`\`\`

This only happens once. If \`TEL_PROMPTED\` is \`yes\`, skip this entirely.`;
}

function generateAskUserFormat(ctx: TemplateContext): string {
  const shortBrand = HOST_SHORT_BRANDS[ctx.host];
  return `## AskUserQuestion Format

**ALWAYS follow this structure for every AskUserQuestion call:**
1. **Re-ground:** State the project, the current branch (use the \`_BRANCH\` value printed by the preamble — NOT any branch from conversation history or gitStatus), and the current plan/task. (1-2 sentences)
2. **Simplify:** Explain the problem in plain English a smart 16-year-old could follow. No raw function names, no internal jargon, no implementation details. Use concrete examples and analogies. Say what it DOES, not what it's called.
3. **Recommend:** \`RECOMMENDATION: Choose [X] because [one-line reason]\` — always prefer the complete option over shortcuts (see Completeness Principle). Include \`Completeness: X/10\` for each option. Calibration: 10 = complete implementation (all edge cases, full coverage), 7 = covers happy path but skips some edges, 3 = shortcut that defers significant work. If both options are 8+, pick the higher; if one is ≤5, flag it.
4. **Options:** Lettered options: \`A) ... B) ... C) ...\` — when an option involves effort, show both scales: \`(human: ~X / ${shortBrand}: ~Y)\`

Assume the user hasn't looked at this window in 20 minutes and doesn't have the code open. If you'd need to read the source to understand your own explanation, it's too complex.

Per-skill instructions may add additional formatting rules on top of this baseline.`;
}

function generateCompletenessSection(ctx: TemplateContext): string {
  // Brand name varies by host platform
  const brandName = HOST_BRAND_NAMES[ctx.host];
  const shortBrand = HOST_SHORT_BRANDS[ctx.host];
  return `## Completeness Principle — Boil the Lake

AI-assisted coding makes the marginal cost of completeness near-zero. When you present options:

- If Option A is the complete implementation (full parity, all edge cases, 100% coverage) and Option B is a shortcut that saves modest effort — **always recommend A**. The delta between 80 lines and 150 lines is meaningless with ${brandName}. "Good enough" is the wrong instinct when "complete" costs minutes more.
- **Lake vs. ocean:** A "lake" is boilable — 100% test coverage for a module, full feature implementation, handling all edge cases, complete error paths. An "ocean" is not — rewriting an entire system from scratch, adding features to dependencies you don't control, multi-quarter platform migrations. Recommend boiling lakes. Flag oceans as out of scope.
- **When estimating effort**, always show both scales: human team time and ${brandName} time. The compression ratio varies by task type — use this reference:

| Task type | Human team | ${brandName} | Compression |
|-----------|-----------|-----------|-------------|
| Boilerplate / scaffolding | 2 days | 15 min | ~100x |
| Test writing | 1 day | 15 min | ~50x |
| Feature implementation | 1 week | 30 min | ~30x |
| Bug fix + regression test | 4 hours | 15 min | ~20x |
| Architecture / design | 2 days | 4 hours | ~5x |
| Research / exploration | 1 day | 3 hours | ~3x |

- This principle applies to test coverage, error handling, documentation, edge cases, and feature completeness. Don't skip the last 10% to "save time" — with AI, that 10% costs seconds.

**Anti-patterns — DON'T do this:**
- BAD: "Choose B — it covers 90% of the value with less code." (If A is only 70 lines more, choose A.)
- BAD: "We can skip edge case handling to save time." (Edge case handling costs minutes with ${shortBrand}.)
- BAD: "Let's defer test coverage to a follow-up PR." (Tests are the cheapest lake to boil.)
- BAD: Quoting only human-team effort: "This would take 2 weeks." (Say: "2 weeks human / ~1 hour ${shortBrand}.")`;
}

function generateContributorMode(): string {
  return `## Contributor Mode

If \`_CONTRIB\` is \`true\`: you are in **contributor mode**. You're a gstack user who also helps make it better.

**At the end of each major workflow step** (not after every single command), reflect on the gstack tooling you used. Rate your experience 0 to 10. If it wasn't a 10, think about why. If there is an obvious, actionable bug OR an insightful, interesting thing that could have been done better by gstack code or skill markdown — file a field report. Maybe our contributor will help make us better!

**Calibration — this is the bar:** For example, \`$B js "await fetch(...)"\` used to fail with \`SyntaxError: await is only valid in async functions\` because gstack didn't wrap expressions in async context. Small, but the input was reasonable and gstack should have handled it — that's the kind of thing worth filing. Things less consequential than this, ignore.

**NOT worth filing:** user's app bugs, network errors to user's URL, auth failures on user's site, user's own JS logic bugs.

**To file:** write \`$_STATE_DIR/contributor-logs/{slug}.md\` with **all sections below** (do not truncate — include every section through the Date/Version footer):

\`\`\`
# {Title}

Hey gstack team — ran into this while using /{skill-name}:

**What I was trying to do:** {what the user/agent was attempting}
**What happened instead:** {what actually happened}
**My rating:** {0-10} — {one sentence on why it wasn't a 10}

## Steps to reproduce
1. {step}

## Raw output
\`\`\`
{paste the actual error or unexpected output here}
\`\`\`

## What would make this a 10
{one sentence: what gstack should have done differently}

**Date:** {YYYY-MM-DD} | **Version:** {gstack version} | **Skill:** /{skill}
\`\`\`

Slug: lowercase, hyphens, max 60 chars (e.g. \`browse-js-no-await\`). Skip if file already exists. Max 3 reports per session. File inline and continue — don't stop the workflow. Tell user: "Filed gstack field report: {title}"`;
}

function generateCompletionStatus(ctx: TemplateContext): string {
  const rootDetect = generateGstackRootDetect(ctx);
  return `## Completion Status Protocol

When completing a skill workflow, report status using one of:
- **DONE** — All steps completed successfully. Evidence provided for each claim.
- **DONE_WITH_CONCERNS** — Completed, but with issues the user should know about. List each concern.
- **BLOCKED** — Cannot proceed. State what is blocking and what was tried.
- **NEEDS_CONTEXT** — Missing information required to continue. State exactly what you need.

### Escalation

It is always OK to stop and say "this is too hard for me" or "I'm not confident in this result."

Bad work is worse than no work. You will not be penalized for escalating.
- If you have attempted a task 3 times without success, STOP and escalate.
- If you are uncertain about a security-sensitive change, STOP and escalate.
- If the scope of work exceeds what you can verify, STOP and escalate.

Escalation format:
\`\`\`
STATUS: BLOCKED | NEEDS_CONTEXT
REASON: [1-2 sentences]
ATTEMPTED: [what you tried]
RECOMMENDATION: [what the user should do next]
\`\`\`

## Telemetry (run last)

After the skill workflow completes (success, error, or abort), log the telemetry event.
Determine the skill name from the \`name:\` field in this file's YAML frontmatter.
Determine the outcome from the workflow result (success if completed normally, error
if it failed, abort if the user interrupted). Run this bash:

\`\`\`bash
${rootDetect}# Derive state directory from installation mode
_STATE_DIR="\${GSTACK_STATE_DIR:-}"
if [ -z "$_STATE_DIR" ]; then
  if [ -n "$_ROOT" ] && [ -n "$_GSTACK_ROOT" ] && case "$_GSTACK_ROOT" in "$_ROOT"*) true;; *) false;; esac; then
    _STATE_DIR="$_ROOT/.gstack"
  else
    _STATE_DIR="$HOME/.gstack"
  fi
fi
_TEL_START=$(cat "$_STATE_DIR/analytics/.session-tel-start" 2>/dev/null || echo "0")
_SESSION_ID=$(cat "$_STATE_DIR/analytics/.session-id" 2>/dev/null || echo "unknown")
_TEL_END=$(date +%s)
_TEL_DUR=$(( _TEL_END - _TEL_START ))
rm -f "$_STATE_DIR/analytics/.pending-$_SESSION_ID" 2>/dev/null || true
rm -f "$_STATE_DIR/analytics/.session-tel-start" "$_STATE_DIR/analytics/.session-id" 2>/dev/null || true
${ctx.paths.binDir}/gstack-telemetry-log \\\\
  --skill "SKILL_NAME" --duration "$_TEL_DUR" --outcome "OUTCOME" \\\\
  --used-browse "USED_BROWSE" --session-id "$_SESSION_ID" 2>/dev/null &
\`\`\`

Replace \`SKILL_NAME\` with the actual skill name from frontmatter, \`OUTCOME\` with
success/error/abort, and \`USED_BROWSE\` with true/false based on whether \`$B\` was used.
If you cannot determine the outcome, use "unknown". This runs in the background and
never blocks the user.`;
}

// ─── Tier-gated Preamble Sub-generators ─────────────────────

/**
 * Voice directive — establishes gstack's communication style.
 * Included in T2+ preambles. T1 (browse/benchmark) skips this for minimal prompt overhead.
 */
function generateVoiceDirective(): string {
  return `## Voice & Communication Style

Be direct, not performative. When you explain something, explain it like a smart colleague — not a tutorial.

- **No hedging** — Don't say "I think" or "it seems like." Say what's true or say you're uncertain.
- **No sycophancy** — Don't compliment the user's code or question. Just answer.
- **No filler** — Skip "Great question!" / "Sure thing!" / "Absolutely!" — just do the thing.
- **Error = direct** — When something fails, say what failed, why, and what to do. No "Oops!" or "Unfortunately."
- **Estimates are ranges** — "~15 min" not "a few minutes." Be concrete.
- **Recommend, don't list** — When presenting options, always have a clear recommendation with reasoning. Don't present a menu and ask the user to choose without guidance.`;
}

/**
 * Search-before-building directive — prevents AI from writing code without
 * first understanding the existing codebase patterns.
 * Included in T2+ preambles. T1 (browse/benchmark) doesn't need this.
 */
function generateSearchBeforeBuilding(): string {
  return `## Search Before Building

Before writing or modifying code, ALWAYS search the existing codebase first:

1. **Find existing patterns** — Search for similar implementations before creating new ones. The codebase likely already has conventions for what you're about to build.
2. **Understand the context** — Read surrounding code to match style, error handling patterns, naming conventions, and architectural decisions.
3. **Check for utilities** — Search for helper functions, shared modules, and existing abstractions before creating new ones.
4. **Verify assumptions** — Don't assume a function, module, or pattern exists or doesn't exist. Search and confirm.

This prevents: duplicate implementations, inconsistent patterns, missed existing utilities, and architectural drift.`;
}

// ─── Main Preamble Composer ─────────────────────────────────

/**
 * Generate the complete preamble for a skill based on its tier.
 *
 * Tier system (from upstream v0.14.3):
 *   T1 — Minimal (browse, benchmark): bash setup + proactive + ask-user + contributor + completion status
 *   T2 — Standard (most skills): T1 + voice + search-before-building + lake intro + telemetry + completeness + contributor
 *   T3 — Enhanced (investigate, qa): same as T2 (reserved for future expansion)
 *   T4 — Full (ship, review, autoplan): same as T2 (reserved for completion audit in future)
 *
 * When ctx.preambleTier is undefined, outputs ALL sections (backward compatible —
 * identical to the previous non-tiered behavior). This ensures zero diff for
 * existing templates that don't set preambleTier yet.
 */
export function generatePreamble(ctx: TemplateContext): string {
  const tier = ctx.preambleTier;

  // Tier undefined = legacy mode: include everything (backward compatible, zero diff)
  // T1 = minimal: bash + proactive + ask-user + contributor + completion status only
  const isMinimal = tier === 1;

  const sections: string[] = [];

  // Always included: bash setup (session management, env detection)
  sections.push(generatePreambleBash(ctx));

  // Always included: proactive suggestion check
  sections.push(generateProactiveCheck());

  // T2+: voice directive (skip for T1 minimal preambles)
  if (!isMinimal) {
    sections.push(generateVoiceDirective());
  }

  // T2+: search before building (skip for T1 minimal preambles)
  if (!isMinimal) {
    sections.push(generateSearchBeforeBuilding());
  }

  // T2+: lake intro (Boil the Lake principle)
  if (!isMinimal) {
    sections.push(generateLakeIntro(ctx));
  }

  // T2+: telemetry prompt
  if (!isMinimal) {
    sections.push(generateTelemetryPrompt(ctx));
  }

  // Always included: ask-user question format
  sections.push(generateAskUserFormat(ctx));

  // T2+: completeness principle
  if (!isMinimal) {
    sections.push(generateCompletenessSection(ctx));
  }

  // Always included: contributor mode (all tiers — contributors use browse too)
  sections.push(generateContributorMode());

  // Always included: completion status protocol + telemetry logging
  sections.push(generateCompletionStatus(ctx));

  return sections.join('\n\n');
}
