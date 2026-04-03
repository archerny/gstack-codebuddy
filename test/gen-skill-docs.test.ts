import { describe, test, expect } from 'bun:test';
import { COMMAND_DESCRIPTIONS } from '../browse/src/commands';
import { SNAPSHOT_FLAGS } from '../browse/src/snapshot';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(import.meta.dir, '..');

// Dynamic template discovery — matches the generator's findTemplates() behavior.
// New skills automatically get test coverage without updating a static list.
const ALL_SKILLS = (() => {
  const skills: Array<{ dir: string; name: string }> = [];
  const skillTemplatesDir = path.join(ROOT, 'skill-templates');
  if (fs.existsSync(path.join(skillTemplatesDir, 'SKILL.md.tmpl'))) {
    skills.push({ dir: '.', name: 'root gstack' });
  }
  for (const entry of fs.readdirSync(skillTemplatesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    if (fs.existsSync(path.join(skillTemplatesDir, entry.name, 'SKILL.md.tmpl'))) {
      skills.push({ dir: entry.name, name: entry.name });
    }
  }
  // Also check ROOT for non-skill-templates directories (e.g., browse/)
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'skill-templates') continue;
    if (fs.existsSync(path.join(ROOT, entry.name, 'SKILL.md.tmpl'))) {
      skills.push({ dir: entry.name, name: entry.name });
    }
  }
  return skills;
})();

// Helper: read Claude output from dist/claude/{skillName}/SKILL.md
function readClaudeSkill(skillDir: string): string {
  const name = skillDir === '.' ? 'gstack' : (skillDir.startsWith('gstack-') ? skillDir.slice('gstack-'.length) : skillDir);
  return fs.readFileSync(path.join(ROOT, 'dist', 'claude', name, 'SKILL.md'), 'utf-8');
}

