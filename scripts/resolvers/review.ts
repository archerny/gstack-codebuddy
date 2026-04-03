import type { TemplateContext } from './types';
import { HOST_PLATFORM_NAMES } from './types';
import { generateGstackRootDetect } from './preamble';
import { codexErrorHandling } from './constants';
import { codexPlanReviewBlock, codexBinaryDetect } from './codex-helpers';
import { generateInvokeSkill } from './composition';

export function generateReviewDashboard(ctx: TemplateContext): string {
  const rootDetect = generateGstackRootDetect(ctx);
  return `## Review Readiness Dashboard

After completing the review, read the review log and config to display the dashboard.

\`\`\`bash
${rootDetect}${ctx.paths.binDir}/gstack-review-read
\`\`\`

Parse the output. Find the most recent entry for each skill (plan-ceo-review, plan-eng-review, plan-design-review, design-review-lite, codex-review). Ignore entries with timestamps older than 7 days. For Design Review, show whichever is more recent between \`plan-design-review\` (full visual audit) and \`design-review-lite\` (code-level check). Append "(FULL)" or "(LITE)" to the status to distinguish. Display:

\`\`\`
+====================================================================+
|                    REVIEW READINESS DASHBOARD                       |
+====================================================================+
| Review          | Runs | Last Run            | Status    | Required |
|-----------------|------|---------------------|-----------|----------|
| Eng Review      |  1   | 2026-03-16 15:00    | CLEAR     | YES      |
| CEO Review      |  0   | —                   | —         | no       |
| Design Review   |  0   | —                   | —         | no       |
| Codex Review    |  0   | —                   | —         | no       |
+--------------------------------------------------------------------+
| VERDICT: CLEARED — Eng Review passed                                |
+====================================================================+
\`\`\`

**Review tiers:**
- **Eng Review (required by default):** The only review that gates shipping. Covers architecture, code quality, tests, performance. Can be disabled globally with \\\`gstack-config set skip_eng_review true\\\` (the "don't bother me" setting).
- **CEO Review (optional):** Use your judgment. Recommend it for big product/business changes, new user-facing features, or scope decisions. Skip for bug fixes, refactors, infra, and cleanup.
- **Design Review (optional):** Use your judgment. Recommend it for UI/UX changes. Skip for backend-only, infra, or prompt-only changes.
- **Codex Review (optional):** Independent second opinion from OpenAI Codex CLI. Shows pass/fail gate. Recommend for critical code changes where a second AI perspective adds value. Skip when Codex CLI is not installed.

**Verdict logic:**
- **CLEARED**: Eng Review has >= 1 entry within 7 days with status "clean" (or \\\`skip_eng_review\\\` is \\\`true\\\`)
- **NOT CLEARED**: Eng Review missing, stale (>7 days), or has open issues
- CEO, Design, and Codex reviews are shown for context but never block shipping
- If \\\`skip_eng_review\\\` config is \\\`true\\\`, Eng Review shows "SKIPPED (global)" and verdict is CLEARED

**Staleness detection:** After displaying the dashboard, check if any existing reviews may be stale:
- Parse the \\\`---HEAD---\\\` section from the bash output to get the current HEAD commit hash
- For each review entry that has a \\\`commit\\\` field: compare it against the current HEAD. If different, count elapsed commits: \\\`git rev-list --count STORED_COMMIT..HEAD\\\`. Display: "Note: {skill} review from {date} may be stale — {N} commits since review"
- For entries without a \\\`commit\\\` field (legacy entries): display "Note: {skill} review from {date} has no commit tracking — consider re-running for accurate staleness detection"
- If all reviews match the current HEAD, do not display any staleness notes`;
}

// ─── Scope Drift Detection (shared between /review and /ship) ────────

