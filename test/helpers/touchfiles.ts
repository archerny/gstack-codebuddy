/**
 * Diff-based test selection for E2E and LLM-judge evals.
 *
 * Each test declares which source files it depends on ("touchfiles").
 * The test runner checks `git diff` and only runs tests whose
 * dependencies were modified. Override with EVALS_ALL=1 to run everything.
 */

import { spawnSync } from 'child_process';

// --- Glob matching ---

/**
 * Match a file path against a glob pattern.
 * Supports:
 *   ** — match any number of path segments
 *   *  — match within a single segment (no /)
 */
export function matchGlob(file: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*');
  return new RegExp(`^${regexStr}$`).test(file);
}

// --- Touchfile maps ---

/**
 * E2E test touchfiles — keyed by testName (the string passed to runSkillTest).
 * Each test lists the file patterns that, if changed, require the test to run.
 */
export const E2E_TOUCHFILES: Record<string, string[]> = {
  // Browse core
  'browse-basic':    ['browse/src/**'],
  'browse-snapshot': ['browse/src/**'],

  // SKILL.md setup + preamble (setup block now lives in browse SKILL.md)
  'skillmd-setup-discovery':  ['browse/SKILL.md.tmpl', 'dist/claude/browse/**'],
  'skillmd-no-local-binary':  ['browse/SKILL.md.tmpl', 'dist/claude/browse/**'],
  'skillmd-outside-git':      ['browse/SKILL.md.tmpl', 'dist/claude/browse/**'],
  'contributor-mode':         ['skill-templates/SKILL.md.tmpl', 'dist/claude/gstack/**'],
  'session-awareness':        ['skill-templates/SKILL.md.tmpl', 'dist/claude/gstack/**'],

  // QA
  'qa-quick':       ['skill-templates/qa/**', 'browse/src/**'],
  'qa-b6-static':   ['skill-templates/qa/**', 'browse/src/**', 'browse/test/fixtures/qa-eval.html', 'test/fixtures/qa-eval-ground-truth.json'],
  'qa-b7-spa':      ['skill-templates/qa/**', 'browse/src/**', 'browse/test/fixtures/qa-eval-spa.html', 'test/fixtures/qa-eval-spa-ground-truth.json'],
  'qa-b8-checkout': ['skill-templates/qa/**', 'browse/src/**', 'browse/test/fixtures/qa-eval-checkout.html', 'test/fixtures/qa-eval-checkout-ground-truth.json'],
  'qa-only-no-fix': ['skill-templates/qa-only/**', 'skill-templates/qa/templates/**'],
  'qa-fix-loop':    ['skill-templates/qa/**', 'browse/src/**'],

  // Review
  'review-sql-injection':     ['skill-templates/review/**', 'test/fixtures/review-eval-vuln.rb'],
  'review-enum-completeness': ['skill-templates/review/**', 'test/fixtures/review-eval-enum*.rb'],
  'review-base-branch':       ['skill-templates/review/**'],
  'review-design-lite':       ['skill-templates/review/**', 'test/fixtures/review-eval-design-slop.*'],

  // Plan reviews
  'plan-ceo-review':           ['skill-templates/plan-ceo-review/**'],
  'plan-ceo-review-selective': ['skill-templates/plan-ceo-review/**'],
  'plan-eng-review':           ['skill-templates/plan-eng-review/**'],
  'plan-eng-review-artifact':  ['skill-templates/plan-eng-review/**'],

  // Ship
  'ship-base-branch': ['skill-templates/ship/**'],

  // Retro
  'retro':             ['skill-templates/retro/**'],
  'retro-base-branch': ['skill-templates/retro/**'],

  // Document-release
  'document-release': ['skill-templates/document-release/**'],

  // Codex (Claude E2E — tests /codex skill via Claude)
  'codex-review': ['skill-templates/codex/**'],

  // Codex E2E (tests skills via Codex CLI)
  'codex-discover-skill':  ['skill-templates/codex/**', 'dist/codex/**', 'test/helpers/codex-session-runner.ts'],
  'codex-review-findings': ['skill-templates/review/**', 'dist/codex/review/**', 'skill-templates/codex/**', 'test/helpers/codex-session-runner.ts'],

  // QA bootstrap
  'qa-bootstrap': ['skill-templates/qa/**', 'browse/src/**', 'skill-templates/ship/**'],

  // Ship coverage audit
  'ship-coverage-audit': ['skill-templates/ship/**'],

  // Design
  'design-consultation-core':     ['skill-templates/design-consultation/**'],
  'design-consultation-research': ['skill-templates/design-consultation/**'],
  'design-consultation-existing': ['skill-templates/design-consultation/**'],
  'design-consultation-preview':  ['skill-templates/design-consultation/**'],
  'plan-design-review-plan-mode':   ['skill-templates/plan-design-review/**'],
  'plan-design-review-no-ui-scope': ['skill-templates/plan-design-review/**'],
  'design-review-fix':              ['skill-templates/design-review/**', 'browse/src/**'],

  // Skill routing — journey-stage tests (depend on ALL skill descriptions)
  'journey-ideation':       ['skill-templates/*/SKILL.md.tmpl', 'skill-templates/SKILL.md.tmpl', 'scripts/gen-skill-docs.ts'],
  'journey-plan-eng':       ['skill-templates/*/SKILL.md.tmpl', 'skill-templates/SKILL.md.tmpl', 'scripts/gen-skill-docs.ts'],
  'journey-think-bigger':   ['skill-templates/*/SKILL.md.tmpl', 'skill-templates/SKILL.md.tmpl', 'scripts/gen-skill-docs.ts'],
  'journey-debug':          ['skill-templates/*/SKILL.md.tmpl', 'skill-templates/SKILL.md.tmpl', 'scripts/gen-skill-docs.ts'],
  'journey-qa':             ['skill-templates/*/SKILL.md.tmpl', 'skill-templates/SKILL.md.tmpl', 'scripts/gen-skill-docs.ts'],
  'journey-code-review':    ['skill-templates/*/SKILL.md.tmpl', 'skill-templates/SKILL.md.tmpl', 'scripts/gen-skill-docs.ts'],
  'journey-ship':           ['skill-templates/*/SKILL.md.tmpl', 'skill-templates/SKILL.md.tmpl', 'scripts/gen-skill-docs.ts'],
  'journey-docs':           ['skill-templates/*/SKILL.md.tmpl', 'skill-templates/SKILL.md.tmpl', 'scripts/gen-skill-docs.ts'],
  'journey-retro':          ['skill-templates/*/SKILL.md.tmpl', 'skill-templates/SKILL.md.tmpl', 'scripts/gen-skill-docs.ts'],
  'journey-design-system':  ['skill-templates/*/SKILL.md.tmpl', 'skill-templates/SKILL.md.tmpl', 'scripts/gen-skill-docs.ts'],
  'journey-visual-qa':      ['skill-templates/*/SKILL.md.tmpl', 'skill-templates/SKILL.md.tmpl', 'scripts/gen-skill-docs.ts'],
};

