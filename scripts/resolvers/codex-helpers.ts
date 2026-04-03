import type { TemplateContext } from './types';
import { HOST_PLATFORM_NAMES } from './types';
import { codexErrorHandling } from './constants';

/**
 * Codex integration helpers — shared building blocks for Codex-related resolvers.
 *
 * These functions are used by:
 * - ADVERSARIAL_STEP (review.ts, Phase 1.5)
 * - CODEX_SECOND_OPINION (review.ts, Phase 1.5)
 * - CODEX_PLAN_REVIEW (review.ts, Phase 1.5)
 * - codex skill template (already exists, may reference these)
 *
 * codexErrorHandling() lives in constants.ts (shared with design resolvers).
 */

// ─── Codex Binary Detection ────────────────────────────────

/**
 * Generate bash snippet to detect the Codex CLI binary.
 * Returns a self-contained block that sets CODEX_BIN or prints NOT_FOUND.
 */
export function codexBinaryDetect(): string {
  return `\`\`\`bash
CODEX_BIN=$(which codex 2>/dev/null || echo "")
[ -z "$CODEX_BIN" ] && echo "CODEX_NOT_FOUND" || echo "CODEX_FOUND: $CODEX_BIN"
\`\`\`

If \`CODEX_NOT_FOUND\`: skip Codex integration silently. Do not ask the user to install it — Codex is optional.`;
}

// ─── Codex Review Runner ───────────────────────────────────

/**
 * Generate the Codex code review invocation block.
 * Used by CODEX_SECOND_OPINION and the /codex skill.
 */
export function codexReviewBlock(): string {
  return `Run Codex code review against the current branch diff (5-minute timeout):

\`\`\`bash
codex review --base <base> -c 'model_reasoning_effort="high"' --enable web_search_cached 2>/dev/null
\`\`\`

Parse the output:
- If output contains \`[P1]\` markers → **GATE: FAIL** (critical findings)
- If no \`[P1]\` markers (only \`[P2]\` or clean) → **GATE: PASS**

Present the full output verbatim:
\`\`\`
CODEX SAYS (code review):
════════════════════════════════════════════════════════════
<full codex output — do not truncate or summarize>
════════════════════════════════════════════════════════════
GATE: PASS/FAIL
\`\`\``;
}

// ─── Codex Adversarial Runner ──────────────────────────────

/**
 * Generate the Codex adversarial challenge invocation block.
 * Used by ADVERSARIAL_STEP and the /codex skill.
 */
export function codexAdversarialBlock(): string {
  return `Run Codex in adversarial mode — try to find ways the code will fail in production (5-minute timeout):

\`\`\`bash
codex exec "Review the changes on this branch against the base branch. Run git diff origin/<base> to see the diff. Your job is to find ways this code will fail in production. Think like an attacker and a chaos engineer. Find edge cases, race conditions, security holes, resource leaks, failure modes, and silent data corruption paths. Be adversarial. Be thorough. No compliments — just the problems." -s read-only -c 'model_reasoning_effort="xhigh"' --enable web_search_cached 2>/dev/null
\`\`\`

Present the full output verbatim:
\`\`\`
CODEX SAYS (adversarial challenge):
════════════════════════════════════════════════════════════
<full codex output — do not truncate or summarize>
════════════════════════════════════════════════════════════
\`\`\``;
}

// ─── Cross-Model Analysis ──────────────────────────────────

/**
 * Generate the cross-model comparison template.
 * Used when both Claude and Codex have reviewed the same diff.
 */
export function crossModelAnalysis(ctx: TemplateContext): string {
  const platformName = HOST_PLATFORM_NAMES[ctx.host];
  return `**Cross-model comparison:** After presenting Codex's output, compare with your own review findings:

\`\`\`
CROSS-MODEL ANALYSIS:
  Both found: [findings that overlap between ${platformName} and Codex]
  Only Codex found: [findings unique to Codex]
  Only ${platformName} found: [findings unique to ${platformName}'s review]
  Agreement rate: X% (N/M total unique findings overlap)
\`\`\`

Points of disagreement are the most valuable — they highlight blind spots in each model's analysis.`;
}

// ─── Codex Plan Review ─────────────────────────────────────

/**
 * Generate the Codex plan review invocation block.
 * Used by CODEX_PLAN_REVIEW in plan-eng-review.
 */
export function codexPlanReviewBlock(): string {
  return `Run Codex plan review — tell Codex to read the plan file itself (avoids ARG_MAX limits for large plans):

\`\`\`bash
codex exec "You are a brutally honest technical reviewer. Read the plan file at <plan-file-path> and review it for: logical gaps and unstated assumptions, missing error handling or edge cases, overcomplexity (is there a simpler approach?), feasibility risks (what could go wrong?), and missing dependencies or sequencing issues. Be direct. Be terse. No compliments. Just the problems." -s read-only -c 'model_reasoning_effort="high"' --enable web_search_cached 2>/dev/null
\`\`\`

Replace \`<plan-file-path>\` with the actual path to the plan file detected earlier. Codex has filesystem access in read-only mode and will read the file itself.

Present the full output under a \`CODEX SAYS (plan review):\` header. Note any concerns that should inform the subsequent engineering review sections.`;
}

// ─── Review Log Persistence ────────────────────────────────

/**
 * Generate bash snippet to persist a Codex review result to the review log.
 * Only used after a code review (not adversarial — adversarial has no gate verdict).
 */
export function codexReviewPersist(ctx: TemplateContext): string {
  return `Persist the Codex review result to the review log:

\`\`\`bash
${ctx.paths.binDir}/gstack-review-log '{"skill":"codex-review","timestamp":"TIMESTAMP","status":"STATUS","gate":"GATE","findings":N}'
\`\`\`

Substitute: TIMESTAMP (ISO 8601), STATUS ("clean" if PASS, "issues_found" if FAIL), GATE ("pass" or "fail"), findings (count of [P1] + [P2] markers).

**Do NOT persist a codex-review entry when only the adversarial challenge ran** — there is no gate verdict to record, and a false entry would make the Review Readiness Dashboard believe a code review happened when it didn't.`;
}

// ─── Composite: Full Codex Error Handling (re-export) ──────

export { codexErrorHandling };