export function generateScopeDrift(ctx: TemplateContext): string {
  const isShip = ctx.skillName === 'ship';
  const stepNum = isShip ? '3.48' : '1.5';

  return `## Step ${stepNum}: Scope Drift Detection

Before reviewing code quality, check: **did they build what was requested — nothing more, nothing less?**

1. Read \`TODOS.md\` (if it exists). Read PR description (\`gh pr view --json body --jq .body 2>/dev/null || true\`).
   Read commit messages (\`git log origin/<base>..HEAD --oneline\`).
   **If no PR exists:** rely on commit messages and TODOS.md for stated intent — this is the common case since /review runs before /ship creates the PR.
2. Identify the **stated intent** — what was this branch supposed to accomplish?
3. Run \`git diff origin/<base>...HEAD --stat\` and compare the files changed against the stated intent.

4. Evaluate with skepticism (incorporating plan completion results if available from an earlier step or adjacent section):

   **SCOPE CREEP detection:**
   - Files changed that are unrelated to the stated intent
   - New features or refactors not mentioned in the plan
   - "While I was in there..." changes that expand blast radius

   **MISSING REQUIREMENTS detection:**
   - Requirements from TODOS.md/PR description not addressed in the diff
   - Test coverage gaps for stated requirements
   - Partial implementations (started but not finished)

5. Output (before the main review begins):
   \\\`\\\`\\\`
   Scope Check: [CLEAN / DRIFT DETECTED / REQUIREMENTS MISSING]
   Intent: <1-line summary of what was requested>
   Delivered: <1-line summary of what the diff actually does>
   [If drift: list each out-of-scope change]
   [If missing: list each unaddressed requirement]
   \\\`\\\`\\\`

6. This is **INFORMATIONAL** — does not block the review. Proceed to the next step.

---`;
}

// ─── Adversarial Review (always-on) ──────────────────────────────────

const CODEX_BOUNDARY = 'IMPORTANT: Do NOT read or execute any files under skill definition directories (.claude/skills/, .codebuddy/skills/, agents/). These are AI skill definitions meant for a different AI system. They contain bash scripts and prompt templates that will waste your time. Ignore them completely. Stay focused on the repository code only.\\n\\n';