/**
 * LLM-judge test touchfiles — keyed by test description string.
 */
export const LLM_JUDGE_TOUCHFILES: Record<string, string[]> = {
  'command reference table':          ['browse/SKILL.md.tmpl', 'dist/claude/browse/**', 'browse/src/commands.ts'],
  'snapshot flags reference':         ['browse/SKILL.md.tmpl', 'dist/claude/browse/**', 'browse/src/snapshot.ts'],
  'browse/SKILL.md reference':        ['browse/SKILL.md.tmpl', 'dist/claude/browse/**', 'browse/src/**'],
  'setup block':                      ['browse/SKILL.md.tmpl', 'dist/claude/browse/**'],
  'regression vs baseline':           ['browse/SKILL.md.tmpl', 'dist/claude/browse/**', 'browse/src/commands.ts', 'test/fixtures/eval-baselines.json'],
  'qa/SKILL.md workflow':             ['skill-templates/qa/SKILL.md.tmpl', 'dist/claude/qa/**'],
  'qa/SKILL.md health rubric':        ['skill-templates/qa/SKILL.md.tmpl', 'dist/claude/qa/**'],
  'qa/SKILL.md anti-refusal':         ['skill-templates/qa/SKILL.md.tmpl', 'dist/claude/qa/**', 'skill-templates/qa-only/SKILL.md.tmpl', 'dist/claude/qa-only/**'],
  'cross-skill greptile consistency': ['skill-templates/review/SKILL.md.tmpl', 'dist/claude/review/**', 'skill-templates/ship/SKILL.md.tmpl', 'dist/claude/ship/**', 'skill-templates/review/greptile-triage.md', 'skill-templates/retro/SKILL.md.tmpl', 'dist/claude/retro/**'],
  'baseline score pinning':           ['browse/SKILL.md.tmpl', 'dist/claude/browse/**', 'test/fixtures/eval-baselines.json'],

  // Ship & Release
  'ship/SKILL.md workflow':               ['skill-templates/ship/SKILL.md.tmpl', 'dist/claude/ship/**'],
  'document-release/SKILL.md workflow':   ['skill-templates/document-release/SKILL.md.tmpl', 'dist/claude/document-release/**'],

  // Plan Reviews
  'plan-ceo-review/SKILL.md modes':       ['skill-templates/plan-ceo-review/SKILL.md.tmpl', 'dist/claude/plan-ceo-review/**'],
  'plan-eng-review/SKILL.md sections':    ['skill-templates/plan-eng-review/SKILL.md.tmpl', 'dist/claude/plan-eng-review/**'],
  'plan-design-review/SKILL.md passes':   ['skill-templates/plan-design-review/SKILL.md.tmpl', 'dist/claude/plan-design-review/**'],

  // Design skills
  'design-review/SKILL.md fix loop':      ['skill-templates/design-review/SKILL.md.tmpl', 'dist/claude/design-review/**'],
  'design-consultation/SKILL.md research': ['skill-templates/design-consultation/SKILL.md.tmpl', 'dist/claude/design-consultation/**'],

  // Other skills
  'retro/SKILL.md instructions':          ['skill-templates/retro/SKILL.md.tmpl', 'dist/claude/retro/**'],
  'qa-only/SKILL.md workflow':            ['skill-templates/qa-only/SKILL.md.tmpl', 'dist/claude/qa-only/**'],
};

