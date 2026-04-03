#!/usr/bin/env bun
/**
 * skill:check — Health summary for all SKILL.md files.
 *
 * Reports:
 *   - Command validation (valid/invalid/snapshot errors)
 *   - Template coverage (which SKILL.md files have .tmpl sources)
 *   - Freshness check (generated files match committed files)
 */

import { validateSkill } from '../test/helpers/skill-parser';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT = path.resolve(import.meta.dir, '..');

// Find all Claude SKILL.md files from dist/claude/
const CLAUDE_DIR = path.join(ROOT, 'dist', 'claude');
const SKILL_FILES = fs.existsSync(CLAUDE_DIR)
  ? fs.readdirSync(CLAUDE_DIR)
      .filter(d => fs.existsSync(path.join(CLAUDE_DIR, d, 'SKILL.md')))
      .map(d => `dist/claude/${d}/SKILL.md`)
  : [];

let hasErrors = false;

// ─── Skills ─────────────────────────────────────────────────

console.log('  Skills:');
for (const file of SKILL_FILES) {
  const fullPath = path.join(ROOT, file);
  const result = validateSkill(fullPath);

  if (result.warnings.length > 0) {
    console.log(`  \u26a0\ufe0f  ${file.padEnd(30)} — ${result.warnings.join(', ')}`);
    continue;
  }

  const totalValid = result.valid.length;
  const totalInvalid = result.invalid.length;
  const totalSnapErrors = result.snapshotFlagErrors.length;

  if (totalInvalid > 0 || totalSnapErrors > 0) {
    hasErrors = true;
    console.log(`  \u274c ${file.padEnd(30)} — ${totalValid} valid, ${totalInvalid} invalid, ${totalSnapErrors} snapshot errors`);
    for (const inv of result.invalid) {
      console.log(`      line ${inv.line}: unknown command '${inv.command}'`);
    }
    for (const se of result.snapshotFlagErrors) {
      console.log(`      line ${se.command.line}: ${se.error}`);
    }
  } else {
    console.log(`  \u2705 ${file.padEnd(30)} — ${totalValid} commands, all valid`);
  }
}

// ─── Templates ──────────────────────────────────────────────

console.log('\n  Templates:');

// Dynamically discover templates
const TEMPLATES: Array<{ tmpl: string; output: string }> = [];
const SKILL_TEMPLATES_DIR = path.join(ROOT, 'skill-templates');
if (fs.existsSync(path.join(SKILL_TEMPLATES_DIR, 'SKILL.md.tmpl'))) {
  TEMPLATES.push({ tmpl: 'skill-templates/SKILL.md.tmpl', output: 'dist/claude/gstack/SKILL.md' });
}
if (fs.existsSync(SKILL_TEMPLATES_DIR)) {
  for (const entry of fs.readdirSync(SKILL_TEMPLATES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const tmplFile = path.join(SKILL_TEMPLATES_DIR, entry.name, 'SKILL.md.tmpl');
    if (fs.existsSync(tmplFile)) {
      const skillName = entry.name.startsWith('gstack-') ? entry.name.slice('gstack-'.length) : entry.name;
      TEMPLATES.push({ tmpl: `skill-templates/${entry.name}/SKILL.md.tmpl`, output: `dist/claude/${skillName}/SKILL.md` });
    }
  }
}
// Also scan ROOT for any remaining templates (e.g. browse/)
for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'skill-templates') continue;
  const tmplFile = path.join(ROOT, entry.name, 'SKILL.md.tmpl');
  if (fs.existsSync(tmplFile)) {
    const skillName = entry.name.startsWith('gstack-') ? entry.name.slice('gstack-'.length) : entry.name;
    TEMPLATES.push({ tmpl: `${entry.name}/SKILL.md.tmpl`, output: `dist/claude/${skillName}/SKILL.md` });
  }
}

for (const { tmpl, output } of TEMPLATES) {
  const tmplPath = path.join(ROOT, tmpl);
  const outPath = path.join(ROOT, output);
  if (!fs.existsSync(tmplPath)) {
    console.log(`  \u26a0\ufe0f  ${output.padEnd(45)} — no template`);
    continue;
  }
  if (!fs.existsSync(outPath)) {
    hasErrors = true;
    console.log(`  \u274c ${output.padEnd(45)} — generated file missing! Run: bun run gen:skill-docs`);
    continue;
  }
  console.log(`  \u2705 ${tmpl.padEnd(35)} \u2192 ${output}`);
}

// ─── Codex Skills ───────────────────────────────────────────