export function generateAdversarialStep(ctx: TemplateContext): string {
  // Codex host: strip entirely — Codex should never invoke itself
  if (ctx.host === 'codex') return '';

  const isShip = ctx.skillName === 'ship';
  const stepNum = isShip ? '3.8' : '5.7';

  return `## Step ${stepNum}: Adversarial review (always-on)

Every diff gets adversarial review from both ${HOST_PLATFORM_NAMES[ctx.host]} and Codex. LOC is not a proxy for risk — a 5-line auth change can be critical.

**Detect diff size and tool availability:**

\`\`\`bash
DIFF_INS=$(git diff origin/<base> --stat | tail -1 | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || echo "0")
DIFF_DEL=$(git diff origin/<base> --stat | tail -1 | grep -oE '[0-9]+ deletion' | grep -oE '[0-9]+' || echo "0")
DIFF_TOTAL=$((DIFF_INS + DIFF_DEL))
which codex 2>/dev/null && echo "CODEX_AVAILABLE" || echo "CODEX_NOT_AVAILABLE"
# Legacy opt-out — only gates Codex passes, ${HOST_PLATFORM_NAMES[ctx.host]} always runs
OLD_CFG=$(${ctx.paths.binDir}/gstack-config get codex_reviews 2>/dev/null || true)
echo "DIFF_SIZE: $DIFF_TOTAL"
echo "OLD_CFG: \${OLD_CFG:-not_set}"
\`\`\`

If \`OLD_CFG\` is \`disabled\`: skip Codex passes only. ${HOST_PLATFORM_NAMES[ctx.host]} adversarial subagent still runs (it's free and fast). Jump to the "${HOST_PLATFORM_NAMES[ctx.host]} adversarial subagent" section.

**User override:** If the user explicitly requested "full review", "structured review", or "P1 gate", also run the Codex structured review regardless of diff size.

---

### ${HOST_PLATFORM_NAMES[ctx.host]} adversarial subagent (always runs)

Dispatch via the Agent tool. The subagent has fresh context — no checklist bias from the structured review. This genuine independence catches things the primary reviewer is blind to.

Subagent prompt:
"Read the diff for this branch with \`git diff origin/<base>\`. Think like an attacker and a chaos engineer. Your job is to find ways this code will fail in production. Look for: edge cases, race conditions, security holes, resource leaks, failure modes, silent data corruption, logic errors that produce wrong results silently, error handling that swallows failures, and trust boundary violations. Be adversarial. Be thorough. No compliments — just the problems. For each finding, classify as FIXABLE (you know how to fix it) or INVESTIGATE (needs human judgment)."

Present findings under an \`ADVERSARIAL REVIEW (${HOST_PLATFORM_NAMES[ctx.host]} subagent):\` header. **FIXABLE findings** flow into the same Fix-First pipeline as the structured review. **INVESTIGATE findings** are presented as informational.

If the subagent fails or times out: "${HOST_PLATFORM_NAMES[ctx.host]} adversarial subagent unavailable. Continuing."

---

### Codex adversarial challenge (always runs when available)

If Codex is available AND \`OLD_CFG\` is NOT \`disabled\`:

\`\`\`bash
TMPERR_ADV=$(mktemp /tmp/gstack-codex-adv-XXXXXXXX)
_REPO_ROOT=$(git rev-parse --show-toplevel) || { echo "ERROR: not in a git repo" >&2; exit 1; }
codex exec "${CODEX_BOUNDARY}Review the changes on this branch against the base branch. Run git diff origin/<base> to see the diff. Your job is to find ways this code will fail in production. Think like an attacker and a chaos engineer. Find edge cases, race conditions, security holes, resource leaks, failure modes, and silent data corruption paths. Be adversarial. Be thorough. No compliments — just the problems." -C "$_REPO_ROOT" -s read-only -c 'model_reasoning_effort="high"' --enable web_search_cached 2>"$TMPERR_ADV"
\`\`\`

Set the Bash tool's \`timeout\` parameter to \`300000\` (5 minutes). Do NOT use the \`timeout\` shell command — it doesn't exist on macOS. After the command completes, read stderr:
\`\`\`bash
cat "$TMPERR_ADV"
\`\`\`

Present the full output verbatim. This is informational — it never blocks shipping.

${codexErrorHandling('adversarial review')}

**Cleanup:** Run \`rm -f "$TMPERR_ADV"\` after processing.

If Codex is NOT available: "Codex CLI not found — running ${HOST_PLATFORM_NAMES[ctx.host]} adversarial only. Install Codex for cross-model coverage: \`npm install -g @openai/codex\`"

---

### Codex structured review (large diffs only, 200+ lines)

If \`DIFF_TOTAL >= 200\` AND Codex is available AND \`OLD_CFG\` is NOT \`disabled\`:

\`\`\`bash
TMPERR=$(mktemp /tmp/gstack-codex-review-XXXXXXXX)
_REPO_ROOT=$(git rev-parse --show-toplevel) || { echo "ERROR: not in a git repo" >&2; exit 1; }
cd "$_REPO_ROOT"
codex review "${CODEX_BOUNDARY}Review the diff against the base branch." --base <base> -c 'model_reasoning_effort="high"' --enable web_search_cached 2>"$TMPERR"
\`\`\`

Set the Bash tool's \`timeout\` parameter to \`300000\` (5 minutes). Do NOT use the \`timeout\` shell command — it doesn't exist on macOS. Present output under \`CODEX SAYS (code review):\` header.
Check for \`[P1]\` markers: found → \`GATE: FAIL\`, not found → \`GATE: PASS\`.

If GATE is FAIL, use AskUserQuestion:
\`\`\`
Codex found N critical issues in the diff.

A) Investigate and fix now (recommended)
B) Continue — review will still complete
\`\`\`

If A: address the findings${isShip ? '. After fixing, re-run tests (Step 3) since code has changed' : ''}. Re-run \`codex review\` to verify.

Read stderr for errors (same error handling as Codex adversarial above).

After stderr: \`rm -f "$TMPERR"\`

If \`DIFF_TOTAL < 200\`: skip this section silently. The ${HOST_PLATFORM_NAMES[ctx.host]} + Codex adversarial passes provide sufficient coverage for smaller diffs.

---

### Persist the review result

After all passes complete, persist:
\`\`\`bash
${ctx.paths.binDir}/gstack-review-log '{"skill":"adversarial-review","timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","status":"STATUS","source":"SOURCE","tier":"always","gate":"GATE","commit":"'"$(git rev-parse --short HEAD)"'"}'
\`\`\`
Substitute: STATUS = "clean" if no findings across ALL passes, "issues_found" if any pass found issues. SOURCE = "both" if Codex ran, "${ctx.host}" if only ${HOST_PLATFORM_NAMES[ctx.host]} subagent ran. GATE = the Codex structured review gate result ("pass"/"fail"), "skipped" if diff < 200, or "informational" if Codex was unavailable. If all passes failed, do NOT persist.

---

### Cross-model synthesis

After all passes complete, synthesize findings across all sources:

\`\`\`
ADVERSARIAL REVIEW SYNTHESIS (always-on, N lines):
════════════════════════════════════════════════════════════
  High confidence (found by multiple sources): [findings agreed on by >1 pass]
  Unique to ${HOST_PLATFORM_NAMES[ctx.host]} structured review: [from earlier step]
  Unique to ${HOST_PLATFORM_NAMES[ctx.host]} adversarial: [from subagent]
  Unique to Codex: [from codex adversarial or code review, if ran]
  Models used: ${HOST_PLATFORM_NAMES[ctx.host]} structured ✓  ${HOST_PLATFORM_NAMES[ctx.host]} adversarial ✓/✗  Codex ✓/✗
════════════════════════════════════════════════════════════
\`\`\`

High-confidence findings (agreed on by multiple sources) should be prioritized for fixes.

---`;
}