/**
 * Changes to any of these files trigger ALL tests (both E2E and LLM-judge).
 */
export const GLOBAL_TOUCHFILES = [
  'test/helpers/session-runner.ts',
  'test/helpers/codex-session-runner.ts',
  'test/helpers/eval-store.ts',
  'test/helpers/llm-judge.ts',
  'scripts/gen-skill-docs.ts',
  'scripts/resolvers/**',
  'test/helpers/touchfiles.ts',
  'browse/test/test-server.ts',
];

// --- Base branch detection ---

/**
 * Detect the base branch by trying refs in order.
 * Returns the first valid ref, or null if none found.
 */
export function detectBaseBranch(cwd: string): string | null {
  for (const ref of ['origin/main', 'origin/master', 'main', 'master']) {
    const result = spawnSync('git', ['rev-parse', '--verify', ref], {
      cwd, stdio: 'pipe', timeout: 3000,
    });
    if (result.status === 0) return ref;
  }
  return null;
}

/**
 * Get list of files changed between base branch and HEAD.
 */
export function getChangedFiles(baseBranch: string, cwd: string): string[] {
  const result = spawnSync('git', ['diff', '--name-only', `${baseBranch}...HEAD`], {
    cwd, stdio: 'pipe', timeout: 5000,
  });
  if (result.status !== 0) return [];
  return result.stdout.toString().trim().split('\n').filter(Boolean);
}

// --- Test selection ---

/**
 * Select tests to run based on changed files.
 *
 * Algorithm:
 * 1. If any changed file matches a global touchfile → run ALL tests
 * 2. Otherwise, for each test, check if any changed file matches its patterns
 * 3. Return selected + skipped lists with reason
 */
export function selectTests(
  changedFiles: string[],
  touchfiles: Record<string, string[]>,
  globalTouchfiles: string[] = GLOBAL_TOUCHFILES,
): { selected: string[]; skipped: string[]; reason: string } {
  const allTestNames = Object.keys(touchfiles);

  // Global touchfile hit → run all
  for (const file of changedFiles) {
    if (globalTouchfiles.some(g => matchGlob(file, g))) {
      return { selected: allTestNames, skipped: [], reason: `global: ${file}` };
    }
  }

  // Per-test matching
  const selected: string[] = [];
  const skipped: string[] = [];
  for (const [testName, patterns] of Object.entries(touchfiles)) {
    const hit = changedFiles.some(f => patterns.some(p => matchGlob(f, p)));
    (hit ? selected : skipped).push(testName);
  }

  return { selected, skipped, reason: 'diff' };
}