const CODEX_DIR = path.join(ROOT, 'dist', 'codex');
if (fs.existsSync(CODEX_DIR)) {
  console.log('\n  Codex Skills (dist/codex/):');
  const codexDirs = fs.readdirSync(CODEX_DIR).sort();
  let codexCount = 0;
  let codexMissing = 0;
  for (const dir of codexDirs) {
    const skillMd = path.join(CODEX_DIR, dir, 'SKILL.md');
    if (fs.existsSync(skillMd)) {
      codexCount++;
      const content = fs.readFileSync(skillMd, 'utf-8');
      // Quick validation: must have frontmatter with name + description only
      const hasClaude = content.includes('.claude/skills');
      if (hasClaude) {
        hasErrors = true;
        console.log(`  \u274c ${dir.padEnd(30)} — contains .claude/skills reference`);
      } else {
        console.log(`  \u2705 ${dir.padEnd(30)} — OK`);
      }
    } else {
      codexMissing++;
      hasErrors = true;
      console.log(`  \u274c ${dir.padEnd(30)} — SKILL.md missing`);
    }
  }
  console.log(`  Total: ${codexCount} skills, ${codexMissing} missing`);
} else {
  console.log('\n  Codex Skills: dist/codex/ not found (run: bun run gen:skill-docs --host codex)');
}

// ─── CodeBuddy Skills ───────────────────────────────────────

const CODEBUDDY_DIR = path.join(ROOT, 'dist', 'codebuddy');
if (fs.existsSync(CODEBUDDY_DIR)) {
  console.log('\n  CodeBuddy Skills (dist/codebuddy/):');
  const codebuddyDirs = fs.readdirSync(CODEBUDDY_DIR).sort();
  let codebuddyCount = 0;
  let codebuddyMissing = 0;
  for (const dir of codebuddyDirs) {
    const skillMd = path.join(CODEBUDDY_DIR, dir, 'SKILL.md');
    if (fs.existsSync(skillMd)) {
      codebuddyCount++;
      const content = fs.readFileSync(skillMd, 'utf-8');
      // Quick validation: must not contain .claude/skills or .codex/skills references
      const hasClaude = content.includes('.claude/skills');
      const hasCodex = content.includes('.codex/skills');
      if (hasClaude || hasCodex) {
        hasErrors = true;
        const refs = [hasClaude && '.claude/skills', hasCodex && '.codex/skills'].filter(Boolean).join(', ');
        console.log(`  ❌ ${dir.padEnd(30)} — contains ${refs} reference`);
      } else {
        console.log(`  ✅ ${dir.padEnd(30)} — OK`);
      }
    } else {
      codebuddyMissing++;
      hasErrors = true;
      console.log(`  ❌ ${dir.padEnd(30)} — SKILL.md missing`);
    }
  }
  console.log(`  Total: ${codebuddyCount} skills, ${codebuddyMissing} missing`);
} else {
  console.log('\n  CodeBuddy Skills: dist/codebuddy/ not found (run: bun run gen:skill-docs --host codebuddy)');
}

// ─── Freshness ──────────────────────────────────────────────

console.log('\n  Freshness (Claude):');
try {
  execSync('bun run scripts/gen-skill-docs.ts --dry-run', { cwd: ROOT, stdio: 'pipe' });
  console.log('  \u2705 All Claude generated files are fresh');
} catch (err: any) {
  hasErrors = true;
  const output = err.stdout?.toString() || '';
  console.log('  \u274c Claude generated files are stale:');
  for (const line of output.split('\n').filter((l: string) => l.startsWith('STALE'))) {
    console.log(`      ${line}`);
  }
  console.log('      Run: bun run gen:skill-docs');
}

console.log('\n  Freshness (Codex):');
try {
  execSync('bun run scripts/gen-skill-docs.ts --host codex --dry-run', { cwd: ROOT, stdio: 'pipe' });
  console.log('  \u2705 All Codex generated files are fresh');
} catch (err: any) {
  hasErrors = true;
  const output = err.stdout?.toString() || '';
  console.log('  \u274c Codex generated files are stale:');
  for (const line of output.split('\n').filter((l: string) => l.startsWith('STALE'))) {
    console.log(`      ${line}`);
  }
  console.log('      Run: bun run gen:skill-docs --host codex');
}

console.log('\n  Freshness (CodeBuddy):');
try {
  execSync('bun run scripts/gen-skill-docs.ts --host codebuddy --dry-run', { cwd: ROOT, stdio: 'pipe' });
  console.log('  ✅ All CodeBuddy generated files are fresh');
} catch (err: any) {
  hasErrors = true;
  const output = err.stdout?.toString() || '';
  console.log('  ❌ CodeBuddy generated files are stale:');
  for (const line of output.split('\n').filter((l: string) => l.startsWith('STALE'))) {
    console.log(`      ${line}`);
  }
  console.log('      Run: bun run gen:skill-docs --host codebuddy');
}

console.log('');
process.exit(hasErrors ? 1 : 0);