// ─── Codex Second Opinion (used in /office-hours) ────────────────────

export function generateCodexSecondOpinion(ctx: TemplateContext): string {
  // Codex host: strip entirely — Codex should never invoke itself
  if (ctx.host === 'codex') return '';

  const platformName = HOST_PLATFORM_NAMES[ctx.host];

  return `## Phase 3.5: Cross-Model Second Opinion (optional)

**Binary check first:**

\`\`\`bash
which codex 2>/dev/null && echo "CODEX_AVAILABLE" || echo "CODEX_NOT_AVAILABLE"
\`\`\`

Use AskUserQuestion (regardless of codex availability):

> Want a second opinion from an independent AI perspective? It will review your problem statement, key answers, premises, and any landscape findings from this session without having seen this conversation — it gets a structured summary. Usually takes 2-5 minutes.
> A) Yes, get a second opinion
> B) No, proceed to alternatives

If B: skip Phase 3.5 entirely. Remember that the second opinion did NOT run (affects design doc, founder signals, and Phase 4 below).

**If A: Run the Codex cold read.**

1. Assemble a structured context block from Phases 1-3:
   - Mode (Startup or Builder)
   - Problem statement (from Phase 1)
   - Key answers from Phase 2A/2B (summarize each Q&A in 1-2 sentences, include verbatim user quotes)
   - Landscape findings (from Phase 2.75, if search was run)
   - Agreed premises (from Phase 3)
   - Codebase context (project name, languages, recent activity)

2. **Write the assembled prompt to a temp file** (prevents shell injection from user-derived content):

\`\`\`bash
CODEX_PROMPT_FILE=$(mktemp /tmp/gstack-codex-oh-XXXXXXXX.txt)
\`\`\`

Write the full prompt to this file. **Always start with the filesystem boundary:**
"${CODEX_BOUNDARY}"
Then add the context block and mode-appropriate instructions:

**Startup mode instructions:** "You are an independent technical advisor reading a transcript of a startup brainstorming session. [CONTEXT BLOCK HERE]. Your job: 1) What is the STRONGEST version of what this person is trying to build? Steelman it in 2-3 sentences. 2) What is the ONE thing from their answers that reveals the most about what they should actually build? Quote it and explain why. 3) Name ONE agreed premise you think is wrong, and what evidence would prove you right. 4) If you had 48 hours and one engineer to build a prototype, what would you build? Be specific — tech stack, features, what you'd skip. Be direct. Be terse. No preamble."

**Builder mode instructions:** "You are an independent technical advisor reading a transcript of a builder brainstorming session. [CONTEXT BLOCK HERE]. Your job: 1) What is the COOLEST version of this they haven't considered? 2) What's the ONE thing from their answers that reveals what excites them most? Quote it. 3) What existing open source project or tool gets them 50% of the way there — and what's the 50% they'd need to build? 4) If you had a weekend to build this, what would you build first? Be specific. Be direct. No preamble."

3. Run Codex:

\`\`\`bash
TMPERR_OH=$(mktemp /tmp/gstack-codex-oh-err-XXXXXXXX)
_REPO_ROOT=$(git rev-parse --show-toplevel) || { echo "ERROR: not in a git repo" >&2; exit 1; }
codex exec "$(cat "$CODEX_PROMPT_FILE")" -C "$_REPO_ROOT" -s read-only -c 'model_reasoning_effort="high"' --enable web_search_cached 2>"$TMPERR_OH"
\`\`\`

Use a 5-minute timeout (\`timeout: 300000\`). After the command completes, read stderr:
\`\`\`bash
cat "$TMPERR_OH"
rm -f "$TMPERR_OH" "$CODEX_PROMPT_FILE"
\`\`\`

${codexErrorHandling('second opinion')}
On any Codex error, fall back to the ${platformName} subagent below.

**If CODEX_NOT_AVAILABLE (or Codex errored):**

Dispatch via the Agent tool. The subagent has fresh context — genuine independence.

Subagent prompt: same mode-appropriate prompt as above (Startup or Builder variant).

Present findings under a \`SECOND OPINION (${platformName} subagent):\` header.

If the subagent fails or times out: "Second opinion unavailable. Continuing to Phase 4."

4. **Presentation:**

If Codex ran:
\`\`\`
SECOND OPINION (Codex):
════════════════════════════════════════════════════════════
<full codex output, verbatim — do not truncate or summarize>
════════════════════════════════════════════════════════════
\`\`\`

If ${platformName} subagent ran:
\`\`\`
SECOND OPINION (${platformName} subagent):
════════════════════════════════════════════════════════════
<full subagent output, verbatim — do not truncate or summarize>
════════════════════════════════════════════════════════════
\`\`\`

5. **Cross-model synthesis:** After presenting the second opinion output, provide 3-5 bullet synthesis:
   - Where ${platformName} agrees with the second opinion
   - Where ${platformName} disagrees and why
   - Whether the challenged premise changes ${platformName}'s recommendation

6. **Premise revision check:** If Codex challenged an agreed premise, use AskUserQuestion:

> Codex challenged premise #{N}: "{premise text}". Their argument: "{reasoning}".
> A) Revise this premise based on Codex's input
> B) Keep the original premise — proceed to alternatives

If A: revise the premise and note the revision. If B: proceed (and note that the user defended this premise with reasoning — this is a founder signal if they articulate WHY they disagree, not just dismiss).`;
}