describe('gen-skill-docs', () => {
  test('generated browse SKILL.md contains all command categories', () => {
    const content = readClaudeSkill('browse');
    const categories = new Set(Object.values(COMMAND_DESCRIPTIONS).map(d => d.category));
    for (const cat of categories) {
      expect(content).toContain(`### ${cat}`);
    }
  });

  test('generated browse SKILL.md contains all commands', () => {
    const content = readClaudeSkill('browse');
    for (const [cmd, meta] of Object.entries(COMMAND_DESCRIPTIONS)) {
      const display = meta.usage || cmd;
      expect(content).toContain(display);
    }
  });

  test('command table is sorted alphabetically within categories', () => {
    const content = readClaudeSkill('browse');
    // Extract command names from the Navigation section as a test
    const navSection = content.match(/### Navigation\n\|.*\n\|.*\n([\s\S]*?)(?=\n###|\n## )/);
    expect(navSection).not.toBeNull();
    const rows = navSection![1].trim().split('\n');
    const commands = rows.map(r => {
      const match = r.match(/\| `(\w+)/);
      return match ? match[1] : '';
    }).filter(Boolean);
    const sorted = [...commands].sort();
    expect(commands).toEqual(sorted);
  });

  test('generated header is present in root SKILL.md', () => {
    const content = readClaudeSkill('.');
    expect(content).toContain('AUTO-GENERATED from SKILL.md.tmpl');
    expect(content).toContain('Regenerate: bun run gen:skill-docs');
  });

  test('generated header is present in browse SKILL.md', () => {
    const content = readClaudeSkill('browse');
    expect(content).toContain('AUTO-GENERATED from SKILL.md.tmpl');
  });

  test('snapshot flags section contains all flags', () => {
    const content = readClaudeSkill('browse');
    for (const flag of SNAPSHOT_FLAGS) {
      expect(content).toContain(flag.short);
      expect(content).toContain(flag.description);
    }
  });

  test('every skill has a SKILL.md.tmpl template', () => {
    for (const skill of ALL_SKILLS) {
      // Skills in skill-templates/ vs root (e.g., browse/)
      const tmplPath = skill.dir === '.'
        ? path.join(ROOT, 'skill-templates', 'SKILL.md.tmpl')
        : fs.existsSync(path.join(ROOT, 'skill-templates', skill.dir, 'SKILL.md.tmpl'))
          ? path.join(ROOT, 'skill-templates', skill.dir, 'SKILL.md.tmpl')
          : path.join(ROOT, skill.dir, 'SKILL.md.tmpl');
      expect(fs.existsSync(tmplPath)).toBe(true);
    }
  });

  test('every skill has a generated SKILL.md in dist/claude/ with auto-generated header', () => {
    for (const skill of ALL_SKILLS) {
      const content = readClaudeSkill(skill.dir);
      expect(content).toContain('AUTO-GENERATED from SKILL.md.tmpl');
      expect(content).toContain('Regenerate: bun run gen:skill-docs');
    }
  });

  test('every generated SKILL.md has valid YAML frontmatter', () => {
    for (const skill of ALL_SKILLS) {
      const content = readClaudeSkill(skill.dir);
      expect(content.startsWith('---\n')).toBe(true);
      expect(content).toContain('name:');
      expect(content).toContain('description:');
    }
  });

  test('generated files are fresh (match --dry-run)', () => {
    const result = Bun.spawnSync(['bun', 'run', 'scripts/gen-skill-docs.ts', '--dry-run'], {
      cwd: ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode).toBe(0);
    const output = result.stdout.toString();
    // Every skill should be FRESH in dist/claude/
    for (const skill of ALL_SKILLS) {
      const name = skill.dir === '.' ? 'gstack' : (skill.dir.startsWith('gstack-') ? skill.dir.slice('gstack-'.length) : skill.dir);
      expect(output).toContain(`FRESH: dist/claude/${name}/SKILL.md`);
    }
    expect(output).not.toContain('STALE');
  });

  test('no generated SKILL.md contains unresolved placeholders', () => {
    for (const skill of ALL_SKILLS) {
      const content = readClaudeSkill(skill.dir);
      // Match both simple {{NAME}} and parameterized {{NAME:arg1:arg2}} syntax
      const unresolved = content.match(/\{\{[A-Z_]+(?::[^}]*)?\}\}/g);
      expect(unresolved).toBeNull();
    }
  });

  test('templates contain placeholders', () => {
    const rootTmpl = fs.readFileSync(path.join(ROOT, 'skill-templates', 'SKILL.md.tmpl'), 'utf-8');
    // Root template is now a slim skill router — only PREAMBLE, no browse content
    expect(rootTmpl).toContain('{{PREAMBLE}}');
    expect(rootTmpl).not.toContain('{{COMMAND_REFERENCE}}');
    expect(rootTmpl).not.toContain('{{SNAPSHOT_FLAGS}}');

    const browseTmpl = fs.readFileSync(path.join(ROOT, 'browse', 'SKILL.md.tmpl'), 'utf-8');
    expect(browseTmpl).toContain('{{COMMAND_REFERENCE}}');
    expect(browseTmpl).toContain('{{SNAPSHOT_FLAGS}}');
    expect(browseTmpl).toContain('{{PREAMBLE}}');
  });

  test('generated SKILL.md contains contributor mode check', () => {
    const content = readClaudeSkill('.');
    expect(content).toContain('Contributor Mode');
    expect(content).toContain('gstack_contributor');
    expect(content).toContain('contributor-logs');
  });

  test('generated SKILL.md contains session awareness', () => {
    const content = readClaudeSkill('.');
    expect(content).toContain('_SESSIONS');
    expect(content).toContain('RECOMMENDATION');
  });

  test('generated SKILL.md contains branch detection', () => {
    const content = readClaudeSkill('.');
    expect(content).toContain('_BRANCH');
    expect(content).toContain('git branch --show-current');
  });

  test('generated SKILL.md contains ELI16 simplification rules', () => {
    const content = readClaudeSkill('.');
    expect(content).toContain('No raw function names');
    expect(content).toContain('plain English');
  });

  test('generated SKILL.md contains telemetry line', () => {
    const content = readClaudeSkill('.');
    expect(content).toContain('skill-usage.jsonl');
    expect(content).toContain('$_STATE_DIR/analytics');
  });

  test('preamble-using skills have correct skill name in telemetry', () => {
    const PREAMBLE_SKILLS = [
      { dir: '.', name: 'gstack' },
      { dir: 'ship', name: 'ship' },
      { dir: 'review', name: 'review' },
      { dir: 'qa', name: 'qa' },
      { dir: 'retro', name: 'retro' },
    ];
    for (const skill of PREAMBLE_SKILLS) {
      const content = readClaudeSkill(skill.dir);
      expect(content).toContain(`"skill":"${skill.name}"`);
    }
  });

  test('qa and qa-only templates use QA_METHODOLOGY placeholder', () => {
    const qaTmpl = fs.readFileSync(path.join(ROOT, 'skill-templates', 'qa', 'SKILL.md.tmpl'), 'utf-8');
    expect(qaTmpl).toContain('{{QA_METHODOLOGY}}');

    const qaOnlyTmpl = fs.readFileSync(path.join(ROOT, 'skill-templates', 'qa-only', 'SKILL.md.tmpl'), 'utf-8');
    expect(qaOnlyTmpl).toContain('{{QA_METHODOLOGY}}');
  });

  test('QA_METHODOLOGY appears expanded in both qa and qa-only generated files', () => {
    const qaContent = readClaudeSkill('qa');
    const qaOnlyContent = readClaudeSkill('qa-only');

    // Both should contain the health score rubric
    expect(qaContent).toContain('Health Score Rubric');
    expect(qaOnlyContent).toContain('Health Score Rubric');

    // Both should contain framework guidance
    expect(qaContent).toContain('Framework-Specific Guidance');
    expect(qaOnlyContent).toContain('Framework-Specific Guidance');

    // Both should contain the important rules
    expect(qaContent).toContain('Important Rules');
    expect(qaOnlyContent).toContain('Important Rules');

    // Both should contain the 6 phases
    expect(qaContent).toContain('Phase 1');
    expect(qaOnlyContent).toContain('Phase 1');
    expect(qaContent).toContain('Phase 6');
    expect(qaOnlyContent).toContain('Phase 6');
  });

  test('qa-only has no-fix guardrails', () => {
    const qaOnlyContent = readClaudeSkill('qa-only');
    expect(qaOnlyContent).toContain('Never fix bugs');
    expect(qaOnlyContent).toContain('NEVER fix anything');
    // Should not have Edit, Glob, or Grep in allowed-tools
    expect(qaOnlyContent).not.toMatch(/allowed-tools:[\s\S]*?Edit/);
    expect(qaOnlyContent).not.toMatch(/allowed-tools:[\s\S]*?Glob/);
    expect(qaOnlyContent).not.toMatch(/allowed-tools:[\s\S]*?Grep/);
  });

  test('qa has fix-loop tools and phases', () => {
    const qaContent = readClaudeSkill('qa');
    // Should have Edit, Glob, Grep in allowed-tools
    expect(qaContent).toContain('Edit');
    expect(qaContent).toContain('Glob');
    expect(qaContent).toContain('Grep');
    // Should have fix-loop phases
    expect(qaContent).toContain('Phase 7');
    expect(qaContent).toContain('Phase 8');
    expect(qaContent).toContain('Fix Loop');
    expect(qaContent).toContain('Triage');
    expect(qaContent).toContain('WTF');
  });
});

describe('BASE_BRANCH_DETECT resolver', () => {
  // Find a generated SKILL.md that uses the placeholder (ship is guaranteed to)
  const shipContent = readClaudeSkill('ship');

  test('resolver output contains PR base detection command', () => {
    expect(shipContent).toContain('gh pr view --json baseRefName');
  });

  test('resolver output contains repo default branch detection command', () => {
    expect(shipContent).toContain('gh repo view --json defaultBranchRef');
  });

  test('resolver output contains fallback to main', () => {
    expect(shipContent).toMatch(/fall\s*back\s+to\s+`main`/i);
  });

  test('resolver output uses "the base branch" phrasing', () => {
    expect(shipContent).toContain('the base branch');
  });
});

/**
 * Quality evals — catch description regressions.
 *
 * These test that generated output is *useful for an AI agent*,
 * not just structurally valid. Each test targets a specific
 * regression we actually shipped and caught in review.
 */
describe('description quality evals', () => {
  // Regression: snapshot flags lost value hints (-d <N>, -s <sel>, -o <path>)
  test('snapshot flags with values include value hints in output', () => {
    const content = readClaudeSkill('browse');
    for (const flag of SNAPSHOT_FLAGS) {
      if (flag.takesValue) {
        expect(flag.valueHint).toBeDefined();
        expect(content).toContain(`${flag.short} ${flag.valueHint}`);
      }
    }
  });

  // Regression: "is" lost the valid states enum
  test('is command lists valid state values', () => {
    const desc = COMMAND_DESCRIPTIONS['is'].description;
    for (const state of ['visible', 'hidden', 'enabled', 'disabled', 'checked', 'editable', 'focused']) {
      expect(desc).toContain(state);
    }
  });

  // Regression: "press" lost common key examples
  test('press command lists example keys', () => {
    const desc = COMMAND_DESCRIPTIONS['press'].description;
    expect(desc).toContain('Enter');
    expect(desc).toContain('Tab');
    expect(desc).toContain('Escape');
  });

  // Regression: "console" lost --errors filter note
  test('console command describes --errors behavior', () => {
    const desc = COMMAND_DESCRIPTIONS['console'].description;
    expect(desc).toContain('--errors');
  });

  // Regression: snapshot -i lost "@e refs" context
  test('snapshot -i mentions @e refs', () => {
    const flag = SNAPSHOT_FLAGS.find(f => f.short === '-i')!;
    expect(flag.description).toContain('@e');
  });

  // Regression: snapshot -C lost "@c refs" context
  test('snapshot -C mentions @c refs', () => {
    const flag = SNAPSHOT_FLAGS.find(f => f.short === '-C')!;
    expect(flag.description).toContain('@c');
  });

  // Guard: every description must be at least 8 chars (catches empty or stub descriptions)
  test('all command descriptions have meaningful length', () => {
    for (const [cmd, meta] of Object.entries(COMMAND_DESCRIPTIONS)) {
      expect(meta.description.length).toBeGreaterThanOrEqual(8);
    }
  });

  // Guard: snapshot flag descriptions must be at least 10 chars
  test('all snapshot flag descriptions have meaningful length', () => {
    for (const flag of SNAPSHOT_FLAGS) {
      expect(flag.description.length).toBeGreaterThanOrEqual(10);
    }
  });

  // Guard: descriptions must not contain pipe (breaks markdown table cells)
  // Usage strings are backtick-wrapped in the table so pipes there are safe.
  test('no command description contains pipe character', () => {
    for (const [cmd, meta] of Object.entries(COMMAND_DESCRIPTIONS)) {
      expect(meta.description).not.toContain('|');
    }
  });

  // Guard: generated output uses → not ->
  test('generated browse SKILL.md uses unicode arrows', () => {
    const content = readClaudeSkill('browse');
    // Check the Full Command List section (where link descriptions use →)
    const cmdSection = content.slice(content.indexOf('## Full Command List'));
    expect(cmdSection).toContain('→');
    expect(cmdSection).not.toContain('->');
  });
});

describe('REVIEW_DASHBOARD resolver', () => {
  const REVIEW_SKILLS = ['plan-ceo-review', 'plan-eng-review', 'plan-design-review'];

  for (const skill of REVIEW_SKILLS) {
    test(`review dashboard appears in ${skill} generated file`, () => {
      const content = readClaudeSkill(skill);
      expect(content).toContain('gstack-review');
      expect(content).toContain('REVIEW READINESS DASHBOARD');
    });
  }

  test('review dashboard appears in ship generated file', () => {
    const content = readClaudeSkill('ship');
    expect(content).toContain('reviews.jsonl');
    expect(content).toContain('REVIEW READINESS DASHBOARD');
  });

  test('resolver output contains key dashboard elements', () => {
    const content = readClaudeSkill('plan-ceo-review');
    expect(content).toContain('VERDICT');
    expect(content).toContain('CLEARED');
    expect(content).toContain('Eng Review');
    expect(content).toContain('7 days');
    expect(content).toContain('Design Review');
    expect(content).toContain('skip_eng_review');
  });

  test('dashboard bash block includes git HEAD for staleness detection', () => {
    const content = readClaudeSkill('plan-ceo-review');
    expect(content).toContain('git rev-parse --short HEAD');
    expect(content).toContain('---HEAD---');
  });

  test('dashboard includes staleness detection prose', () => {
    const content = readClaudeSkill('plan-ceo-review');
    expect(content).toContain('Staleness detection');
    expect(content).toContain('commit');
  });

  for (const skill of REVIEW_SKILLS) {
    test(`${skill} contains review chaining section`, () => {
      const content = readClaudeSkill(skill);
      expect(content).toContain('Review Chaining');
    });

    test(`${skill} Review Log includes commit field`, () => {
      const content = readClaudeSkill(skill);
      expect(content).toContain('"commit"');
    });
  }

  test('plan-ceo-review chaining mentions eng and design reviews', () => {
    const content = readClaudeSkill('plan-ceo-review');
    expect(content).toContain('/plan-eng-review');
    expect(content).toContain('/plan-design-review');
  });

  test('plan-eng-review chaining mentions design and ceo reviews', () => {
    const content = readClaudeSkill('plan-eng-review');
    expect(content).toContain('/plan-design-review');
    expect(content).toContain('/plan-ceo-review');
  });

  test('plan-design-review chaining mentions eng and ceo reviews', () => {
    const content = readClaudeSkill('plan-design-review');
    expect(content).toContain('/plan-eng-review');
    expect(content).toContain('/plan-ceo-review');
  });

  test('ship does NOT contain review chaining', () => {
    const content = readClaudeSkill('ship');
    expect(content).not.toContain('Review Chaining');
  });
});

// ─── Codex Generation Tests ─────────────────────────────────

describe('Codex generation (--host codex)', () => {
  const CODEX_DIR = path.join(ROOT, 'dist', 'codex');

  // Dynamic discovery of expected Codex skills: all templates except /codex
  const CODEX_SKILLS = (() => {
    const skills: Array<{ dir: string; codexName: string }> = [];
    const skillTemplatesDir = path.join(ROOT, 'skill-templates');
    if (fs.existsSync(path.join(skillTemplatesDir, 'SKILL.md.tmpl'))) {
      skills.push({ dir: '.', codexName: 'gstack' });
    }
    for (const entry of fs.readdirSync(skillTemplatesDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      if (entry.name === 'codex') continue; // /codex is excluded from Codex output
      if (!fs.existsSync(path.join(skillTemplatesDir, entry.name, 'SKILL.md.tmpl'))) continue;
      const codexName = entry.name.startsWith('gstack-') ? entry.name.slice('gstack-'.length) : entry.name;
      skills.push({ dir: entry.name, codexName });
    }
    // Also check ROOT for non-skill-templates directories (e.g., browse/)
    for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'skill-templates') continue;
      if (entry.name === 'codex') continue;
      if (!fs.existsSync(path.join(ROOT, entry.name, 'SKILL.md.tmpl'))) continue;
      const codexName = entry.name.startsWith('gstack-') ? entry.name.slice('gstack-'.length) : entry.name;
      skills.push({ dir: entry.name, codexName });
    }
    return skills;
  })();

  test('--host codex generates correct output paths', () => {
    for (const skill of CODEX_SKILLS) {
      const skillMd = path.join(CODEX_DIR, skill.codexName, 'SKILL.md');
      expect(fs.existsSync(skillMd)).toBe(true);
    }
  });

  test('codexSkillName mapping: root is gstack, others use dir name directly', () => {
    // Root → gstack
    expect(fs.existsSync(path.join(CODEX_DIR, 'gstack', 'SKILL.md'))).toBe(true);
    // Subdirectories → {dir} (no prefix)
    expect(fs.existsSync(path.join(CODEX_DIR, 'review', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(CODEX_DIR, 'ship', 'SKILL.md'))).toBe(true);
    // Old gstack-prefixed dirs must NOT exist
    expect(fs.existsSync(path.join(CODEX_DIR, 'gstack-review', 'SKILL.md'))).toBe(false);
  });

  test('Codex frontmatter has ONLY name + description', () => {
    for (const skill of CODEX_SKILLS) {
      const content = fs.readFileSync(path.join(CODEX_DIR, skill.codexName, 'SKILL.md'), 'utf-8');
      expect(content.startsWith('---\n')).toBe(true);
      const fmEnd = content.indexOf('\n---', 4);
      expect(fmEnd).toBeGreaterThan(0);
      const frontmatter = content.slice(4, fmEnd);
      // Must have name and description
      expect(frontmatter).toContain('name:');
      expect(frontmatter).toContain('description:');
      // Must NOT have allowed-tools, version, or hooks
      expect(frontmatter).not.toContain('allowed-tools:');
      expect(frontmatter).not.toContain('version:');
      expect(frontmatter).not.toContain('hooks:');
    }
  });

  test('no .claude/skills/ in Codex output', () => {
    for (const skill of CODEX_SKILLS) {
      const content = fs.readFileSync(path.join(CODEX_DIR, skill.codexName, 'SKILL.md'), 'utf-8');
      expect(content).not.toContain('.claude/skills');
    }
  });

  test('no ~/.claude/ paths in Codex output', () => {
    for (const skill of CODEX_SKILLS) {
      const content = fs.readFileSync(path.join(CODEX_DIR, skill.codexName, 'SKILL.md'), 'utf-8');
      expect(content).not.toContain('~/.claude/');
    }
  });

  test('/codex skill excluded from Codex output', () => {
    expect(fs.existsSync(path.join(CODEX_DIR, 'codex', 'SKILL.md'))).toBe(false);
    expect(fs.existsSync(path.join(CODEX_DIR, 'codex'))).toBe(false);
  });

  test('--host codex --dry-run freshness', () => {
    const result = Bun.spawnSync(['bun', 'run', 'scripts/gen-skill-docs.ts', '--host', 'codex', '--dry-run'], {
      cwd: ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode).toBe(0);
    const output = result.stdout.toString();
    // Every Codex skill should be FRESH
    for (const skill of CODEX_SKILLS) {
      expect(output).toContain(`FRESH: dist/codex/${skill.codexName}/SKILL.md`);
    }
    expect(output).not.toContain('STALE');
  });

  test('--host agents alias produces same output as --host codex', () => {
    const codexResult = Bun.spawnSync(['bun', 'run', 'scripts/gen-skill-docs.ts', '--host', 'codex', '--dry-run'], {
      cwd: ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const agentsResult = Bun.spawnSync(['bun', 'run', 'scripts/gen-skill-docs.ts', '--host', 'agents', '--dry-run'], {
      cwd: ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(codexResult.exitCode).toBe(0);
    expect(agentsResult.exitCode).toBe(0);
    // Both should produce the same output (same FRESH lines)
    expect(codexResult.stdout.toString()).toBe(agentsResult.stdout.toString());
  });

  test('multiline descriptions preserved in Codex output', () => {
    // office-hours has a multiline description — verify it survives the frontmatter transform
    const content = fs.readFileSync(path.join(CODEX_DIR, 'office-hours', 'SKILL.md'), 'utf-8');
    const fmEnd = content.indexOf('\n---', 4);
    const frontmatter = content.slice(4, fmEnd);
    // Description should span multiple lines (block scalar)
    const descLines = frontmatter.split('\n').filter(l => l.startsWith('  '));
    expect(descLines.length).toBeGreaterThan(1);
    // Verify key phrases survived
    expect(frontmatter).toContain('YC Office Hours');
  });

  test('hook skills have safety prose and no hooks: in frontmatter', () => {
    const HOOK_SKILLS = ['careful', 'freeze', 'guard'];
    for (const skillName of HOOK_SKILLS) {
      const content = fs.readFileSync(path.join(CODEX_DIR, skillName, 'SKILL.md'), 'utf-8');
      // Must have safety advisory prose
      expect(content).toContain('Safety Advisory');
      // Must NOT have hooks: in frontmatter
      const fmEnd = content.indexOf('\n---', 4);
      const frontmatter = content.slice(4, fmEnd);
      expect(frontmatter).not.toContain('hooks:');
    }
  });

  test('all Codex SKILL.md files have auto-generated header', () => {
    for (const skill of CODEX_SKILLS) {
      const content = fs.readFileSync(path.join(CODEX_DIR, skill.codexName, 'SKILL.md'), 'utf-8');
      expect(content).toContain('AUTO-GENERATED from SKILL.md.tmpl');
      expect(content).toContain('Regenerate: bun run gen:skill-docs');
    }
  });

  test('Codex preamble uses codex paths', () => {
    // Check a skill that has a preamble (review is a good candidate)
    const content = fs.readFileSync(path.join(CODEX_DIR, 'review', 'SKILL.md'), 'utf-8');
    // All hosts now use $_GSTACK_ROOT probe chain — verify codex-specific probe paths
    expect(content).toContain('$_GSTACK_ROOT');
    expect(content).toContain('.agents/skills/gstack');  // Priority 2 probe path
    expect(content).toContain('$HOME/.codex/skills/gstack');  // Priority 3 probe path
  });

  // ─── Path rewriting regression tests ─────────────────────────

  test('sidecar paths point to $_GSTACK_ROOT/review/ (runtime-resolved)', () => {
    const content = fs.readFileSync(path.join(CODEX_DIR, 'review', 'SKILL.md'), 'utf-8');
    // All hosts now use $_GSTACK_ROOT — sidecar files use runtime-resolved paths
    expect(content).toContain('$_GSTACK_ROOT/review/checklist.md');
    expect(content).toContain('$_GSTACK_ROOT/review/design-checklist.md');
    // Wrong: must NOT reference dist/codex/gstack/review/ (directory does not exist in output)
    expect(content).not.toContain('dist/codex/gstack/review/checklist.md');
    expect(content).not.toContain('dist/codex/gstack/review/design-checklist.md');
  });

  test('sidecar paths in ship skill point to review/ for pre-landing review', () => {
    const content = fs.readFileSync(path.join(CODEX_DIR, 'ship', 'SKILL.md'), 'utf-8');
    // Ship references the review checklist in its pre-landing review step
    if (content.includes('checklist.md')) {
      expect(content).toContain('$_GSTACK_ROOT/review/');
      expect(content).not.toContain('dist/codex/gstack/review/checklist');
    }
  });

  test('greptile-triage sidecar path is correct', () => {
    const content = fs.readFileSync(path.join(CODEX_DIR, 'review', 'SKILL.md'), 'utf-8');
    if (content.includes('greptile-triage')) {
      expect(content).toContain('$_GSTACK_ROOT/review/greptile-triage.md');
      expect(content).not.toContain('dist/codex/gstack/review/greptile-triage');
    }
  });

  test('all four path rewrite rules produce correct output', () => {
    // Test each of the 4 path rewrite rules individually
    const content = fs.readFileSync(path.join(CODEX_DIR, 'review', 'SKILL.md'), 'utf-8');

    // Rule 1: ~/.claude/skills/gstack → $_GSTACK_ROOT (runtime probe)
    expect(content).not.toContain('~/.claude/skills/gstack');
    expect(content).toContain('$_GSTACK_ROOT');

    // Rule 2: .claude/skills/gstack → dist/codex/gstack (only in non-probe contexts)
    // Note: .claude/skills/gstack shouldn't appear as it gets replaced
    expect(content).not.toContain('~/.claude/skills/gstack');

    // Rule 3: .claude/skills/review → $_GSTACK_ROOT/review
    expect(content).not.toContain('.claude/skills/review');

    // Rule 4: .claude/skills → $_GSTACK_ROOT (catch-all)
    expect(content).not.toContain('~/.claude/skills');
  });

  test('path rewrite rules apply to all Codex skills with sidecar references', () => {
    // Verify across ALL generated skills, not just review
    for (const skill of CODEX_SKILLS) {
      const content = fs.readFileSync(path.join(CODEX_DIR, skill.codexName, 'SKILL.md'), 'utf-8');
      // No skill should reference Claude paths
      expect(content).not.toContain('~/.claude/skills');
      expect(content).not.toContain('.claude/skills');
      // If a skill references checklist.md, it must use the correct sidecar path
      if (content.includes('checklist.md') && !content.includes('design-checklist.md')) {
        expect(content).not.toContain('gstack/review/checklist.md');
      }
    }
  });

  // ─── Brand isolation tests ─────────────────────────────────

  test('Codex uses correct brand names', () => {
    const content = fs.readFileSync(path.join(CODEX_DIR, 'gstack', 'SKILL.md'), 'utf-8');
    // Should use Codex+gstack brand name
    expect(content).toContain('Codex+gstack');
    // Should NOT contain CC+gstack or CodeBuddy+gstack
    expect(content).not.toContain('CC+gstack');
    expect(content).not.toContain('CodeBuddy+gstack');
  });

  test('no "Claude Code" or "claude.com" in Codex output', () => {
    for (const skill of CODEX_SKILLS) {
      const content = fs.readFileSync(path.join(CODEX_DIR, skill.codexName, 'SKILL.md'), 'utf-8');
      expect(content).not.toMatch(/\bClaude Code\b/);
      expect(content).not.toContain('claude.com');
    }
  });

  test('Codex uses correct co-author trailer', () => {
    const content = fs.readFileSync(path.join(CODEX_DIR, 'ship', 'SKILL.md'), 'utf-8');
    if (content.includes('Co-Authored-By')) {
      expect(content).toContain('Co-Authored-By: Codex');
      expect(content).not.toContain('Co-Authored-By: Claude');
    }
  });

  test('no standalone "CC" short brand in Codex output', () => {
    for (const skill of CODEX_SKILLS) {
      const content = fs.readFileSync(path.join(CODEX_DIR, skill.codexName, 'SKILL.md'), 'utf-8');
      // Should not contain "/ CC: ~" or "shortcut with CC" or "seconds with CC"
      expect(content).not.toContain('/ CC: ~');
      expect(content).not.toMatch(/shortcut with CC[,.]/);
      expect(content).not.toMatch(/seconds with CC\./);
    }
  });

  // ─── Claude output regression guard ─────────────────────────

  test('Claude output unchanged: review skill uses $_GSTACK_ROOT with .claude probe paths', () => {
    // Claude now uses $_GSTACK_ROOT probe chain with .claude/skills paths
    const content = readClaudeSkill('review');
    expect(content).toContain('.claude/skills/gstack');  // probe chain references
    expect(content).toContain('$_GSTACK_ROOT');  // runtime variable
    // Must NOT contain Codex-specific paths (state dir detection loop may reference all hosts)
    expect(content).not.toContain('~/.codex/');
  });

  test('Claude output unchanged: ship skill uses $_GSTACK_ROOT with .claude probe paths', () => {
    const content = readClaudeSkill('ship');
    expect(content).toContain('.claude/skills');  // probe chain references
    expect(content).toContain('$_GSTACK_ROOT');  // runtime variable
    // State dir detection loop legitimately references all host paths
    // Only check that Codex-specific ~/.codex/ paths don't appear
    expect(content).not.toContain('~/.codex/');
  });

  test('Claude output unchanged: all Claude skills have zero Codex-specific paths', () => {
    for (const skill of ALL_SKILLS) {
      const content = readClaudeSkill(skill.dir);
      expect(content).not.toContain('~/.codex/');
      // .agents/skills may appear in state dir detection for loops — that's OK
    }
  });
});

// ─── CodeBuddy Generation Tests ─────────────────────────────

describe('CodeBuddy generation (--host codebuddy)', () => {
  const CODEBUDDY_DIR = path.join(ROOT, 'dist', 'codebuddy');

  // Dynamic discovery of expected CodeBuddy skills: all templates except /codex
  const CODEBUDDY_SKILLS = (() => {
    const skills: Array<{ dir: string; codebuddyName: string }> = [];
    const skillTemplatesDir = path.join(ROOT, 'skill-templates');
    if (fs.existsSync(path.join(skillTemplatesDir, 'SKILL.md.tmpl'))) {
      skills.push({ dir: '.', codebuddyName: 'gstack' });
    }
    for (const entry of fs.readdirSync(skillTemplatesDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      if (entry.name === 'codex') continue; // /codex is excluded from CodeBuddy output
      if (!fs.existsSync(path.join(skillTemplatesDir, entry.name, 'SKILL.md.tmpl'))) continue;
      const codebuddyName = entry.name.startsWith('gstack-') ? entry.name.slice('gstack-'.length) : entry.name;
      skills.push({ dir: entry.name, codebuddyName });
    }
    // Also check ROOT for non-skill-templates directories (e.g., browse/)
    for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'skill-templates') continue;
      if (entry.name === 'codex') continue;
      if (!fs.existsSync(path.join(ROOT, entry.name, 'SKILL.md.tmpl'))) continue;
      const codebuddyName = entry.name.startsWith('gstack-') ? entry.name.slice('gstack-'.length) : entry.name;
      skills.push({ dir: entry.name, codebuddyName });
    }
    return skills;
  })();

  test('--host codebuddy generates correct output paths', () => {
    for (const skill of CODEBUDDY_SKILLS) {
      const skillMd = path.join(CODEBUDDY_DIR, skill.codebuddyName, 'SKILL.md');
      expect(fs.existsSync(skillMd)).toBe(true);
    }
  });

  test('codebuddySkillName mapping: root is gstack, others use dir name directly', () => {
    // Root → gstack
    expect(fs.existsSync(path.join(CODEBUDDY_DIR, 'gstack', 'SKILL.md'))).toBe(true);
    // Subdirectories → {dir} (no prefix)
    expect(fs.existsSync(path.join(CODEBUDDY_DIR, 'review', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(CODEBUDDY_DIR, 'ship', 'SKILL.md'))).toBe(true);
    // Old gstack-prefixed dirs must NOT exist
    expect(fs.existsSync(path.join(CODEBUDDY_DIR, 'gstack-review', 'SKILL.md'))).toBe(false);
  });

  test('CodeBuddy frontmatter has name + description + allowed-tools (no version, no hooks)', () => {
    for (const skill of CODEBUDDY_SKILLS) {
      const content = fs.readFileSync(path.join(CODEBUDDY_DIR, skill.codebuddyName, 'SKILL.md'), 'utf-8');
      expect(content.startsWith('---\n')).toBe(true);
      const fmEnd = content.indexOf('\n---', 4);
      expect(fmEnd).toBeGreaterThan(0);
      const frontmatter = content.slice(4, fmEnd);
      // Must have name and description
      expect(frontmatter).toContain('name:');
      expect(frontmatter).toContain('description:');
      // Must NOT have version or hooks (those are Claude Code-specific)
      expect(frontmatter).not.toContain('version:');
      expect(frontmatter).not.toContain('hooks:');
    }
  });

  test('CodeBuddy frontmatter retains allowed-tools when present in template', () => {
    // review and ship skills have allowed-tools in their templates
    const reviewContent = fs.readFileSync(path.join(CODEBUDDY_DIR, 'review', 'SKILL.md'), 'utf-8');
    const fmEnd = reviewContent.indexOf('\n---', 4);
    const frontmatter = reviewContent.slice(4, fmEnd);
    expect(frontmatter).toContain('allowed-tools:');
  });

  test('no .claude/skills/ in CodeBuddy output', () => {
    for (const skill of CODEBUDDY_SKILLS) {
      const content = fs.readFileSync(path.join(CODEBUDDY_DIR, skill.codebuddyName, 'SKILL.md'), 'utf-8');
      expect(content).not.toContain('.claude/skills');
    }
  });

  test('no ~/.claude/ paths in CodeBuddy output', () => {
    for (const skill of CODEBUDDY_SKILLS) {
      const content = fs.readFileSync(path.join(CODEBUDDY_DIR, skill.codebuddyName, 'SKILL.md'), 'utf-8');
      expect(content).not.toContain('~/.claude/');
    }
  });

  test('no ~/.codex/ paths in CodeBuddy output', () => {
    for (const skill of CODEBUDDY_SKILLS) {
      const content = fs.readFileSync(path.join(CODEBUDDY_DIR, skill.codebuddyName, 'SKILL.md'), 'utf-8');
      expect(content).not.toContain('~/.codex/');
    }
  });

  test('/codex skill excluded from CodeBuddy output', () => {
    expect(fs.existsSync(path.join(CODEBUDDY_DIR, 'codex', 'SKILL.md'))).toBe(false);
    expect(fs.existsSync(path.join(CODEBUDDY_DIR, 'codex'))).toBe(false);
  });

  test('--host codebuddy --dry-run freshness', () => {
    const result = Bun.spawnSync(['bun', 'run', 'scripts/gen-skill-docs.ts', '--host', 'codebuddy', '--dry-run'], {
      cwd: ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode).toBe(0);
    const output = result.stdout.toString();
    // Every CodeBuddy skill should be FRESH
    for (const skill of CODEBUDDY_SKILLS) {
      expect(output).toContain(`FRESH: dist/codebuddy/${skill.codebuddyName}/SKILL.md`);
    }
    expect(output).not.toContain('STALE');
  });

  test('multiline descriptions preserved in CodeBuddy output', () => {
    // office-hours has a multiline description — verify it survives the frontmatter transform
    const content = fs.readFileSync(path.join(CODEBUDDY_DIR, 'office-hours', 'SKILL.md'), 'utf-8');
    const fmEnd = content.indexOf('\n---', 4);
    const frontmatter = content.slice(4, fmEnd);
    // Description should span multiple lines (block scalar)
    const descLines = frontmatter.split('\n').filter(l => l.startsWith('  '));
    expect(descLines.length).toBeGreaterThan(1);
    // Verify key phrases survived
    expect(frontmatter).toContain('YC Office Hours');
  });

  test('hook skills have safety prose and no hooks: in frontmatter', () => {
    const HOOK_SKILLS = ['careful', 'freeze', 'guard'];
    for (const skillName of HOOK_SKILLS) {
      const content = fs.readFileSync(path.join(CODEBUDDY_DIR, skillName, 'SKILL.md'), 'utf-8');
      // Must have safety advisory prose
      expect(content).toContain('Safety Advisory');
      // Must NOT have hooks: in frontmatter
      const fmEnd = content.indexOf('\n---', 4);
      const frontmatter = content.slice(4, fmEnd);
      expect(frontmatter).not.toContain('hooks:');
    }
  });

  test('all CodeBuddy SKILL.md files have auto-generated header', () => {
    for (const skill of CODEBUDDY_SKILLS) {
      const content = fs.readFileSync(path.join(CODEBUDDY_DIR, skill.codebuddyName, 'SKILL.md'), 'utf-8');
      expect(content).toContain('AUTO-GENERATED from SKILL.md.tmpl');
      expect(content).toContain('Regenerate: bun run gen:skill-docs');
    }
  });

  test('CodeBuddy preamble uses codebuddy paths', () => {
    // Check a skill that has a preamble (review is a good candidate)
    const content = fs.readFileSync(path.join(CODEBUDDY_DIR, 'review', 'SKILL.md'), 'utf-8');
    // All hosts use $_GSTACK_ROOT probe chain — verify codebuddy-specific probe paths
    expect(content).toContain('$_GSTACK_ROOT');
    expect(content).toContain('.codebuddy/skills/gstack');  // Priority 2 probe path
    expect(content).toContain('$HOME/.codebuddy/skills/gstack');  // Priority 3 probe path
  });

  test('CodeBuddy uses correct brand names', () => {
    const content = fs.readFileSync(path.join(CODEBUDDY_DIR, 'gstack', 'SKILL.md'), 'utf-8');
    // Should use CodeBuddy+gstack brand name
    expect(content).toContain('CodeBuddy+gstack');
    // Should NOT contain CC+gstack or Codex+gstack
    expect(content).not.toContain('CC+gstack');
    expect(content).not.toContain('Codex+gstack');
  });

  test('no "Claude Code" or "claude.com" in CodeBuddy output', () => {
    for (const skill of CODEBUDDY_SKILLS) {
      const content = fs.readFileSync(path.join(CODEBUDDY_DIR, skill.codebuddyName, 'SKILL.md'), 'utf-8');
      expect(content).not.toMatch(/\bClaude Code\b/);
      expect(content).not.toContain('claude.com');
    }
  });

  test('CodeBuddy uses correct co-author trailer', () => {
    const content = fs.readFileSync(path.join(CODEBUDDY_DIR, 'ship', 'SKILL.md'), 'utf-8');
    if (content.includes('Co-Authored-By')) {
      expect(content).toContain('Co-Authored-By: CodeBuddy');
      expect(content).not.toContain('Co-Authored-By: Claude');
    }
  });

  test('no standalone "CC" short brand in CodeBuddy output', () => {
    for (const skill of CODEBUDDY_SKILLS) {
      const content = fs.readFileSync(path.join(CODEBUDDY_DIR, skill.codebuddyName, 'SKILL.md'), 'utf-8');
      // Should not contain "/ CC: ~" or "shortcut with CC" or "seconds with CC"
      expect(content).not.toContain('/ CC: ~');
      expect(content).not.toMatch(/shortcut with CC[,.]/);
      expect(content).not.toMatch(/seconds with CC\./);
    }
  });

  // ─── Path rewriting regression tests ─────────────────────────

  test('sidecar paths point to $_GSTACK_ROOT/review/ (self-adaptive paths)', () => {
    const content = fs.readFileSync(path.join(CODEBUDDY_DIR, 'review', 'SKILL.md'), 'utf-8');
    // Phase 6B: CodeBuddy uses $_GSTACK_ROOT for self-adaptive path detection
    expect(content).toContain('$_GSTACK_ROOT/review/checklist.md');
    expect(content).toContain('$_GSTACK_ROOT/review/design-checklist.md');
    // Wrong: must NOT reference hardcoded dist/ paths or gstack/review/ (directory does not exist in output)
    expect(content).not.toContain('dist/codebuddy/review/checklist.md');
    expect(content).not.toContain('dist/codebuddy/review/design-checklist.md');
    expect(content).not.toContain('dist/codebuddy/gstack/review/checklist.md');
    expect(content).not.toContain('dist/codebuddy/gstack/review/design-checklist.md');
  });

  test('sidecar paths in ship skill point to $_GSTACK_ROOT/review/ for pre-landing review', () => {
    const content = fs.readFileSync(path.join(CODEBUDDY_DIR, 'ship', 'SKILL.md'), 'utf-8');
    // Ship references the review checklist in its pre-landing review step
    if (content.includes('checklist.md')) {
      expect(content).toContain('$_GSTACK_ROOT/review/');
      expect(content).not.toContain('dist/codebuddy/review/');
      expect(content).not.toContain('dist/codebuddy/gstack/review/checklist');
    }
  });

  test('greptile-triage sidecar path is correct', () => {
    const content = fs.readFileSync(path.join(CODEBUDDY_DIR, 'review', 'SKILL.md'), 'utf-8');
    if (content.includes('greptile-triage')) {
      expect(content).toContain('$_GSTACK_ROOT/review/greptile-triage.md');
      expect(content).not.toContain('dist/codebuddy/review/greptile-triage');
      expect(content).not.toContain('dist/codebuddy/gstack/review/greptile-triage');
    }
  });

  test('all four path rewrite rules produce correct output', () => {
    // Test each of the 4 path rewrite rules individually
    const content = fs.readFileSync(path.join(CODEBUDDY_DIR, 'review', 'SKILL.md'), 'utf-8');

    // Rule 1: ~/.claude/skills/gstack → $_GSTACK_ROOT (runtime probe)
    expect(content).not.toContain('~/.claude/skills/gstack');
    expect(content).toContain('$_GSTACK_ROOT');

    // Rule 2: .claude/skills/gstack → handled via probe chain
    expect(content).not.toContain('~/.claude/skills/gstack');

    // Rule 3: .claude/skills/review → $_GSTACK_ROOT/review
    expect(content).not.toContain('.claude/skills/review');

    // Rule 4: .claude/skills → $_GSTACK_ROOT (catch-all)
    expect(content).not.toContain('~/.claude/skills');
  });

  test('path rewrite rules apply to all CodeBuddy skills with sidecar references', () => {
    // Verify across ALL generated skills, not just review
    for (const skill of CODEBUDDY_SKILLS) {
      const content = fs.readFileSync(path.join(CODEBUDDY_DIR, skill.codebuddyName, 'SKILL.md'), 'utf-8');
      // No skill should reference Claude or Codex paths
      expect(content).not.toContain('~/.claude/skills');
      expect(content).not.toContain('.claude/skills');
      expect(content).not.toContain('~/.codex/skills');
      // If a skill references checklist.md, it must use the correct sidecar path
      if (content.includes('checklist.md') && !content.includes('design-checklist.md')) {
        expect(content).not.toContain('gstack/review/checklist.md');
      }
    }
  });

  // ─── Claude + Codex output regression guard ─────────────────

  test('Claude output unchanged: review skill uses $_GSTACK_ROOT with .claude probe', () => {
    // CodeBuddy changes must NOT affect Claude output
    const content = readClaudeSkill('review');
    expect(content).toContain('.claude/skills');  // probe chain references
    expect(content).toContain('$_GSTACK_ROOT');
    // Must NOT contain CodeBuddy paths
    expect(content).not.toContain('~/.codebuddy/');
    expect(content).not.toContain('dist/codebuddy/');
  });

  test('Claude output unchanged: all Claude skills have zero CodeBuddy paths', () => {
    for (const skill of ALL_SKILLS) {
      const content = readClaudeSkill(skill.dir);
      expect(content).not.toContain('~/.codebuddy/');
      expect(content).not.toContain('dist/codebuddy/');
    }
  });

  test('Codex output unchanged: review skill uses $_GSTACK_ROOT with .codex probe', () => {
    // CodeBuddy changes must NOT affect Codex output
    const codexContent = fs.readFileSync(path.join(ROOT, 'dist', 'codex', 'review', 'SKILL.md'), 'utf-8');
    expect(codexContent).toContain('$HOME/.codex/skills/gstack');  // probe chain
    expect(codexContent).toContain('$_GSTACK_ROOT');
    // Must NOT contain CodeBuddy paths
    expect(codexContent).not.toContain('~/.codebuddy/');
    expect(codexContent).not.toContain('dist/codebuddy/');
  });
});

// ─── Setup script validation ─────────────────────────────────
// These tests verify the setup script's install layout matches
// what the generator produces — catching the bug where setup
// installed Claude-format source dirs for Codex users.

describe('setup script validation', () => {
  const setupContent = fs.readFileSync(path.join(ROOT, 'setup'), 'utf-8');

  test('setup uses unified install_copy function for all hosts', () => {
    expect(setupContent).toContain('install_copy()');
    // Old per-host link functions must not exist
    expect(setupContent).not.toContain('link_claude_skill_dirs');
    expect(setupContent).not.toContain('link_codex_skill_dirs');
    expect(setupContent).not.toContain('link_codebuddy_skill_dirs');
    expect(setupContent).not.toContain('create_agents_sidecar');
    expect(setupContent).not.toMatch(/^link_skill_dirs\(\)/m);
  });

  test('install_copy validates dist/ structure and copies skills', () => {
    const fnStart = setupContent.indexOf('install_copy()');
    const fnEnd = setupContent.indexOf('}', setupContent.indexOf('installed[@]}', fnStart));
    const fnBody = setupContent.slice(fnStart, fnEnd);
    expect(fnBody).toContain('dist/$host');
    expect(fnBody).toContain('SKILL.md');
    expect(fnBody).toContain('cp -R');
    // Must not contain any symlink commands
    expect(fnBody).not.toContain('ln -snf');
    expect(fnBody).not.toContain('ln -sf');
  });

  test('Claude install uses install_copy', () => {
    const claudeSection = setupContent.slice(
      setupContent.indexOf('# 4. Install for Claude'),
      setupContent.indexOf('# 5. Install for Codex')
    );
    expect(claudeSection).toContain('install_copy "claude"');
    expect(claudeSection).not.toContain('ln -snf');
  });

  test('Codex install uses install_copy', () => {
    const codexSection = setupContent.slice(
      setupContent.indexOf('# 5. Install for Codex'),
      setupContent.indexOf('# 6. Install for CodeBuddy')
    );
    expect(codexSection).toContain('install_copy "codex"');
    expect(codexSection).not.toContain('ln -snf');
  });

  test('CodeBuddy install uses install_copy', () => {
    const codebuddySection = setupContent.slice(
      setupContent.indexOf('# 6. Install for CodeBuddy'),
      setupContent.indexOf('# 7. First-time')
    );
    expect(codebuddySection).toContain('install_copy "codebuddy"');
    expect(codebuddySection).not.toContain('ln -snf');
  });

  test('setup supports --host claude|codex|codebuddy', () => {
    expect(setupContent).toContain('--host');
    expect(setupContent).toContain('claude|codex|codebuddy');
    // auto mode has been removed — all installs must be explicit
    expect(setupContent).not.toContain('auto');
  });

  test('no symlink commands in install sections', () => {
    // After the install_copy function definition, no section should use symlinks
    const installSections = setupContent.slice(
      setupContent.indexOf('# 4. Install for Claude')
    );
    expect(installSections).not.toContain('ln -snf');
    expect(installSections).not.toContain('ln -sf');
  });

  test('--mode flag is fully removed (not just deprecated)', () => {
    expect(setupContent).not.toContain('--mode');
  });

  test('CodeBuddy install targets ~/.codebuddy/skills/', () => {
    const codebuddySection = setupContent.slice(
      setupContent.indexOf('# 6. Install for CodeBuddy'),
      setupContent.indexOf('# 7. First-time')
    );
    expect(codebuddySection).toContain('$HOME/.codebuddy/skills');
    // Must NOT reference Claude or Codex paths
    expect(codebuddySection).not.toContain('$HOME/.claude/');
    expect(codebuddySection).not.toContain('$HOME/.codex/');
  });
});

describe('telemetry', () => {
  test('generated SKILL.md contains telemetry start block', () => {
    const content = readClaudeSkill('.');
    expect(content).toContain('_TEL_START');
    expect(content).toContain('_SESSION_ID');
    expect(content).toContain('TELEMETRY:');
    expect(content).toContain('TEL_PROMPTED:');
    expect(content).toContain('gstack-config get telemetry');
  });

  test('generated SKILL.md contains telemetry opt-in prompt', () => {
    const content = readClaudeSkill('.');
    expect(content).toContain('.telemetry-prompted');
    expect(content).toContain('anonymous usage data');
    expect(content).toContain('gstack-config set telemetry anonymous');
    expect(content).toContain('gstack-config set telemetry off');
  });

  test('generated SKILL.md contains telemetry epilogue', () => {
    const content = readClaudeSkill('.');
    expect(content).toContain('Telemetry (run last)');
    expect(content).toContain('gstack-telemetry-log');
    expect(content).toContain('_TEL_END');
    expect(content).toContain('_TEL_DUR');
    expect(content).toContain('SKILL_NAME');
    expect(content).toContain('OUTCOME');
  });

  test('generated SKILL.md contains pending marker handling', () => {
    const content = readClaudeSkill('.');
    expect(content).toContain('.pending');
    expect(content).toContain('_pending_finalize');
  });

  test('telemetry blocks appear in all skill files that use PREAMBLE', () => {
    const skills = ['qa', 'ship', 'review', 'plan-ceo-review', 'plan-eng-review', 'retro'];
    for (const skill of skills) {
      const name = skill.startsWith('gstack-') ? skill.slice('gstack-'.length) : skill;
      const skillPath = path.join(ROOT, 'dist', 'claude', name, 'SKILL.md');
      if (fs.existsSync(skillPath)) {
        const content = fs.readFileSync(skillPath, 'utf-8');
        expect(content).toContain('_TEL_START');
        expect(content).toContain('Telemetry (run last)');
      }
    }
  });
});

// ─── Phase 1.3: New Resolver Tests ──────────────────────────

describe('CONFIDENCE_CALIBRATION resolver', () => {
  // Import resolver directly for unit testing
  const { generateConfidenceCalibration } = require('../scripts/resolvers/confidence') as typeof import('../scripts/resolvers/confidence');
  const { HOST_PATHS } = require('../scripts/resolvers/types') as typeof import('../scripts/resolvers/types');

  const mockCtx = { skillName: 'review', tmplPath: '', host: 'claude' as const, paths: HOST_PATHS['claude'] };

  test('output contains scoring guide', () => {
    const output = generateConfidenceCalibration(mockCtx);
    expect(output).toContain('Confidence Calibration');
    expect(output).toContain('confidence score from 1-10');
    expect(output).toContain('9-10');
    expect(output).toContain('7-8');
    expect(output).toContain('5-6');
    expect(output).toContain('3-4');
    expect(output).toContain('1-2');
  });

  test('output contains display rules', () => {
    const output = generateConfidenceCalibration(mockCtx);
    expect(output).toContain('Display rules');
    expect(output).toContain('7+ confidence');
    expect(output).toContain('5-6 confidence');
    expect(output).toContain('Below 5');
    expect(output).toContain('Suppress it silently');
  });

  test('output contains anti-patterns', () => {
    const output = generateConfidenceCalibration(mockCtx);
    expect(output).toContain('Anti-patterns');
    expect(output).toContain('❌');
  });

  test('output contains calibration check', () => {
    const output = generateConfidenceCalibration(mockCtx);
    expect(output).toContain('Calibration check');
    expect(output).toContain('30%');
  });

  test('output does not contain telemetry references', () => {
    const output = generateConfidenceCalibration(mockCtx);
    expect(output.toLowerCase()).not.toContain('telemetry');
  });
});

describe('INVOKE_SKILL resolver', () => {
  const { generateInvokeSkill } = require('../scripts/resolvers/composition') as typeof import('../scripts/resolvers/composition');
  const { HOST_PATHS } = require('../scripts/resolvers/types') as typeof import('../scripts/resolvers/types');

  test('throws when no args provided', () => {
    const ctx = { skillName: 'plan-ceo-review', tmplPath: '', host: 'claude' as const, paths: HOST_PATHS['claude'] };
    expect(() => generateInvokeSkill(ctx)).toThrow('requires at least one argument');
    expect(() => generateInvokeSkill(ctx, [])).toThrow('requires at least one argument');
  });

  test('generates inline skill invocation for named skill', () => {
    const ctx = { skillName: 'plan-ceo-review', tmplPath: '', host: 'claude' as const, paths: HOST_PATHS['claude'] };
    const output = generateInvokeSkill(ctx, ['office-hours']);
    expect(output).toContain('Inline Skill: /office-hours');
    expect(output).toContain('/office-hours');
    expect(output).toContain('FOUND');
    expect(output).toContain('Skip these sections');
    // Default skip sections should be present
    expect(output).toContain('Preamble');
    expect(output).toContain('Completeness Principle');
    expect(output).toContain('Error Handling');
  });

  test('includes extra skip sections from skip= parameter', () => {
    const ctx = { skillName: 'autoplan', tmplPath: '', host: 'claude' as const, paths: HOST_PATHS['claude'] };
    const output = generateInvokeSkill(ctx, ['office-hours', 'skip=Design Mockup,Landscape Awareness']);
    expect(output).toContain('Design Mockup');
    expect(output).toContain('Landscape Awareness');
    // Default sections should still be included
    expect(output).toContain('Preamble');
  });

  test('uses host-specific paths for claude', () => {
    const ctx = { skillName: 'test', tmplPath: '', host: 'claude' as const, paths: HOST_PATHS['claude'] };
    const output = generateInvokeSkill(ctx, ['office-hours']);
    expect(output).toContain('$HOME/.claude/skills/office-hours/SKILL.md');
    expect(output).not.toContain('$HOME/.codebuddy/');
    expect(output).not.toContain('$HOME/.codex/');
  });

  test('uses host-specific paths for codex', () => {
    const ctx = { skillName: 'test', tmplPath: '', host: 'codex' as const, paths: HOST_PATHS['codex'] };
    const output = generateInvokeSkill(ctx, ['office-hours']);
    expect(output).toContain('$HOME/.agents/skills/office-hours/SKILL.md');
    expect(output).not.toContain('$HOME/.codebuddy/');
    expect(output).not.toContain('$HOME/.claude/');
  });

  test('uses host-specific paths for codebuddy', () => {
    const ctx = { skillName: 'test', tmplPath: '', host: 'codebuddy' as const, paths: HOST_PATHS['codebuddy'] };
    const output = generateInvokeSkill(ctx, ['office-hours']);
    expect(output).toContain('$HOME/.codebuddy/skills/office-hours/SKILL.md');
    expect(output).not.toContain('$HOME/.claude/');
    expect(output).not.toContain('$HOME/.codex/');
  });

  test('default skip sections do not include telemetry', () => {
    const ctx = { skillName: 'test', tmplPath: '', host: 'claude' as const, paths: HOST_PATHS['claude'] };
    const output = generateInvokeSkill(ctx, ['office-hours']);
    // Output should not contain "Telemetry" in the skip sections list
    // (we stripped it from DEFAULT_SKIP_SECTIONS per upstream-sync-rules)
    const skipLine = output.split('\n').find(l => l.includes('Skip these sections'));
    expect(skipLine).toBeDefined();
    expect(skipLine!.toLowerCase()).not.toContain('telemetry');
  });
});

describe('BENEFITS_FROM resolver', () => {
  const { generateBenefitsFrom } = require('../scripts/resolvers/review') as typeof import('../scripts/resolvers/review');
  const { HOST_PATHS } = require('../scripts/resolvers/types') as typeof import('../scripts/resolvers/types');

  test('returns empty string when benefitsFrom is undefined', () => {
    const ctx = { skillName: 'test', tmplPath: '', host: 'claude' as const, paths: HOST_PATHS['claude'] };
    expect(generateBenefitsFrom(ctx)).toBe('');
  });

  test('returns empty string when benefitsFrom is empty array', () => {
    const ctx = { skillName: 'test', tmplPath: '', host: 'claude' as const, paths: HOST_PATHS['claude'], benefitsFrom: [] };
    expect(generateBenefitsFrom(ctx)).toBe('');
  });

  test('generates Prerequisite Skill Offer when benefitsFrom has items', () => {
    const ctx = { skillName: 'autoplan', tmplPath: '', host: 'claude' as const, paths: HOST_PATHS['claude'], benefitsFrom: ['office-hours'] };
    const output = generateBenefitsFrom(ctx);
    expect(output).toContain('## Prerequisite Skill Offer');
    expect(output).toContain('`/office-hours`');
    expect(output).toContain('A) Run /office-hours now');
    expect(output).toContain('B) Skip');
  });

  test('uses ctx.paths.binDir for remote-slug path (not hardcoded)', () => {
    const ctx = { skillName: 'autoplan', tmplPath: '', host: 'claude' as const, paths: HOST_PATHS['claude'], benefitsFrom: ['office-hours'] };
    const output = generateBenefitsFrom(ctx);
    expect(output).toContain(`${HOST_PATHS['claude'].binDir}/remote-slug`);
    expect(output).not.toContain('~/.claude/skills/gstack/browse/bin/remote-slug');
  });

  test('includes INVOKE_SKILL sub-expansion', () => {
    const ctx = { skillName: 'autoplan', tmplPath: '', host: 'claude' as const, paths: HOST_PATHS['claude'], benefitsFrom: ['office-hours'] };
    const output = generateBenefitsFrom(ctx);
    expect(output).toContain('Inline Skill: /office-hours');
    expect(output).toContain('office-hours/SKILL.md');
  });

  test('includes zsh compat and design doc re-check', () => {
    const ctx = { skillName: 'autoplan', tmplPath: '', host: 'claude' as const, paths: HOST_PATHS['claude'], benefitsFrom: ['office-hours'] };
    const output = generateBenefitsFrom(ctx);
    expect(output).toContain('setopt +o nomatch');
    expect(output).toContain('Design doc found');
  });

  test('uses codebuddy paths for codebuddy host', () => {
    const ctx = { skillName: 'autoplan', tmplPath: '', host: 'codebuddy' as const, paths: HOST_PATHS['codebuddy'], benefitsFrom: ['office-hours'] };
    const output = generateBenefitsFrom(ctx);
    expect(output).toContain(`${HOST_PATHS['codebuddy'].binDir}/remote-slug`);
    expect(output).not.toContain('~/.claude/');
  });

  test('includes do-not-re-offer instruction', () => {
    const ctx = { skillName: 'autoplan', tmplPath: '', host: 'claude' as const, paths: HOST_PATHS['claude'], benefitsFrom: ['office-hours'] };
    const output = generateBenefitsFrom(ctx);
    expect(output).toContain('Do not re-offer later in the session');
  });
});

describe('Parameterized placeholder syntax', () => {
  test('gen-skill-docs.ts regex matches simple placeholders', () => {
    const regex = /\{\{(\w+(?::[^}]*)?)\}\}/g;
    const match = regex.exec('{{PREAMBLE}}');
    expect(match).not.toBeNull();
    expect(match![1]).toBe('PREAMBLE');
  });

  test('gen-skill-docs.ts regex matches parameterized placeholders', () => {
    const regex = /\{\{(\w+(?::[^}]*)?)\}\}/g;
    const match = regex.exec('{{INVOKE_SKILL:office-hours}}');
    expect(match).not.toBeNull();
    expect(match![1]).toBe('INVOKE_SKILL:office-hours');
  });

  test('gen-skill-docs.ts regex matches multi-arg placeholders', () => {
    const regex = /\{\{(\w+(?::[^}]*)?)\}\}/g;
    const match = regex.exec('{{INVOKE_SKILL:office-hours:skip=Preamble,SETUP}}');
    expect(match).not.toBeNull();
    expect(match![1]).toBe('INVOKE_SKILL:office-hours:skip=Preamble,SETUP');
  });

  test('parameterized placeholder parses name and args correctly', () => {
    const expr = 'INVOKE_SKILL:office-hours:skip=Preamble,SETUP';
    const parts = expr.split(':');
    expect(parts[0]).toBe('INVOKE_SKILL');
    expect(parts.slice(1)).toEqual(['office-hours', 'skip=Preamble,SETUP']);
  });
});

describe('codex-helpers module', () => {
  const {
    codexBinaryDetect,
    codexReviewBlock,
    codexAdversarialBlock,
    crossModelAnalysis,
    codexPlanReviewBlock,
    codexReviewPersist,
    codexErrorHandling,
  } = require('../scripts/resolvers/codex-helpers') as typeof import('../scripts/resolvers/codex-helpers');
  const { HOST_PATHS } = require('../scripts/resolvers/types') as typeof import('../scripts/resolvers/types');

  test('codexBinaryDetect generates detection snippet', () => {
    const output = codexBinaryDetect();
    expect(output).toContain('which codex');
    expect(output).toContain('CODEX_NOT_FOUND');
    expect(output).toContain('CODEX_FOUND');
    expect(output).toContain('optional');
  });

  test('codexReviewBlock generates review command', () => {
    const output = codexReviewBlock();
    expect(output).toContain('codex review');
    expect(output).toContain('--base <base>');
    expect(output).toContain('[P1]');
    expect(output).toContain('GATE: PASS/FAIL');
    expect(output).toContain('CODEX SAYS (code review)');
  });

  test('codexAdversarialBlock generates adversarial command', () => {
    const output = codexAdversarialBlock();
    expect(output).toContain('codex exec');
    expect(output).toContain('adversarial');
    expect(output).toContain('chaos engineer');
    expect(output).toContain('read-only');
    expect(output).toContain('CODEX SAYS (adversarial challenge)');
  });

  test('crossModelAnalysis uses host-specific platform name', () => {
    const claudeCtx = { skillName: 'review', tmplPath: '', host: 'claude' as const, paths: HOST_PATHS['claude'] };
    const output = crossModelAnalysis(claudeCtx);
    expect(output).toContain('Claude Code');
    expect(output).toContain('Cross-model');
    expect(output).toContain('Agreement rate');

    const codebuddyCtx = { skillName: 'review', tmplPath: '', host: 'codebuddy' as const, paths: HOST_PATHS['codebuddy'] };
    const cbOutput = crossModelAnalysis(codebuddyCtx);
    expect(cbOutput).toContain('CodeBuddy');
    expect(cbOutput).not.toContain('Claude Code');
  });

  test('codexPlanReviewBlock generates plan review command', () => {
    const output = codexPlanReviewBlock();
    expect(output).toContain('codex exec');
    expect(output).toContain('plan-file-path');
    expect(output).toContain('read-only');
    expect(output).toContain('CODEX SAYS (plan review)');
  });

  test('codexReviewPersist generates persistence snippet', () => {
    const ctx = { skillName: 'review', tmplPath: '', host: 'claude' as const, paths: HOST_PATHS['claude'] };
    const output = codexReviewPersist(ctx);
    expect(output).toContain('gstack-review-log');
    expect(output).toContain('codex-review');
    expect(output).toContain('ISO 8601');
    expect(output).toContain('adversarial');
  });

  test('codexErrorHandling generates error handling block', () => {
    const output = codexErrorHandling('Codex review');
    expect(output).toContain('non-blocking');
    expect(output).toContain('Auth failure');
    expect(output).toContain('Timeout');
    expect(output).toContain('informational');
  });

  test('no telemetry references in any codex-helpers output', () => {
    const ctx = { skillName: 'test', tmplPath: '', host: 'claude' as const, paths: HOST_PATHS['claude'] };
    const outputs = [
      codexBinaryDetect(),
      codexReviewBlock(),
      codexAdversarialBlock(),
      crossModelAnalysis(ctx),
      codexPlanReviewBlock(),
      codexReviewPersist(ctx),
      codexErrorHandling('test'),
    ];
    for (const output of outputs) {
      expect(output.toLowerCase()).not.toContain('telemetry');
    }
  });
});

// ─── Phase 1.4: Preamble Tier System Tests ──────────────────

describe('Preamble tier system', () => {
  const { generatePreamble } = require('../scripts/resolvers/preamble') as typeof import('../scripts/resolvers/preamble');
  const { HOST_PATHS } = require('../scripts/resolvers/types') as typeof import('../scripts/resolvers/types');

  const makeCtx = (tier?: number) => ({
    skillName: 'test-skill',
    tmplPath: '',
    host: 'claude' as const,
    paths: HOST_PATHS['claude'],
    preambleTier: tier,
  });

  test('tier undefined outputs all sections (backward compatible)', () => {
    const output = generatePreamble(makeCtx(undefined));
    // Must contain all 10 sections (8 original + 2 new)
    expect(output).toContain('## Preamble (run first)');
    expect(output).toContain('PROACTIVE');
    expect(output).toContain('## Voice & Communication Style');
    expect(output).toContain('## Search Before Building');
    expect(output).toContain('Boil the Lake');  // lake intro
    expect(output).toContain('telemetry');       // telemetry prompt
    expect(output).toContain('## AskUserQuestion Format');
    expect(output).toContain('## Completeness Principle');
    expect(output).toContain('## Contributor Mode');
    expect(output).toContain('## Completion Status Protocol');
  });

  test('T1 (minimal) excludes voice, search, lake, telemetry, completeness', () => {
    const output = generatePreamble(makeCtx(1));
    // Must contain minimal sections
    expect(output).toContain('## Preamble (run first)');
    expect(output).toContain('PROACTIVE');
    expect(output).toContain('## AskUserQuestion Format');
    expect(output).toContain('## Contributor Mode');
    expect(output).toContain('## Completion Status Protocol');
    // Must NOT contain T2+ sections
    expect(output).not.toContain('## Voice & Communication Style');
    expect(output).not.toContain('## Search Before Building');
    expect(output).not.toContain('Boil the Lake');
    // generateTelemetryPrompt-specific: the "ask about telemetry" prose (distinct from bash _TEL vars)
    expect(output).not.toContain('ask the user about telemetry');
    expect(output).not.toContain('## Completeness Principle');
  });

  test('T2 (standard) includes all sections', () => {
    const output = generatePreamble(makeCtx(2));
    expect(output).toContain('## Voice & Communication Style');
    expect(output).toContain('## Search Before Building');
    expect(output).toContain('Boil the Lake');
    expect(output).toContain('## Completeness Principle');
    expect(output).toContain('## Contributor Mode');
  });

  test('T3 (enhanced) includes all sections', () => {
    const output = generatePreamble(makeCtx(3));
    expect(output).toContain('## Voice & Communication Style');
    expect(output).toContain('## Search Before Building');
    expect(output).toContain('## Completeness Principle');
  });

  test('T4 (full) includes all sections', () => {
    const output = generatePreamble(makeCtx(4));
    expect(output).toContain('## Voice & Communication Style');
    expect(output).toContain('## Search Before Building');
    expect(output).toContain('## Completeness Principle');
    expect(output).toContain('## Completion Status Protocol');
  });

  test('Voice Directive contains key directives', () => {
    const output = generatePreamble(makeCtx(2));
    expect(output).toContain('No hedging');
    expect(output).toContain('No sycophancy');
    expect(output).toContain('No filler');
    expect(output).toContain('Recommend, don\'t list');
  });

  test('Search Before Building contains key principles', () => {
    const output = generatePreamble(makeCtx(2));
    expect(output).toContain('Find existing patterns');
    expect(output).toContain('Verify assumptions');
  });

  // Host diversity: verify tier logic works across all hosts
  test('T1 minimal exclusion works with host=codex', () => {
    const codexCtx = {
      skillName: 'browse',
      tmplPath: '',
      host: 'codex' as const,
      paths: HOST_PATHS['codex'],
      preambleTier: 1,
    };
    const output = generatePreamble(codexCtx);
    expect(output).toContain('## Preamble (run first)');
    expect(output).not.toContain('## Voice & Communication Style');
    expect(output).not.toContain('## Search Before Building');
    expect(output).not.toContain('## Completeness Principle');
  });

  test('T2 full inclusion works with host=codebuddy', () => {
    const codebuddyCtx = {
      skillName: 'gstack',
      tmplPath: '',
      host: 'codebuddy' as const,
      paths: HOST_PATHS['codebuddy'],
      preambleTier: 2,
    };
    const output = generatePreamble(codebuddyCtx);
    expect(output).toContain('## Voice & Communication Style');
    expect(output).toContain('## Search Before Building');
    expect(output).toContain('## Completeness Principle');
    expect(output).toContain('## Contributor Mode');
    // Verify host-specific paths
    expect(output).toContain('.codebuddy/skills/gstack');
  });
});

describe('SKILL_TIER_MAP completeness', () => {
  const { SKILL_TIER_MAP } = require('../scripts/gen-skill-docs') as typeof import('../scripts/gen-skill-docs');

  test('tier map is exported and contains entries', () => {
    expect(Object.keys(SKILL_TIER_MAP).length).toBeGreaterThan(0);
  });

  test('all tier values are 1-4', () => {
    for (const [_skill, tier] of Object.entries(SKILL_TIER_MAP)) {
      expect(tier).toBeGreaterThanOrEqual(1);
      expect(tier).toBeLessThanOrEqual(4);
    }
  });

  test('browse is T1 (minimal)', () => {
    expect(SKILL_TIER_MAP['browse']).toBe(1);
  });

  test('ship and review are T4 (full)', () => {
    expect(SKILL_TIER_MAP['ship']).toBe(4);
    expect(SKILL_TIER_MAP['review']).toBe(4);
  });

  test('investigate, qa, qa-only are T3 (enhanced)', () => {
    expect(SKILL_TIER_MAP['investigate']).toBe(3);
    expect(SKILL_TIER_MAP['qa']).toBe(3);
    expect(SKILL_TIER_MAP['qa-only']).toBe(3);
  });

  test('gstack root is T2 (standard)', () => {
    expect(SKILL_TIER_MAP['gstack']).toBe(2);
  });

  // Ensure all skills that use PREAMBLE are in the tier map
  test('all PREAMBLE-using skills have a tier mapping', () => {
    const skillTemplatesDir = path.join(ROOT, 'skill-templates');
    const preambleSkills: string[] = [];

    // Check root template
    const rootTmpl = fs.readFileSync(path.join(skillTemplatesDir, 'SKILL.md.tmpl'), 'utf-8');
    if (rootTmpl.includes('{{PREAMBLE}}')) {
      preambleSkills.push('gstack');
    }

    // Check subdirectory templates
    for (const entry of fs.readdirSync(skillTemplatesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const tmplPath = path.join(skillTemplatesDir, entry.name, 'SKILL.md.tmpl');
      if (fs.existsSync(tmplPath)) {
        const tmpl = fs.readFileSync(tmplPath, 'utf-8');
        if (tmpl.includes('{{PREAMBLE}}')) {
          preambleSkills.push(entry.name);
        }
      }
    }

    // Check browse/ (outside skill-templates)
    const browseTmplPath = path.join(ROOT, 'browse', 'SKILL.md.tmpl');
    if (fs.existsSync(browseTmplPath)) {
      const tmpl = fs.readFileSync(browseTmplPath, 'utf-8');
      if (tmpl.includes('{{PREAMBLE}}')) {
        preambleSkills.push('browse');
      }
    }

    for (const skill of preambleSkills) {
      expect(SKILL_TIER_MAP).toHaveProperty(skill,
        expect.any(Number));
    }
  });

  // Reverse guard: every entry in SKILL_TIER_MAP must correspond to a skill that uses {{PREAMBLE}}
  test('SKILL_TIER_MAP contains only skills that use PREAMBLE placeholder', () => {
    const skillTemplatesDir = path.join(ROOT, 'skill-templates');
    const preambleSkills = new Set<string>();

    // Check root template
    const rootTmpl = fs.readFileSync(path.join(skillTemplatesDir, 'SKILL.md.tmpl'), 'utf-8');
    if (rootTmpl.includes('{{PREAMBLE}}')) {
      preambleSkills.add('gstack');
    }

    // Check subdirectory templates
    for (const entry of fs.readdirSync(skillTemplatesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const tmplPath = path.join(skillTemplatesDir, entry.name, 'SKILL.md.tmpl');
      if (fs.existsSync(tmplPath)) {
        const tmpl = fs.readFileSync(tmplPath, 'utf-8');
        if (tmpl.includes('{{PREAMBLE}}')) {
          preambleSkills.add(entry.name);
        }
      }
    }

    // Check browse/ (outside skill-templates)
    const browseTmplPath = path.join(ROOT, 'browse', 'SKILL.md.tmpl');
    if (fs.existsSync(browseTmplPath)) {
      const tmpl = fs.readFileSync(browseTmplPath, 'utf-8');
      if (tmpl.includes('{{PREAMBLE}}')) {
        preambleSkills.add('browse');
      }
    }

    for (const skill of Object.keys(SKILL_TIER_MAP)) {
      expect(preambleSkills.has(skill)).toBe(true);
    }
  });
});

describe('Voice & Search sections in generated SKILL.md files', () => {
  // T2+ skills should have Voice & Search sections (tier is now activated).
  // T1 skills (browse) are excluded — they get minimal preamble without these sections.
  const PREAMBLE_SKILLS_T2_PLUS = ['gstack', 'ship', 'review', 'qa', 'retro', 'investigate'];

  for (const skill of PREAMBLE_SKILLS_T2_PLUS) {
    const label = skill === 'gstack' ? 'SKILL.md' : `${skill}/SKILL.md`;
    const skillDir = skill === 'gstack' ? '.' : skill;

    test(`${label} contains Voice & Communication Style`, () => {
      const content = readClaudeSkill(skillDir);
      expect(content).toContain('Voice & Communication Style');
    });

    test(`${label} contains Search Before Building`, () => {
      const content = readClaudeSkill(skillDir);
      expect(content).toContain('Search Before Building');
    });
  }

  // T1 skills (browse) should NOT have these sections
  test('browse/SKILL.md (T1) does NOT contain Voice & Communication Style', () => {
    const content = readClaudeSkill('browse');
    expect(content).not.toContain('Voice & Communication Style');
    expect(content).not.toContain('Search Before Building');
  });
});

// ─── Phase 1.5: Review resolver tests ────────────────────────────────

describe('Phase 1.5 review resolvers', () => {
  const {
    generateScopeDrift,
    generateAdversarialStep,
    generateCodexSecondOpinion,
    generateCodexPlanReview,
    generatePlanCompletionAuditShip,
    generatePlanCompletionAuditReview,
    generatePlanVerificationExec,
  } = require('../scripts/resolvers/review') as typeof import('../scripts/resolvers/review');
  const { HOST_PATHS } = require('../scripts/resolvers/types') as typeof import('../scripts/resolvers/types');

  const makeCtx = (overrides: Partial<import('../scripts/resolvers/types').TemplateContext> = {}) => ({
    skillName: 'review',
    tmplPath: '',
    host: 'claude' as const,
    paths: HOST_PATHS['claude'],
    ...overrides,
  });

  // ── SCOPE_DRIFT ──

  describe('generateScopeDrift', () => {
    test('uses review step number for review skill', () => {
      const output = generateScopeDrift(makeCtx({ skillName: 'review' }));
      expect(output).toContain('Step 1.5: Scope Drift Detection');
    });

    test('uses ship step number for ship skill', () => {
      const output = generateScopeDrift(makeCtx({ skillName: 'ship' }));
      expect(output).toContain('Step 3.48: Scope Drift Detection');
    });

    test('contains SCOPE CREEP and MISSING REQUIREMENTS detection', () => {
      const output = generateScopeDrift(makeCtx());
      expect(output).toContain('SCOPE CREEP detection');
      expect(output).toContain('MISSING REQUIREMENTS detection');
    });

    test('is INFORMATIONAL — does not block', () => {
      const output = generateScopeDrift(makeCtx());
      expect(output).toContain('INFORMATIONAL');
    });
  });

  // ── ADVERSARIAL_STEP ──

  describe('generateAdversarialStep', () => {
    test('returns empty string for codex host', () => {
      const output = generateAdversarialStep(makeCtx({ host: 'codex', paths: HOST_PATHS['codex'] }));
      expect(output).toBe('');
    });

    test('uses review step number for review skill', () => {
      const output = generateAdversarialStep(makeCtx({ skillName: 'review' }));
      expect(output).toContain('Step 5.7: Adversarial review');
    });

    test('uses ship step number for ship skill', () => {
      const output = generateAdversarialStep(makeCtx({ skillName: 'ship' }));
      expect(output).toContain('Step 3.8: Adversarial review');
    });

    test('contains Claude adversarial subagent section', () => {
      const output = generateAdversarialStep(makeCtx());
      expect(output).toContain('Claude Code adversarial subagent');
    });

    test('contains Codex adversarial challenge section', () => {
      const output = generateAdversarialStep(makeCtx());
      expect(output).toContain('Codex adversarial challenge');
    });

    test('contains Codex structured review section for large diffs', () => {
      const output = generateAdversarialStep(makeCtx());
      expect(output).toContain('Codex structured review (large diffs only');
    });

    test('contains cross-model synthesis section', () => {
      const output = generateAdversarialStep(makeCtx());
      expect(output).toContain('Cross-model synthesis');
    });

    test('contains persist section with parameterized binDir', () => {
      const output = generateAdversarialStep(makeCtx());
      expect(output).toContain('$_GSTACK_ROOT/bin/gstack-review-log');
    });

    test('uses CodeBuddy platform name for codebuddy host', () => {
      const output = generateAdversarialStep(makeCtx({ host: 'codebuddy', paths: HOST_PATHS['codebuddy'] }));
      expect(output).toContain('CodeBuddy adversarial subagent');
      expect(output).toContain('CodeBuddy structured');
    });

    test('contains CODEX_BOUNDARY without hardcoded claude paths', () => {
      const output = generateAdversarialStep(makeCtx());
      expect(output).not.toContain('~/.claude/');
      expect(output).toContain('skill definition directories');
    });

    test('uses codexErrorHandling for non-blocking error handling', () => {
      const output = generateAdversarialStep(makeCtx());
      expect(output).toContain('All errors are non-blocking');
    });

    test('ship mode includes re-run tests note on fix', () => {
      const output = generateAdversarialStep(makeCtx({ skillName: 'ship' }));
      expect(output).toContain('After fixing, re-run tests');
    });
  });

  // ── CODEX_SECOND_OPINION ──

  describe('generateCodexSecondOpinion', () => {
    test('returns empty string for codex host', () => {
      const output = generateCodexSecondOpinion(makeCtx({ host: 'codex', paths: HOST_PATHS['codex'] }));
      expect(output).toBe('');
    });

    test('contains Phase 3.5 heading', () => {
      const output = generateCodexSecondOpinion(makeCtx());
      expect(output).toContain('Phase 3.5: Cross-Model Second Opinion');
    });

    test('contains startup and builder mode instructions', () => {
      const output = generateCodexSecondOpinion(makeCtx());
      expect(output).toContain('Startup mode instructions');
      expect(output).toContain('Builder mode instructions');
    });

    test('uses parameterized platform name', () => {
      const output = generateCodexSecondOpinion(makeCtx());
      expect(output).toContain('Claude Code');
      const cbOutput = generateCodexSecondOpinion(makeCtx({ host: 'codebuddy', paths: HOST_PATHS['codebuddy'] }));
      expect(cbOutput).toContain('CodeBuddy');
    });

    test('contains fallback to subagent mechanism', () => {
      const output = generateCodexSecondOpinion(makeCtx());
      expect(output).toContain('If CODEX_NOT_AVAILABLE');
      expect(output).toContain('Dispatch via the Agent tool');
    });

    test('uses codexErrorHandling for non-blocking error handling', () => {
      const output = generateCodexSecondOpinion(makeCtx());
      expect(output).toContain('All errors are non-blocking');
    });

    test('does not contain hardcoded ~/.claude/ or ~/.gstack/ paths', () => {
      const output = generateCodexSecondOpinion(makeCtx());
      expect(output).not.toContain('~/.claude/');
      expect(output).not.toContain('~/.gstack/');
    });
  });

  // ── CODEX_PLAN_REVIEW ──

  describe('generateCodexPlanReview', () => {
    test('returns empty string for codex host', () => {
      const output = generateCodexPlanReview(makeCtx({ host: 'codex', paths: HOST_PATHS['codex'] }));
      expect(output).toBe('');
    });

    test('contains Step 0.5 heading', () => {
      const output = generateCodexPlanReview(makeCtx());
      expect(output).toContain('Step 0.5: Codex plan review');
    });

    test('contains codex binary detect', () => {
      const output = generateCodexPlanReview(makeCtx());
      expect(output).toContain('which codex');
    });

    test('contains codex plan review block', () => {
      const output = generateCodexPlanReview(makeCtx());
      expect(output).toContain('codex exec');
    });

    test('contains codex error handling', () => {
      const output = generateCodexPlanReview(makeCtx());
      expect(output).toContain('All errors are non-blocking');
    });

    test('uses parameterized platform name', () => {
      const output = generateCodexPlanReview(makeCtx());
      expect(output).toContain('Claude Code');
      const cbOutput = generateCodexPlanReview(makeCtx({ host: 'codebuddy', paths: HOST_PATHS['codebuddy'] }));
      expect(cbOutput).toContain('CodeBuddy');
    });

    test('does not contain hardcoded ~/.claude/ or ~/.gstack/ paths', () => {
      const output = generateCodexPlanReview(makeCtx());
      expect(output).not.toContain('~/.claude/');
      expect(output).not.toContain('~/.gstack/');
    });
  });

  // ── PLAN_COMPLETION_AUDIT_SHIP / _REVIEW ──

  describe('generatePlanCompletionAuditShip', () => {
    test('contains plan file discovery section', () => {
      const output = generatePlanCompletionAuditShip(makeCtx());
      expect(output).toContain('Plan File Discovery');
    });

    test('contains actionable item extraction', () => {
      const output = generatePlanCompletionAuditShip(makeCtx());
      expect(output).toContain('Actionable Item Extraction');
    });

    test('contains cross-reference against diff', () => {
      const output = generatePlanCompletionAuditShip(makeCtx());
      expect(output).toContain('Cross-Reference Against Diff');
    });

    test('contains DONE/PARTIAL/NOT DONE/CHANGED classification', () => {
      const output = generatePlanCompletionAuditShip(makeCtx());
      expect(output).toContain('[DONE]');
      expect(output).toContain('[PARTIAL]');
      expect(output).toContain('[NOT DONE]');
      expect(output).toContain('[CHANGED]');
    });

    test('contains ship-specific gate logic with AskUserQuestion', () => {
      const output = generatePlanCompletionAuditShip(makeCtx());
      expect(output).toContain('Gate Logic');
      expect(output).toContain('AskUserQuestion');
      expect(output).toContain('Ship anyway');
    });

    test('does not contain hardcoded ~/.gstack/ paths', () => {
      const output = generatePlanCompletionAuditShip(makeCtx());
      expect(output).not.toContain('~/.gstack/');
    });

    test('contains zsh compat in plan discovery', () => {
      const output = generatePlanCompletionAuditShip(makeCtx());
      expect(output).toContain('setopt +o nomatch');
      expect(output).toContain('zsh compat');
    });
  });

  describe('generatePlanCompletionAuditReview', () => {
    test('contains review-specific integration with scope drift', () => {
      const output = generatePlanCompletionAuditReview(makeCtx());
      expect(output).toContain('Integration with Scope Drift Detection');
      expect(output).toContain('INFORMATIONAL');
    });

    test('does NOT contain ship-specific gate logic', () => {
      const output = generatePlanCompletionAuditReview(makeCtx());
      expect(output).not.toContain('Gate Logic');
      expect(output).not.toContain('Ship anyway');
    });

    test('shares common sections with ship variant', () => {
      const output = generatePlanCompletionAuditReview(makeCtx());
      expect(output).toContain('Plan File Discovery');
      expect(output).toContain('Actionable Item Extraction');
      expect(output).toContain('Cross-Reference Against Diff');
    });
  });

  // ── PLAN_VERIFICATION_EXEC ──

  describe('generatePlanVerificationExec', () => {
    test('contains Step 3.47 heading', () => {
      const output = generatePlanVerificationExec(makeCtx());
      expect(output).toContain('Step 3.47: Plan Verification');
    });

    test('contains dev server check', () => {
      const output = generatePlanVerificationExec(makeCtx());
      expect(output).toContain('localhost:3000');
      expect(output).toContain('localhost:8080');
      expect(output).toContain('NO_SERVER');
    });

    test('invokes /qa-only skill inline', () => {
      const output = generatePlanVerificationExec(makeCtx());
      expect(output).toContain('/qa-only');
      expect(output).toContain('$_GSTACK_ROOT/../qa-only/SKILL.md');
    });

    test('contains gate logic with AskUserQuestion', () => {
      const output = generatePlanVerificationExec(makeCtx());
      expect(output).toContain('AskUserQuestion');
      expect(output).toContain('Fix the failures before shipping');
    });

    test('uses $_GSTACK_ROOT not hardcoded paths', () => {
      const output = generatePlanVerificationExec(makeCtx());
      expect(output).toContain('$_GSTACK_ROOT');
      expect(output).not.toContain('~/.claude/');
      expect(output).not.toContain('${CLAUDE_SKILL_DIR}');
    });
  });

  // ── Additional edge case tests ──

  describe('generateScopeDrift edge cases', () => {
    test('non-review/ship skill defaults to review step number', () => {
      const output = generateScopeDrift(makeCtx({ skillName: 'office-hours' }));
      expect(output).toContain('Step 1.5: Scope Drift Detection');
      expect(output).not.toContain('Step 3.48');
    });

    test('output does not contain any hardcoded host paths', () => {
      for (const host of ['claude', 'codex', 'codebuddy'] as const) {
        const output = generateScopeDrift(makeCtx({ host, paths: HOST_PATHS[host] }));
        expect(output).not.toContain('~/.claude/');
        expect(output).not.toContain('~/.gstack/');
      }
    });
  });

  describe('generateAdversarialStep edge cases', () => {
    test('review mode does NOT contain re-run tests note', () => {
      const output = generateAdversarialStep(makeCtx({ skillName: 'review' }));
      expect(output).not.toContain('After fixing, re-run tests');
    });

    test('gstack-config path uses ctx.paths.binDir', () => {
      const output = generateAdversarialStep(makeCtx());
      expect(output).toContain('$_GSTACK_ROOT/bin/gstack-config');
    });

    test('codex temporary files use gstack- prefix', () => {
      const output = generateAdversarialStep(makeCtx());
      expect(output).toContain('mktemp /tmp/gstack-codex-adv-');
      expect(output).toContain('mktemp /tmp/gstack-codex-review-');
    });

    test('persist section uses ctx.host for source value', () => {
      const output = generateAdversarialStep(makeCtx());
      // SOURCE should use ${ctx.host} not hardcoded "claude"
      expect(output).toContain('"claude" if only Claude Code subagent ran');
    });

    test('codebuddy host persist section uses codebuddy source', () => {
      const output = generateAdversarialStep(makeCtx({ host: 'codebuddy', paths: HOST_PATHS['codebuddy'] }));
      expect(output).toContain('"codebuddy" if only CodeBuddy subagent ran');
    });
  });

  describe('CODEX_BOUNDARY content', () => {
    test('adversarial output includes .codebuddy/skills/ in boundary', () => {
      const output = generateAdversarialStep(makeCtx());
      expect(output).toContain('.codebuddy/skills/');
    });

    test('adversarial output includes .claude/skills/ in boundary', () => {
      const output = generateAdversarialStep(makeCtx());
      expect(output).toContain('.claude/skills/');
    });

    test('codex second opinion includes boundary', () => {
      const output = generateCodexSecondOpinion(makeCtx());
      expect(output).toContain('skill definition directories');
    });
  });

  describe('generateCodexSecondOpinion edge cases', () => {
    test('codex temp files use gstack- prefix', () => {
      const output = generateCodexSecondOpinion(makeCtx());
      expect(output).toContain('mktemp /tmp/gstack-codex-oh-');
    });

    test('includes premise revision check', () => {
      const output = generateCodexSecondOpinion(makeCtx());
      expect(output).toContain('Premise revision check');
      expect(output).toContain('AskUserQuestion');
    });

    test('cross-model synthesis section present', () => {
      const output = generateCodexSecondOpinion(makeCtx());
      expect(output).toContain('Cross-model synthesis');
    });
  });

  describe('generatePlanCompletionAudit host diversity', () => {
    test('ship variant with codebuddy host has no hardcoded paths', () => {
      const output = generatePlanCompletionAuditShip(makeCtx({ host: 'codebuddy', paths: HOST_PATHS['codebuddy'] }));
      expect(output).not.toContain('~/.claude/');
      expect(output).not.toContain('~/.gstack/');
      expect(output).not.toContain('${CLAUDE_SKILL_DIR}');
    });

    test('review variant with codebuddy host has no hardcoded paths', () => {
      const output = generatePlanCompletionAuditReview(makeCtx({ host: 'codebuddy', paths: HOST_PATHS['codebuddy'] }));
      expect(output).not.toContain('~/.claude/');
      expect(output).not.toContain('~/.gstack/');
    });

    test('plan discovery uses ctx.paths.skillRoot', () => {
      const output = generatePlanCompletionAuditShip(makeCtx());
      expect(output).toContain('$_GSTACK_ROOT/../..');
    });
  });

  describe('generatePlanVerificationExec edge cases', () => {
    test('with codebuddy host uses correct paths', () => {
      const output = generatePlanVerificationExec(makeCtx({ host: 'codebuddy', paths: HOST_PATHS['codebuddy'] }));
      expect(output).toContain('$_GSTACK_ROOT/../qa-only/SKILL.md');
      expect(output).not.toContain('~/.claude/');
    });

    test('does not contain ${CLAUDE_SKILL_DIR} reference', () => {
      // This is the key migration check — upstream uses ${CLAUDE_SKILL_DIR}
      const output = generatePlanVerificationExec(makeCtx());
      expect(output).not.toMatch(/\$\{CLAUDE_SKILL_DIR\}/);
    });

    test('includes all 4 localhost ports for dev server check', () => {
      const output = generatePlanVerificationExec(makeCtx());
      expect(output).toContain('localhost:3000');
      expect(output).toContain('localhost:8080');
      expect(output).toContain('localhost:5173');
      expect(output).toContain('localhost:4000');
    });
  });

  // ── Cross-host path consistency ──

  describe('all resolvers: no hardcoded paths across all hosts', () => {
    const resolverFns = [
      { name: 'generateScopeDrift', fn: generateScopeDrift },
      { name: 'generateAdversarialStep', fn: generateAdversarialStep },
      { name: 'generateCodexSecondOpinion', fn: generateCodexSecondOpinion },
      { name: 'generateCodexPlanReview', fn: generateCodexPlanReview },
      { name: 'generatePlanCompletionAuditShip', fn: generatePlanCompletionAuditShip },
      { name: 'generatePlanCompletionAuditReview', fn: generatePlanCompletionAuditReview },
      { name: 'generatePlanVerificationExec', fn: generatePlanVerificationExec },
    ];
    const hosts = ['claude', 'codebuddy'] as const; // codex returns '' for adversarial/second-opinion

    for (const { name, fn } of resolverFns) {
      for (const host of hosts) {
        test(`${name} (${host}): no ~/.gstack/ or \${CLAUDE_SKILL_DIR}`, () => {
          const output = fn(makeCtx({ host, paths: HOST_PATHS[host] }));
          if (output === '') return; // codex exclusion
          expect(output).not.toContain('~/.gstack/');
          expect(output).not.toMatch(/\$\{CLAUDE_SKILL_DIR\}/);
        });
      }
    }
  });

  // ── RESOLVERS registration ──

  describe('resolver registration in index.ts', () => {
    const { RESOLVERS } = require('../scripts/resolvers/index') as typeof import('../scripts/resolvers/index');

    const phase15Resolvers = [
      'SCOPE_DRIFT',
      'ADVERSARIAL_STEP',
      'CODEX_SECOND_OPINION',
      'PLAN_COMPLETION_AUDIT_SHIP',
      'PLAN_COMPLETION_AUDIT_REVIEW',
      'PLAN_VERIFICATION_EXEC',
    ];

    for (const name of phase15Resolvers) {
      test(`${name} is registered in RESOLVERS map`, () => {
        expect(RESOLVERS).toHaveProperty(name);
        expect(typeof RESOLVERS[name]).toBe('function');
      });
    }

    const phase16Resolvers = [
      'TEST_FAILURE_TRIAGE',
      'TEST_COVERAGE_AUDIT_PLAN',
      'TEST_COVERAGE_AUDIT_SHIP',
      'TEST_COVERAGE_AUDIT_REVIEW',
    ];

    for (const name of phase16Resolvers) {
      test(`${name} is registered in RESOLVERS map`, () => {
        expect(RESOLVERS).toHaveProperty(name);
        expect(typeof RESOLVERS[name]).toBe('function');
      });
    }

    const phase17Resolvers = [
      'SLUG_EVAL',
      'SLUG_SETUP',
      'DEPLOY_BOOTSTRAP',
      'CO_AUTHOR_TRAILER',
      'CHANGELOG_WORKFLOW',
    ];

    for (const name of phase17Resolvers) {
      test(`${name} is registered in RESOLVERS map`, () => {
        expect(RESOLVERS).toHaveProperty(name);
        expect(typeof RESOLVERS[name]).toBe('function');
      });
    }

    const phase2Resolvers = [
      'LEARNINGS_SEARCH',
      'LEARNINGS_LOG',
    ];

    for (const name of phase2Resolvers) {
      test(`${name} is registered in RESOLVERS map`, () => {
        expect(RESOLVERS).toHaveProperty(name);
        expect(typeof RESOLVERS[name]).toBe('function');
      });
    }

    const phase34Resolvers = [
      'CODEX_PLAN_REVIEW',
    ];

    for (const name of phase34Resolvers) {
      test(`${name} is registered in RESOLVERS map`, () => {
        expect(RESOLVERS).toHaveProperty(name);
        expect(typeof RESOLVERS[name]).toBe('function');
      });
    }

    const phase33Resolvers = [
      'DESIGN_SKETCH',
      'DESIGN_MOCKUP',
      'SPEC_REVIEW_LOOP',
    ];

    for (const name of phase33Resolvers) {
      test(`${name} is registered in RESOLVERS map`, () => {
        expect(RESOLVERS).toHaveProperty(name);
        expect(typeof RESOLVERS[name]).toBe('function');
      });
    }

    // Phase 4D resolver
    test('BENEFITS_FROM is registered in RESOLVERS map', () => {
      expect(RESOLVERS).toHaveProperty('BENEFITS_FROM');
      expect(typeof RESOLVERS['BENEFITS_FROM']).toBe('function');
    });

    // Phase 4G-2 resolvers
    test('DESIGN_SETUP is registered in RESOLVERS map', () => {
      expect(RESOLVERS).toHaveProperty('DESIGN_SETUP');
      expect(typeof RESOLVERS['DESIGN_SETUP']).toBe('function');
    });

    test('DESIGN_SHOTGUN_LOOP is registered in RESOLVERS map', () => {
      expect(RESOLVERS).toHaveProperty('DESIGN_SHOTGUN_LOOP');
      expect(typeof RESOLVERS['DESIGN_SHOTGUN_LOOP']).toBe('function');
    });

    test('total RESOLVERS count is 36', () => {
      expect(Object.keys(RESOLVERS).length).toBe(36);
    });
  });
});

// ─── Phase 3.3: Design + review resolver function tests ───────────────

describe('Phase 3.3 resolver functions', () => {
  const { generateDesignSketch, generateDesignMockup } = require('../scripts/resolvers/design') as typeof import('../scripts/resolvers/design');
  const { generateSpecReviewLoop } = require('../scripts/resolvers/review') as typeof import('../scripts/resolvers/review');
  const { HOST_PATHS } = require('../scripts/resolvers/types') as typeof import('../scripts/resolvers/types');

  const claudeCtx = { skillName: 'office-hours' as const, tmplPath: 'test', host: 'claude' as const, paths: HOST_PATHS.claude };
  const codexCtx = { skillName: 'office-hours' as const, tmplPath: 'test', host: 'codex' as const, paths: HOST_PATHS.codex };

  test('DESIGN_SKETCH output contains wireframe workflow', () => {
    const output = generateDesignSketch(claudeCtx);
    expect(output).toContain('Visual Sketch');
    expect(output).toContain('wireframe HTML');
    expect(output).toContain('SKETCH_FILE');
    expect(output).toContain('$B goto');
    expect(output).toContain('Outside design voices');
  });

  test('DESIGN_SKETCH is host-agnostic (uses "subagent" not "Claude subagent")', () => {
    const output = generateDesignSketch(claudeCtx);
    expect(output).toContain('SUBAGENT (design direction)');
    expect(output).not.toContain('CLAUDE SUBAGENT');
  });

  test('DESIGN_MOCKUP output contains design binary detection', () => {
    const output = generateDesignMockup(claudeCtx);
    expect(output).toContain('Visual Design Exploration');
    expect(output).toContain('DESIGN_READY');
    expect(output).toContain('DESIGN_NOT_AVAILABLE');
    expect(output).toContain('$D variants');
    expect(output).toContain('approved.json');
  });

  test('DESIGN_MOCKUP uses _GSTACK_ROOT for design binary path (not ctx.paths.designDir)', () => {
    const output = generateDesignMockup(claudeCtx);
    // Should use shell-level _GSTACK_ROOT detection, not a TS ctx.paths property
    expect(output).toContain('_GSTACK_ROOT');
    expect(output).toContain('design/dist/design');
  });

  test('DESIGN_MOCKUP uses state dir detection for design directory', () => {
    const output = generateDesignMockup(claudeCtx);
    expect(output).toContain('_STATE_DIR');
    expect(output).toContain('GSTACK_STATE_DIR');
    expect(output).toContain('_DESIGN_DIR');
  });

  test('SPEC_REVIEW_LOOP output contains adversarial review workflow', () => {
    const output = generateSpecReviewLoop(claudeCtx);
    expect(output).toContain('Spec Review Loop');
    expect(output).toContain('5 dimensions');
    expect(output).toContain('Completeness');
    expect(output).toContain('Consistency');
    expect(output).toContain('Clarity');
    expect(output).toContain('Scope');
    expect(output).toContain('Feasibility');
  });

  test('SPEC_REVIEW_LOOP has convergence guard and max iterations', () => {
    const output = generateSpecReviewLoop(claudeCtx);
    expect(output).toContain('Convergence guard');
    expect(output).toContain('Maximum 3 iterations');
    expect(output).toContain('Reviewer Concerns');
  });

  test('SPEC_REVIEW_LOOP persists metrics with correct skill name', () => {
    const output = generateSpecReviewLoop(claudeCtx);
    expect(output).toContain('"skill":"office-hours"');
    expect(output).toContain('spec-review.jsonl');
  });

  test('SPEC_REVIEW_LOOP uses ctx.skillName for different skills', () => {
    const planCtx = { ...claudeCtx, skillName: 'autoplan' };
    const output = generateSpecReviewLoop(planCtx);
    expect(output).toContain('"skill":"autoplan"');
  });
});

// ─── Phase 1.6: Testing resolver tests ────────────────────────────────

describe('Phase 1.6 testing resolvers', () => {
  const {
    generateTestFailureTriage,
    generateTestCoverageAuditPlan,
    generateTestCoverageAuditShip,
    generateTestCoverageAuditReview,
  } = require('../scripts/resolvers/testing') as typeof import('../scripts/resolvers/testing');
  const { HOST_PATHS, HOST_SHORT_BRANDS } = require('../scripts/resolvers/types') as typeof import('../scripts/resolvers/types');

  const makeCtx = (overrides: Partial<import('../scripts/resolvers/types').TemplateContext> = {}) => ({
    skillName: 'ship',
    tmplPath: '',
    host: 'claude' as const,
    paths: HOST_PATHS['claude'],
    ...overrides,
  });

  // ── TEST_FAILURE_TRIAGE ──

  describe('generateTestFailureTriage', () => {
    test('produces non-empty output', () => {
      const output = generateTestFailureTriage(makeCtx());
      expect(output.length).toBeGreaterThan(100);
    });

    test('contains T1-T4 triage steps', () => {
      const output = generateTestFailureTriage(makeCtx());
      expect(output).toContain('Step T1: Classify each failure');
      expect(output).toContain('Step T2: Handle in-branch failures');
      expect(output).toContain('Step T3: Handle pre-existing failures');
      expect(output).toContain('Step T4: Execute the chosen action');
    });

    test('uses HOST_SHORT_BRANDS for effort estimates', () => {
      const claudeOutput = generateTestFailureTriage(makeCtx());
      expect(claudeOutput).toContain(`${HOST_SHORT_BRANDS['claude']}: ~15min`);

      const codebuddyOutput = generateTestFailureTriage(makeCtx({ host: 'codebuddy', paths: HOST_PATHS['codebuddy'] }));
      expect(codebuddyOutput).toContain(`${HOST_SHORT_BRANDS['codebuddy']}: ~15min`);
    });

    test('uses $_GSTACK_ROOT for TODOS-format.md path', () => {
      const output = generateTestFailureTriage(makeCtx());
      expect(output).toContain('$_GSTACK_ROOT/../review/TODOS-format.md');
      expect(output).not.toContain('.claude/skills/review/TODOS-format.md');
    });

    test('includes REPO_MODE reference', () => {
      const output = generateTestFailureTriage(makeCtx());
      expect(output).toContain('REPO_MODE');
      expect(output).toContain('solo');
      expect(output).toContain('collaborative');
    });

    test('includes GitHub and GitLab issue creation', () => {
      const output = generateTestFailureTriage(makeCtx());
      expect(output).toContain('gh issue create');
      expect(output).toContain('glab issue create');
    });

    test('no hardcoded paths for any host', () => {
      for (const host of ['claude', 'codebuddy'] as const) {
        const output = generateTestFailureTriage(makeCtx({ host, paths: HOST_PATHS[host] }));
        expect(output).not.toContain('~/.claude/');
        expect(output).not.toContain('~/.gstack/');
      }
    });

    test('codex host uses HOST_SHORT_BRANDS["codex"]', () => {
      const output = generateTestFailureTriage(makeCtx({ host: 'codex', paths: HOST_PATHS['codex'] }));
      expect(output).toContain(`${HOST_SHORT_BRANDS['codex']}: ~15min`);
      expect(output).not.toContain('CC: ~15min');
    });

    test('all 3 hosts produce structurally identical triage (same steps)', () => {
      for (const host of ['claude', 'codex', 'codebuddy'] as const) {
        const output = generateTestFailureTriage(makeCtx({ host, paths: HOST_PATHS[host] }));
        expect(output).toContain('Step T1');
        expect(output).toContain('Step T2');
        expect(output).toContain('Step T3');
        expect(output).toContain('Step T4');
      }
    });
  });

  // ── TEST_COVERAGE_AUDIT_* ──

  describe('generateTestCoverageAuditPlan', () => {
    test('contains plan-specific intro', () => {
      const output = generateTestCoverageAuditPlan(makeCtx());
      expect(output).toContain('Evaluate every codepath in the plan');
    });

    test('uses Step numbering (not bare numbers)', () => {
      const output = generateTestCoverageAuditPlan(makeCtx());
      expect(output).toContain('Step 1.');
      expect(output).toContain('Step 2.');
    });

    test('contains test plan artifact section', () => {
      const output = generateTestCoverageAuditPlan(makeCtx());
      expect(output).toContain('Test Plan Artifact');
    });

    test('plan artifact uses ctx.paths.binDir for gstack-slug', () => {
      const output = generateTestCoverageAuditPlan(makeCtx());
      expect(output).toContain('$_GSTACK_ROOT/bin/gstack-slug');
      expect(output).not.toContain('~/.claude/skills/gstack/bin/gstack-slug');
    });

    test('plan artifact uses project-local state dir', () => {
      const output = generateTestCoverageAuditPlan(makeCtx());
      expect(output).toContain('$_GSTACK_ROOT/../..');
      expect(output).not.toContain('~/.gstack/projects/$SLUG');
    });

    test('includes regression rule', () => {
      const output = generateTestCoverageAuditPlan(makeCtx());
      expect(output).toContain('REGRESSION RULE');
      expect(output).toContain('IRON RULE');
      expect(output).toContain('added to the plan as a critical requirement');
    });

    test('includes ASCII coverage diagram example', () => {
      const output = generateTestCoverageAuditPlan(makeCtx());
      expect(output).toContain('CODE PATH COVERAGE');
      expect(output).toContain('USER FLOW COVERAGE');
    });

    test('includes E2E test decision matrix', () => {
      const output = generateTestCoverageAuditPlan(makeCtx());
      expect(output).toContain('E2E Test Decision Matrix');
    });

    test('includes zsh compat guard', () => {
      const output = generateTestCoverageAuditPlan(makeCtx());
      expect(output).toContain('setopt +o nomatch');
    });

    test('plan regression rule says "added to the plan as a critical requirement"', () => {
      const output = generateTestCoverageAuditPlan(makeCtx());
      expect(output).toContain('added to the plan as a critical requirement');
      // plan should NOT include commit format instruction
      expect(output).not.toContain('commit as `test:');
    });
  });

  describe('generateTestCoverageAuditShip', () => {
    test('contains ship-specific intro', () => {
      const output = generateTestCoverageAuditShip(makeCtx());
      expect(output).toContain('Evaluate what was ACTUALLY coded');
    });

    test('uses bare numbers (not Step prefix) for ship mode', () => {
      const output = generateTestCoverageAuditShip(makeCtx());
      // Ship mode uses "1." not "Step 1."
      expect(output).toContain('**1. Trace every codepath changed');
    });

    test('includes before/after test count (ship only)', () => {
      const output = generateTestCoverageAuditShip(makeCtx());
      expect(output).toContain('Before/after test count');
      expect(output).toContain('find . -name');

      // plan mode should NOT have this
      const planOutput = generateTestCoverageAuditPlan(makeCtx());
      expect(planOutput).not.toContain('Before/after test count');
    });

    test('includes coverage gate (ship only)', () => {
      const output = generateTestCoverageAuditShip(makeCtx());
      expect(output).toContain('Coverage gate');
      expect(output).toContain('Minimum = 60%');
      expect(output).toContain('Target = 80%');
    });

    test('includes test generation caps', () => {
      const output = generateTestCoverageAuditShip(makeCtx());
      expect(output).toContain('30 code paths max');
      expect(output).toContain('20 tests generated max');
    });

    test('ship artifact uses ctx.paths.binDir', () => {
      const output = generateTestCoverageAuditShip(makeCtx());
      expect(output).toContain('$_GSTACK_ROOT/bin/gstack-slug');
      expect(output).not.toContain('~/.claude/skills/gstack/bin/gstack-slug');
    });

    test('regression rule says "written immediately" for ship', () => {
      const output = generateTestCoverageAuditShip(makeCtx());
      expect(output).toContain('written immediately');
      // ship and review modes include commit format; plan does not
      expect(output).toContain('commit as `test: regression test');
    });

    test('ship mode includes no-framework fallback', () => {
      const output = generateTestCoverageAuditShip(makeCtx());
      expect(output).toContain('falls through to the Test Framework Bootstrap step');
    });
  });

  describe('generateTestCoverageAuditReview', () => {
    test('contains review-specific intro', () => {
      const output = generateTestCoverageAuditReview(makeCtx());
      expect(output).toContain('Gaps become INFORMATIONAL findings');
    });

    test('includes Fix-First flow', () => {
      const output = generateTestCoverageAuditReview(makeCtx());
      expect(output).toContain('Fix-First');
      expect(output).toContain('AUTO-FIX');
    });

    test('includes coverage warning (review only)', () => {
      const output = generateTestCoverageAuditReview(makeCtx());
      expect(output).toContain('COVERAGE WARNING');
      expect(output).toContain('INFORMATIONAL');

      // Ship should NOT have coverage warning section
      const shipOutput = generateTestCoverageAuditShip(makeCtx());
      expect(shipOutput).not.toContain('COVERAGE WARNING');
    });

    test('review does NOT include coverage gate', () => {
      const output = generateTestCoverageAuditReview(makeCtx());
      expect(output).not.toContain('Coverage gate:');
    });

    test('review does NOT include test plan artifact', () => {
      const output = generateTestCoverageAuditReview(makeCtx());
      expect(output).not.toContain('Test Plan Artifact');
    });

    test('review uses Step prefix numbering (like plan)', () => {
      const output = generateTestCoverageAuditReview(makeCtx());
      expect(output).toContain('Step 1.');
      expect(output).toContain('Step 2.');
    });

    test('review regression rule includes commit format', () => {
      const output = generateTestCoverageAuditReview(makeCtx());
      expect(output).toContain('commit as `test: regression test');
    });
  });

  describe('all TEST_COVERAGE_AUDIT variants: no hardcoded paths', () => {
    const fns = [
      { name: 'plan', fn: generateTestCoverageAuditPlan },
      { name: 'ship', fn: generateTestCoverageAuditShip },
      { name: 'review', fn: generateTestCoverageAuditReview },
    ];

    for (const { name, fn } of fns) {
      for (const host of ['claude', 'codebuddy'] as const) {
        test(`${name} (${host}): no ~/.gstack/ or ~/.claude/`, () => {
          const output = fn(makeCtx({ host, paths: HOST_PATHS[host] }));
          expect(output).not.toContain('~/.gstack/');
          expect(output).not.toContain('~/.claude/');
        });
      }
    }
  });
});

// ─── Phase 1.7: Utility resolver tests ────────────────────────────────

describe('Phase 1.7 utility resolvers', () => {
  const {
    generateSlugEval,
    generateSlugSetup,
    generateBaseBranchDetect,
    generateDeployBootstrap,
    generateCoAuthorTrailer,
    generateChangelogWorkflow,
  } = require('../scripts/resolvers/utility') as typeof import('../scripts/resolvers/utility');
  const { HOST_PATHS, HOST_COAUTHOR_TRAILERS } = require('../scripts/resolvers/types') as typeof import('../scripts/resolvers/types');

  const makeCtx = (overrides: Partial<import('../scripts/resolvers/types').TemplateContext> = {}) => ({
    skillName: 'ship',
    tmplPath: '',
    host: 'claude' as const,
    paths: HOST_PATHS['claude'],
    ...overrides,
  });

  // ── SLUG_EVAL ──

  describe('generateSlugEval', () => {
    test('uses ctx.paths.binDir', () => {
      const output = generateSlugEval(makeCtx());
      expect(output).toContain('$_GSTACK_ROOT/bin/gstack-slug');
    });

    test('no hardcoded paths', () => {
      const output = generateSlugEval(makeCtx());
      expect(output).not.toContain('~/.claude/');
      expect(output).not.toContain('~/.gstack/');
    });
  });

  // ── SLUG_SETUP ──

  describe('generateSlugSetup', () => {
    test('uses ctx.paths.binDir for gstack-slug', () => {
      const output = generateSlugSetup(makeCtx());
      expect(output).toContain('$_GSTACK_ROOT/bin/gstack-slug');
    });

    test('uses project-local state dir (not ~/.gstack/projects/)', () => {
      const output = generateSlugSetup(makeCtx());
      expect(output).toContain('$_GSTACK_ROOT/../..');
      expect(output).not.toContain('~/.gstack/projects/$SLUG');
    });

    test('all 3 hosts produce consistent structure', () => {
      for (const host of ['claude', 'codex', 'codebuddy'] as const) {
        const output = generateSlugSetup(makeCtx({ host, paths: HOST_PATHS[host] }));
        // All hosts should use the same runtime variable pattern
        expect(output).toContain('$_GSTACK_ROOT/bin/gstack-slug');
        expect(output).toContain('$_GSTACK_ROOT/../..');
        expect(output).toContain('mkdir -p');
        expect(output).not.toContain('~/.gstack/');
        expect(output).not.toContain('~/.claude/');
      }
    });
  });

  // ── BASE_BRANCH_DETECT (updated with GitLab support) ──

  describe('generateBaseBranchDetect', () => {
    test('detects platform from remote URL', () => {
      const output = generateBaseBranchDetect(makeCtx());
      expect(output).toContain('git remote get-url origin');
    });

    test('supports GitHub', () => {
      const output = generateBaseBranchDetect(makeCtx());
      expect(output).toContain('gh pr view');
      expect(output).toContain('gh repo view');
    });

    test('supports GitLab', () => {
      const output = generateBaseBranchDetect(makeCtx());
      expect(output).toContain('glab mr view');
      expect(output).toContain('glab repo view');
    });

    test('has git-native fallback', () => {
      const output = generateBaseBranchDetect(makeCtx());
      expect(output).toContain('git symbolic-ref');
      expect(output).toContain('origin/main');
      expect(output).toContain('origin/master');
    });

    test('mentions PR/MR creation (not just gh pr create)', () => {
      const output = generateBaseBranchDetect(makeCtx());
      expect(output).toContain('PR/MR creation command');
    });

    test('fallback precedence: main > master > final fallback', () => {
      const output = generateBaseBranchDetect(makeCtx());
      // The git-native fallback should try main before master
      const mainPos = output.indexOf('origin/main');
      const masterPos = output.indexOf('origin/master');
      expect(mainPos).toBeGreaterThan(-1);
      expect(masterPos).toBeGreaterThan(-1);
      expect(mainPos).toBeLessThan(masterPos);
    });

    test('output is host-agnostic (identical for all hosts)', () => {
      const claudeOutput = generateBaseBranchDetect(makeCtx());
      const codebuddyOutput = generateBaseBranchDetect(makeCtx({ host: 'codebuddy', paths: HOST_PATHS['codebuddy'] }));
      const codexOutput = generateBaseBranchDetect(makeCtx({ host: 'codex', paths: HOST_PATHS['codex'] }));
      expect(claudeOutput).toBe(codebuddyOutput);
      expect(claudeOutput).toBe(codexOutput);
    });
  });

  // ── DEPLOY_BOOTSTRAP ──

  describe('generateDeployBootstrap', () => {
    test('detects multiple deploy platforms', () => {
      const output = generateDeployBootstrap(makeCtx());
      expect(output).toContain('PLATFORM:fly');
      expect(output).toContain('PLATFORM:vercel');
      expect(output).toContain('PLATFORM:heroku');
      expect(output).toContain('PLATFORM:netlify');
      expect(output).toContain('PLATFORM:render');
      expect(output).toContain('PLATFORM:railway');
    });

    test('checks for persisted deploy config in CLAUDE.md', () => {
      const output = generateDeployBootstrap(makeCtx());
      expect(output).toContain('Deploy Configuration');
      expect(output).toContain('PERSISTED_PLATFORM');
    });

    test('detects deploy workflows', () => {
      const output = generateDeployBootstrap(makeCtx());
      expect(output).toContain('DEPLOY_WORKFLOW');
      expect(output).toContain('STAGING_WORKFLOW');
    });

    test('references /setup-deploy skill', () => {
      const output = generateDeployBootstrap(makeCtx());
      expect(output).toContain('/setup-deploy');
    });

    test('no hardcoded paths', () => {
      const output = generateDeployBootstrap(makeCtx());
      expect(output).not.toContain('~/.gstack/');
      expect(output).not.toContain('~/.claude/');
    });

    test('output is host-agnostic (identical for all hosts)', () => {
      const claudeOutput = generateDeployBootstrap(makeCtx());
      const codebuddyOutput = generateDeployBootstrap(makeCtx({ host: 'codebuddy', paths: HOST_PATHS['codebuddy'] }));
      expect(claudeOutput).toBe(codebuddyOutput);
    });
  });

  // ── CO_AUTHOR_TRAILER ──

  describe('generateCoAuthorTrailer', () => {
    test('returns HOST_COAUTHOR_TRAILERS for each host', () => {
      for (const host of ['claude', 'codex', 'codebuddy'] as const) {
        const output = generateCoAuthorTrailer(makeCtx({ host, paths: HOST_PATHS[host] }));
        expect(output).toBe(HOST_COAUTHOR_TRAILERS[host]);
      }
    });

    test('claude trailer mentions Claude', () => {
      const output = generateCoAuthorTrailer(makeCtx());
      expect(output).toContain('Claude');
    });

    test('codebuddy trailer mentions CodeBuddy', () => {
      const output = generateCoAuthorTrailer(makeCtx({ host: 'codebuddy', paths: HOST_PATHS['codebuddy'] }));
      expect(output).toContain('CodeBuddy');
    });

    test('codex trailer mentions Codex', () => {
      const output = generateCoAuthorTrailer(makeCtx({ host: 'codex', paths: HOST_PATHS['codex'] }));
      expect(output).toContain('Codex');
    });
  });

  // ── CHANGELOG_WORKFLOW ──

  describe('generateChangelogWorkflow', () => {
    test('produces non-empty output', () => {
      const output = generateChangelogWorkflow(makeCtx());
      expect(output.length).toBeGreaterThan(100);
    });

    test('includes 6-step workflow', () => {
      const output = generateChangelogWorkflow(makeCtx());
      expect(output).toContain('1. Read `CHANGELOG.md`');
      expect(output).toContain('2. **First, enumerate every commit');
      expect(output).toContain('3. **Read the full diff**');
      expect(output).toContain('4. **Group commits by theme**');
      expect(output).toContain('5. **Write the CHANGELOG entry**');
      expect(output).toContain('6. **Cross-check:**');
    });

    test('includes Keep-a-Changelog sections', () => {
      const output = generateChangelogWorkflow(makeCtx());
      expect(output).toContain('### Added');
      expect(output).toContain('### Changed');
      expect(output).toContain('### Fixed');
      expect(output).toContain('### Removed');
    });

    test('voice guidance — user-facing, not implementation', () => {
      const output = generateChangelogWorkflow(makeCtx());
      expect(output).toContain('Lead with what the user can now **do**');
      expect(output).toContain('Never mention TODOS.md');
    });

    test('does not ask user to describe changes', () => {
      const output = generateChangelogWorkflow(makeCtx());
      expect(output).toContain('Do NOT ask the user to describe changes');
    });

    test('output is host-agnostic (identical for all hosts)', () => {
      const claudeOutput = generateChangelogWorkflow(makeCtx());
      const codebuddyOutput = generateChangelogWorkflow(makeCtx({ host: 'codebuddy', paths: HOST_PATHS['codebuddy'] }));
      const codexOutput = generateChangelogWorkflow(makeCtx({ host: 'codex', paths: HOST_PATHS['codex'] }));
      expect(claudeOutput).toBe(codebuddyOutput);
      expect(claudeOutput).toBe(codexOutput);
    });

    test('no hardcoded brand names', () => {
      const output = generateChangelogWorkflow(makeCtx());
      expect(output).not.toContain('Claude Code');
      expect(output).not.toContain('CC+gstack');
    });
  });
});

// ─── Phase 2: Learnings resolver tests ─────────────────────────────────

describe('Phase 2 learnings resolvers', () => {
  const {
    generateLearningsSearch,
    generateLearningsLog,
  } = require('../scripts/resolvers/learnings') as typeof import('../scripts/resolvers/learnings');
  const { HOST_PATHS } = require('../scripts/resolvers/types') as typeof import('../scripts/resolvers/types');

  const makeCtx = (overrides: Partial<import('../scripts/resolvers/types').TemplateContext> = {}) => ({
    skillName: 'review',
    tmplPath: '',
    host: 'claude' as const,
    paths: HOST_PATHS['claude'],
    ...overrides,
  });

  describe('generateLearningsSearch', () => {
    test('produces non-empty output', () => {
      const output = generateLearningsSearch(makeCtx());
      expect(output.length).toBeGreaterThan(100);
    });

    test('contains prior learnings header', () => {
      const output = generateLearningsSearch(makeCtx());
      expect(output).toContain('## Prior Learnings');
    });

    test('references gstack-learnings-search bin script', () => {
      const output = generateLearningsSearch(makeCtx());
      expect(output).toContain('gstack-learnings-search');
    });

    test('includes cross-project discovery flow for claude/codebuddy hosts', () => {
      const output = generateLearningsSearch(makeCtx());
      expect(output).toContain('cross-project');
      expect(output).toContain('gstack-config');
      expect(output).toContain('AskUserQuestion');
    });

    test('uses ctx.paths.binDir for script paths (no hardcoded paths)', () => {
      const claudeOutput = generateLearningsSearch(makeCtx());
      expect(claudeOutput).toContain(HOST_PATHS['claude'].binDir);
      expect(claudeOutput).not.toContain('~/.gstack/');
      expect(claudeOutput).not.toContain('~/.claude/');

      const codebuddyOutput = generateLearningsSearch(makeCtx({ host: 'codebuddy', paths: HOST_PATHS['codebuddy'] }));
      expect(codebuddyOutput).toContain(HOST_PATHS['codebuddy'].binDir);
    });

    test('codex host gets simpler version without cross-project', () => {
      const output = generateLearningsSearch(makeCtx({ host: 'codex', paths: HOST_PATHS['codex'] }));
      expect(output).toContain('## Prior Learnings');
      expect(output).toContain('$GSTACK_BIN');
      expect(output).not.toContain('gstack-config');
      expect(output).not.toContain('AskUserQuestion');
    });

    test('no hardcoded paths for any host', () => {
      for (const host of ['claude', 'codebuddy', 'codex'] as const) {
        const output = generateLearningsSearch(makeCtx({ host, paths: HOST_PATHS[host] }));
        expect(output).not.toContain('~/.gstack/');
        expect(output).not.toContain('~/.claude/');
      }
    });
  });

  describe('generateLearningsLog', () => {
    test('produces non-empty output', () => {
      const output = generateLearningsLog(makeCtx());
      expect(output.length).toBeGreaterThan(100);
    });

    test('contains capture learnings header', () => {
      const output = generateLearningsLog(makeCtx());
      expect(output).toContain('## Capture Learnings');
    });

    test('references gstack-learnings-log bin script', () => {
      const output = generateLearningsLog(makeCtx());
      expect(output).toContain('gstack-learnings-log');
    });

    test('uses ctx.paths.binDir for script path (no hardcoded paths)', () => {
      const claudeOutput = generateLearningsLog(makeCtx());
      expect(claudeOutput).toContain(HOST_PATHS['claude'].binDir);

      const codebuddyOutput = generateLearningsLog(makeCtx({ host: 'codebuddy', paths: HOST_PATHS['codebuddy'] }));
      expect(codebuddyOutput).toContain(HOST_PATHS['codebuddy'].binDir);
    });

    test('codex host uses $GSTACK_BIN', () => {
      const output = generateLearningsLog(makeCtx({ host: 'codex', paths: HOST_PATHS['codex'] }));
      expect(output).toContain('$GSTACK_BIN');
    });

    test('includes skillName in JSON template', () => {
      const reviewOutput = generateLearningsLog(makeCtx({ skillName: 'review' }));
      expect(reviewOutput).toContain('"skill":"review"');

      const shipOutput = generateLearningsLog(makeCtx({ skillName: 'ship' }));
      expect(shipOutput).toContain('"skill":"ship"');
    });

    test('documents all learning types', () => {
      const output = generateLearningsLog(makeCtx());
      expect(output).toContain('pattern');
      expect(output).toContain('pitfall');
      expect(output).toContain('preference');
      expect(output).toContain('architecture');
      expect(output).toContain('tool');
    });

    test('documents confidence scale', () => {
      const output = generateLearningsLog(makeCtx());
      expect(output).toContain('Confidence');
      expect(output).toContain('1-10');
    });

    test('no hardcoded paths for any host', () => {
      for (const host of ['claude', 'codebuddy', 'codex'] as const) {
        const output = generateLearningsLog(makeCtx({ host, paths: HOST_PATHS[host] }));
        expect(output).not.toContain('~/.gstack/');
        expect(output).not.toContain('~/.claude/');
      }
    });
  });
});

// ─── Phase 4G-2: Design setup + shotgun loop resolver tests ───────────

describe('Phase 4G-2 design resolvers', () => {
  const { generateDesignSetup, generateDesignShotgunLoop } = require('../scripts/resolvers/design') as typeof import('../scripts/resolvers/design');
  const { HOST_PATHS } = require('../scripts/resolvers/types') as typeof import('../scripts/resolvers/types');

  const makeCtx = (overrides: Partial<import('../scripts/resolvers/types').TemplateContext> = {}) => ({
    skillName: 'design-shotgun',
    tmplPath: '',
    host: 'claude' as const,
    paths: HOST_PATHS.claude,
    ...overrides,
  });

  describe('generateDesignSetup', () => {
    test('contains design binary detection with DESIGN_READY/DESIGN_NOT_AVAILABLE', () => {
      const output = generateDesignSetup(makeCtx());
      expect(output).toContain('DESIGN_READY');
      expect(output).toContain('DESIGN_NOT_AVAILABLE');
      expect(output).toContain('design/dist/design');
    });

    test('uses _GSTACK_ROOT for design binary path (not hardcoded)', () => {
      const output = generateDesignSetup(makeCtx());
      expect(output).toContain('_GSTACK_ROOT');
      expect(output).not.toContain('~/.claude/skills');
      expect(output).not.toContain('~/.gstack/');
    });

    test('sets up _DESIGN_DIR in state directory', () => {
      const output = generateDesignSetup(makeCtx());
      expect(output).toContain('_DESIGN_DIR');
      expect(output).toContain('_STATE_DIR');
      expect(output).toContain('GSTACK_STATE_DIR');
      expect(output).toContain('mkdir -p "$_DESIGN_DIR"');
    });

    test('checks for DESIGN.md constraints', () => {
      const output = generateDesignSetup(makeCtx());
      expect(output).toContain('DESIGN.md');
      expect(output).toContain('design-system.md');
      expect(output).toContain('/design-consultation');
    });

    test('has gstack root probe chain for all hosts', () => {
      for (const host of ['claude', 'codebuddy', 'codex'] as const) {
        const output = generateDesignSetup(makeCtx({ host, paths: HOST_PATHS[host] }));
        expect(output).toContain('_GSTACK_ROOT=""');
      }
    });

    test('no hardcoded paths for any host', () => {
      for (const host of ['claude', 'codebuddy', 'codex'] as const) {
        const output = generateDesignSetup(makeCtx({ host, paths: HOST_PATHS[host] }));
        expect(output).not.toContain('~/.gstack/');
      }
    });
  });

  describe('generateDesignShotgunLoop', () => {
    test('contains variant generation workflow', () => {
      const output = generateDesignShotgunLoop(makeCtx());
      expect(output).toContain('$D variants');
      expect(output).toContain('$D compare');
      expect(output).toContain('$D iterate');
    });

    test('contains comparison board flow', () => {
      const output = generateDesignShotgunLoop(makeCtx());
      expect(output).toContain('design-board.html');
      expect(output).toContain('--serve');
      expect(output).toContain('variant-A.png');
      expect(output).toContain('variant-B.png');
      expect(output).toContain('variant-C.png');
    });

    test('has AskUserQuestion fallback for when $D serve fails', () => {
      const output = generateDesignShotgunLoop(makeCtx());
      expect(output).toContain('Variant A');
      expect(output).toContain('Variant B');
      expect(output).toContain('Variant C');
    });

    test('saves approved choice to approved.json', () => {
      const output = generateDesignShotgunLoop(makeCtx());
      expect(output).toContain('approved.json');
      expect(output).toContain('approved_variant');
      expect(output).toContain('"screen":"shotgun"');
    });

    test('handles feedback with regeneration loop', () => {
      const output = generateDesignShotgunLoop(makeCtx());
      expect(output).toContain('"regenerated": true');
      expect(output).toContain('"regenerated": false');
      expect(output).toContain('regenerateAction');
      expect(output).toContain('remixSpec');
    });

    test('has gstack root probe chain in save step', () => {
      for (const host of ['claude', 'codebuddy', 'codex'] as const) {
        const output = generateDesignShotgunLoop(makeCtx({ host, paths: HOST_PATHS[host] }));
        expect(output).toContain('_GSTACK_ROOT=""');
      }
    });

    test('no hardcoded paths for any host', () => {
      for (const host of ['claude', 'codebuddy', 'codex'] as const) {
        const output = generateDesignShotgunLoop(makeCtx({ host, paths: HOST_PATHS[host] }));
        expect(output).not.toContain('~/.gstack/');
        expect(output).not.toContain('~/.claude/');
      }
    });
  });
});