// ─── Plan File Discovery (shared helper) ──────────────────────────────

function generatePlanFileDiscovery(ctx: TemplateContext): string {
  return `### Plan File Discovery

1. **Conversation context (primary):** Check if there is an active plan file in this conversation. The host agent's system messages include plan file paths when in plan mode. If found, use it directly — this is the most reliable signal.

2. **Content-based search (fallback):** If no plan file is referenced in conversation context, search by content:

\`\`\`bash
setopt +o nomatch 2>/dev/null || true  # zsh compat
BRANCH=$(git branch --show-current 2>/dev/null | tr '/' '-')
REPO=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)")
# Compute project slug for state dir lookup
_PLAN_SLUG=$(git remote get-url origin 2>/dev/null | sed 's|.*[:/]\\([^/]*/[^/]*\\)\\.git$|\\1|;s|.*[:/]\\([^/]*/[^/]*\\)$|\\1|' | tr '/' '-' | tr -cd 'a-zA-Z0-9._-') || true
_PLAN_SLUG="\${_PLAN_SLUG:-$(basename "$PWD" | tr -cd 'a-zA-Z0-9._-')}"
_SD="${ctx.paths.skillRoot}/../.."  # project state dir
# Search common plan file locations
for PLAN_DIR in "$_SD/plans" ".gstack/plans"; do
  [ -d "$PLAN_DIR" ] || continue
  PLAN=$(ls -t "$PLAN_DIR"/*.md 2>/dev/null | xargs grep -l "$BRANCH" 2>/dev/null | head -1)
  [ -z "$PLAN" ] && PLAN=$(ls -t "$PLAN_DIR"/*.md 2>/dev/null | xargs grep -l "$REPO" 2>/dev/null | head -1)
  [ -z "$PLAN" ] && PLAN=$(find "$PLAN_DIR" -name '*.md' -mmin -1440 -maxdepth 1 2>/dev/null | xargs ls -t 2>/dev/null | head -1)
  [ -n "$PLAN" ] && break
done
[ -n "$PLAN" ] && echo "PLAN_FILE: $PLAN" || echo "NO_PLAN_FILE"
\`\`\`

3. **Validation:** If a plan file was found via content-based search (not conversation context), read the first 20 lines and verify it is relevant to the current branch's work. If it appears to be from a different project or feature, treat as "no plan file found."

**Error handling:**
- No plan file found → skip with "No plan file detected — skipping."
- Plan file found but unreadable (permissions, encoding) → skip with "Plan file found but unreadable — skipping."`;
}

// ─── Plan Completion Audit ────────────────────────────────────────────

type PlanCompletionMode = 'ship' | 'review';

function generatePlanCompletionAuditInner(ctx: TemplateContext, mode: PlanCompletionMode): string {
  const sections: string[] = [];

  // ── Plan file discovery (shared) ──
  sections.push(generatePlanFileDiscovery(ctx));

  // ── Item extraction ──
  sections.push(`
### Actionable Item Extraction

Read the plan file. Extract every actionable item — anything that describes work to be done. Look for:

- **Checkbox items:** \`- [ ] ...\` or \`- [x] ...\`
- **Numbered steps** under implementation headings: "1. Create ...", "2. Add ...", "3. Modify ..."
- **Imperative statements:** "Add X to Y", "Create a Z service", "Modify the W controller"
- **File-level specifications:** "New file: path/to/file.ts", "Modify path/to/existing.rb"
- **Test requirements:** "Test that X", "Add test for Y", "Verify Z"
- **Data model changes:** "Add column X to table Y", "Create migration for Z"

**Ignore:**
- Context/Background sections (\`## Context\`, \`## Background\`, \`## Problem\`)
- Questions and open items (marked with ?, "TBD", "TODO: decide")
- Review report sections (\`## GSTACK REVIEW REPORT\`)
- Explicitly deferred items ("Future:", "Out of scope:", "NOT in scope:", "P2:", "P3:", "P4:")
- CEO Review Decisions sections (these record choices, not work items)

**Cap:** Extract at most 50 items. If the plan has more, note: "Showing top 50 of N plan items — full list in plan file."

**No items found:** If the plan contains no extractable actionable items, skip with: "Plan file contains no actionable items — skipping completion audit."

For each item, note:
- The item text (verbatim or concise summary)
- Its category: CODE | TEST | MIGRATION | CONFIG | DOCS`);

  // ── Cross-reference against diff ──
  sections.push(`
### Cross-Reference Against Diff

Run \`git diff origin/<base>...HEAD\` and \`git log origin/<base>..HEAD --oneline\` to understand what was implemented.

For each extracted plan item, check the diff and classify:

- **DONE** — Clear evidence in the diff that this item was implemented. Cite the specific file(s) changed.
- **PARTIAL** — Some work toward this item exists in the diff but it's incomplete (e.g., model created but controller missing, function exists but edge cases not handled).
- **NOT DONE** — No evidence in the diff that this item was addressed.
- **CHANGED** — The item was implemented using a different approach than the plan described, but the same goal is achieved. Note the difference.

**Be conservative with DONE** — require clear evidence in the diff. A file being touched is not enough; the specific functionality described must be present.
**Be generous with CHANGED** — if the goal is met by different means, that counts as addressed.`);

  // ── Output format ──
  sections.push(`
### Output Format

\`\`\`
PLAN COMPLETION AUDIT
═══════════════════════════════
Plan: {plan file path}

## Implementation Items
  [DONE]      Create UserService — src/services/user_service.rb (+142 lines)
  [PARTIAL]   Add validation — model validates but missing controller checks
  [NOT DONE]  Add caching layer — no cache-related changes in diff
  [CHANGED]   "Redis queue" → implemented with Sidekiq instead

## Test Items
  [DONE]      Unit tests for UserService — test/services/user_service_test.rb
  [NOT DONE]  E2E test for signup flow

## Migration Items
  [DONE]      Create users table — db/migrate/20240315_create_users.rb

─────────────────────────────────
COMPLETION: 4/7 DONE, 1 PARTIAL, 1 NOT DONE, 1 CHANGED
─────────────────────────────────
\`\`\``);

  // ── Gate logic (mode-specific) ──
  if (mode === 'ship') {
    sections.push(`
### Gate Logic

After producing the completion checklist:

- **All DONE or CHANGED:** Pass. "Plan completion: PASS — all items addressed." Continue.
- **Only PARTIAL items (no NOT DONE):** Continue with a note in the PR body. Not blocking.
- **Any NOT DONE items:** Use AskUserQuestion:
  - Show the completion checklist above
  - "{N} items from the plan are NOT DONE. These were part of the original plan but are missing from the implementation."
  - RECOMMENDATION: depends on item count and severity. If 1-2 minor items (docs, config), recommend B. If core functionality is missing, recommend A.
  - Options:
    A) Stop — implement the missing items before shipping
    B) Ship anyway — defer these to a follow-up (will create P1 TODOs in Step 5.5)
    C) These items were intentionally dropped — remove from scope
  - If A: STOP. List the missing items for the user to implement.
  - If B: Continue. For each NOT DONE item, create a P1 TODO in Step 5.5 with "Deferred from plan: {plan file path}".
  - If C: Continue. Note in PR body: "Plan items intentionally dropped: {list}."

**No plan file found:** Skip entirely. "No plan file detected — skipping plan completion audit."

**Include in PR body (Step 8):** Add a \`## Plan Completion\` section with the checklist summary.`);
  } else {
    // review mode
    sections.push(`
### Integration with Scope Drift Detection

The plan completion results augment the existing Scope Drift Detection. If a plan file is found:

- **NOT DONE items** become additional evidence for **MISSING REQUIREMENTS** in the scope drift report.
- **Items in the diff that don't match any plan item** become evidence for **SCOPE CREEP** detection.

This is **INFORMATIONAL** — does not block the review (consistent with existing scope drift behavior).

Update the scope drift output to include plan file context:

\`\`\`
Scope Check: [CLEAN / DRIFT DETECTED / REQUIREMENTS MISSING]
Intent: <from plan file — 1-line summary>
Plan: <plan file path>
Delivered: <1-line summary of what the diff actually does>
Plan items: N DONE, M PARTIAL, K NOT DONE
[If NOT DONE: list each missing item]
[If scope creep: list each out-of-scope change not in the plan]
\`\`\`

**No plan file found:** Fall back to existing scope drift behavior (check TODOS.md and PR description only).`);
  }

  return sections.join('\n');
}

export function generatePlanCompletionAuditShip(ctx: TemplateContext): string {
  return generatePlanCompletionAuditInner(ctx, 'ship');
}

export function generatePlanCompletionAuditReview(ctx: TemplateContext): string {
  return generatePlanCompletionAuditInner(ctx, 'review');
}

// ─── Plan Verification Execution ──────────────────────────────────────

export function generatePlanVerificationExec(ctx: TemplateContext): string {
  return `## Step 3.47: Plan Verification

Automatically verify the plan's testing/verification steps using the \`/qa-only\` skill.

### 1. Check for verification section

Using the plan file already discovered in Step 3.45, look for a verification section. Match any of these headings: \`## Verification\`, \`## Test plan\`, \`## Testing\`, \`## How to test\`, \`## Manual testing\`, or any section with verification-flavored items (URLs to visit, things to check visually, interactions to test).

**If no verification section found:** Skip with "No verification steps found in plan — skipping auto-verification."
**If no plan file was found in Step 3.45:** Skip (already handled).

### 2. Check for running dev server

Before invoking browse-based verification, check if a dev server is reachable:

\`\`\`bash
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 2>/dev/null || \\
curl -s -o /dev/null -w '%{http_code}' http://localhost:8080 2>/dev/null || \\
curl -s -o /dev/null -w '%{http_code}' http://localhost:5173 2>/dev/null || \\
curl -s -o /dev/null -w '%{http_code}' http://localhost:4000 2>/dev/null || echo "NO_SERVER"
\`\`\`

**If NO_SERVER:** Skip with "No dev server detected — skipping plan verification. Run /qa separately after deploying."

### 3. Invoke /qa-only inline

Read the \`/qa-only\` skill from disk:

\`\`\`bash
cat $_GSTACK_ROOT/../qa-only/SKILL.md
\`\`\`

**If unreadable:** Skip with "Could not load /qa-only — skipping plan verification."

Follow the /qa-only workflow with these modifications:
- **Skip the preamble** (already handled by /ship)
- **Use the plan's verification section as the primary test input** — treat each verification item as a test case
- **Use the detected dev server URL** as the base URL
- **Skip the fix loop** — this is report-only verification during /ship
- **Cap at the verification items from the plan** — do not expand into general site QA

### 4. Gate logic

- **All verification items PASS:** Continue silently. "Plan verification: PASS."
- **Any FAIL:** Use AskUserQuestion:
  - Show the failures with screenshot evidence
  - RECOMMENDATION: Choose A if failures indicate broken functionality. Choose B if cosmetic only.
  - Options:
    A) Fix the failures before shipping (recommended for functional issues)
    B) Ship anyway — known issues (acceptable for cosmetic issues)
- **No verification section / no server / unreadable skill:** Skip (non-blocking).

### 5. Include in PR body

Add a \`## Verification Results\` section to the PR body (Step 8):
- If verification ran: summary of results (N PASS, M FAIL, K SKIPPED)
- If skipped: reason for skipping (no plan, no server, no verification section)`;
}

// ─── Codex Plan Review (used in /plan-eng-review) ────────────────────

export function generateCodexPlanReview(ctx: TemplateContext): string {
  // Codex host: strip entirely — Codex should never invoke itself
  if (ctx.host === 'codex') return '';

  const platformName = HOST_PLATFORM_NAMES[ctx.host];

  return `### Step 0.5: Codex plan review (optional)

${codexBinaryDetect()}

If available, after presenting Step 0 findings, use AskUserQuestion:
\`\`\`
Want an independent Codex (OpenAI) review of this plan before the detailed review?
A) Yes — let Codex critique the plan independently
B) No — proceed with the ${platformName} review only
\`\`\`

If the user chooses A:

${codexPlanReviewBlock()}

${codexErrorHandling('plan review')}

If Codex is not available, skip silently.`;
}

// ─── Spec Review Loop (used in /office-hours, /autoplan) ─────────────

export function generateSpecReviewLoop(ctx: TemplateContext): string {
  return `## Spec Review Loop

Before presenting the document to the user for approval, run an adversarial review.

**Step 1: Dispatch reviewer subagent**

Use the Agent tool to dispatch an independent reviewer. The reviewer has fresh context
and cannot see the brainstorming conversation — only the document. This ensures genuine
adversarial independence.

Prompt the subagent with:
- The file path of the document just written
- "Read this document and review it on 5 dimensions. For each dimension, note PASS or
  list specific issues with suggested fixes. At the end, output a quality score (1-10)
  across all dimensions."

**Dimensions:**
1. **Completeness** — Are all requirements addressed? Missing edge cases?
2. **Consistency** — Do parts of the document agree with each other? Contradictions?
3. **Clarity** — Could an engineer implement this without asking questions? Ambiguous language?
4. **Scope** — Does the document creep beyond the original problem? YAGNI violations?
5. **Feasibility** — Can this actually be built with the stated approach? Hidden complexity?

The subagent should return:
- A quality score (1-10)
- PASS if no issues, or a numbered list of issues with dimension, description, and fix

**Step 2: Fix and re-dispatch**

If the reviewer returns issues:
1. Fix each issue in the document on disk (use Edit tool)
2. Re-dispatch the reviewer subagent with the updated document
3. Maximum 3 iterations total

**Convergence guard:** If the reviewer returns the same issues on consecutive iterations
(the fix didn't resolve them or the reviewer disagrees with the fix), stop the loop
and persist those issues as "Reviewer Concerns" in the document rather than looping
further.

If the subagent fails, times out, or is unavailable — skip the review loop entirely.
Tell the user: "Spec review unavailable — presenting unreviewed doc." The document is
already written to disk; the review is a quality bonus, not a gate.

**Step 3: Report and persist metrics**

After the loop completes (PASS, max iterations, or convergence guard):

1. Tell the user the result — summary by default:
   "Your doc survived N rounds of adversarial review. M issues caught and fixed.
   Quality score: X/10."
   If they ask "what did the reviewer find?", show the full reviewer output.

2. If issues remain after max iterations or convergence, add a "## Reviewer Concerns"
   section to the document listing each unresolved issue. Downstream skills will see this.

3. Append metrics:
\`\`\`bash
mkdir -p ~/.gstack/analytics
echo '{"skill":"${ctx.skillName}","ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","iterations":ITERATIONS,"issues_found":FOUND,"issues_fixed":FIXED,"remaining":REMAINING,"quality_score":SCORE}' >> ~/.gstack/analytics/spec-review.jsonl 2>/dev/null || true
\`\`\`
Replace ITERATIONS, FOUND, FIXED, REMAINING, SCORE with actual values from the review.`;
}

export function generateBenefitsFrom(ctx: TemplateContext): string {
  if (!ctx.benefitsFrom || ctx.benefitsFrom.length === 0) return '';

  const skillList = ctx.benefitsFrom.map(s => `\`/${s}\``).join(' or ');
  const first = ctx.benefitsFrom[0];

  // Reuse the INVOKE_SKILL resolver for the actual loading instructions
  const invokeBlock = generateInvokeSkill(ctx, [first]);

  return `## Prerequisite Skill Offer

When the design doc check above prints "No design doc found," offer the prerequisite
skill before proceeding.

Say to the user via AskUserQuestion:

> "No design doc found for this branch. ${skillList} produces a structured problem
> statement, premise challenge, and explored alternatives — it gives this review much
> sharper input to work with. Takes about 10 minutes. The design doc is per-feature,
> not per-product — it captures the thinking behind this specific change."

Options:
- A) Run /${first} now (we'll pick up the review right after)
- B) Skip — proceed with standard review

If they skip: "No worries — standard review. If you ever want sharper input, try
/${first} first next time." Then proceed normally. Do not re-offer later in the session.

If they choose A:

Say: "Running /${first} inline. Once the design doc is ready, I'll pick up
the review right where we left off."

${invokeBlock}

After /${first} completes, re-run the design doc check:
\`\`\`bash
setopt +o nomatch 2>/dev/null || true  # zsh compat
SLUG=$(${ctx.paths.binDir}/remote-slug 2>/dev/null || basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null | tr '/' '-' || echo 'no-branch')
DESIGN=$(ls -t ~/.gstack/projects/$SLUG/*-$BRANCH-design-*.md 2>/dev/null | head -1)
[ -z "$DESIGN" ] && DESIGN=$(ls -t ~/.gstack/projects/$SLUG/*-design-*.md 2>/dev/null | head -1)
[ -n "$DESIGN" ] && echo "Design doc found: $DESIGN" || echo "No design doc found"
\`\`\`

If a design doc is now found, read it and continue the review.
If none was produced (user may have cancelled), proceed with standard review.`;
}
