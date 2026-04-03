#!/usr/bin/env bun
/**
 * Generate SKILL.md files from .tmpl templates.
 *
 * Pipeline:
 *   read .tmpl → find {{PLACEHOLDERS}} → resolve from source → format → write .md
 *
 * Supports --dry-run: generate to memory, exit 1 if different from committed file.
 * Used by skill:check and CI freshness checks.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Host, TemplateContext } from './resolvers';
import {
  HOST_PATHS,
  HOST_BRAND_NAMES,
  HOST_SHORT_BRANDS,
  HOST_PLATFORM_NAMES,
  HOST_COAUTHOR_TRAILERS,
  HOST_PR_FOOTER_LINKS,
  RESOLVERS,
  generateGstackRootDetect,
} from './resolvers';

const ROOT = path.resolve(import.meta.dir, '..');
const DRY_RUN = process.argv.includes('--dry-run');

// ─── Host Detection ─────────────────────────────────────────

const HOST_ARG = process.argv.find(a => a.startsWith('--host'));
const HOST: Host = (() => {
  if (!HOST_ARG) return 'claude';
  const val = HOST_ARG.includes('=') ? HOST_ARG.split('=')[1] : process.argv[process.argv.indexOf(HOST_ARG) + 1];
  if (val === 'codex' || val === 'agents') return 'codex';
  if (val === 'claude') return 'claude';
  if (val === 'codebuddy') return 'codebuddy';
  throw new Error(`Unknown host: ${val}. Use claude, codex, agents, or codebuddy.`);
})();

// ─── Host Helpers ────────────────────────────────────────────

/**
 * Compute the canonical skill directory name for any host.
 * Root template → 'gstack', sub-skills use their directory name directly (no prefix).
 */
function hostSkillName(skillDir: string): string {
  if (skillDir === '.' || skillDir === '') return 'gstack';
  return skillDir;
}

// Legacy alias — referenced by tests and other scripts
const codexSkillName = hostSkillName;

/**
 * Transform frontmatter for Codex: keep only name + description.
 * Strips allowed-tools, hooks, version, and all other fields.
 * Handles multiline block scalar descriptions (YAML | syntax).
 */
function transformFrontmatter(content: string, host: Host): string {
  if (host === 'claude') return content;

  // Find frontmatter boundaries
  const fmStart = content.indexOf('---\n');
  if (fmStart !== 0) return content; // frontmatter must be at the start
  const fmEnd = content.indexOf('\n---', fmStart + 4);
  if (fmEnd === -1) return content;

  const frontmatter = content.slice(fmStart + 4, fmEnd);
  const body = content.slice(fmEnd + 4); // includes the leading \n after ---

  // Parse name
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const name = nameMatch ? nameMatch[1].trim() : '';

  // Parse description — handle both simple and block scalar (|) formats
  let description = '';
  const lines = frontmatter.split('\n');
  let inDescription = false;
  const descLines: string[] = [];
  for (const line of lines) {
    if (line.match(/^description:\s*\|?\s*$/)) {
      // Block scalar start: "description: |" or "description:"
      inDescription = true;
      continue;
    }
    if (line.match(/^description:\s*\S/)) {
      // Simple inline: "description: some text"
      description = line.replace(/^description:\s*/, '').trim();
      break;
    }
    if (inDescription) {
      // Block scalar continuation — indented lines (2 spaces) or blank lines
      if (line === '' || line.match(/^\s/)) {
        descLines.push(line.replace(/^  /, ''));
      } else {
        // End of block scalar — hit a non-indented, non-blank line
        break;
      }
    }
  }
  if (descLines.length > 0) {
    description = descLines.join('\n').trim();
  }

  // Re-emit Codex frontmatter (name + description only)
  const indentedDesc = description.split('\n').map(l => `  ${l}`).join('\n');
  const codexFm = `---\nname: ${name}\ndescription: |\n${indentedDesc}\n---`;
  return codexFm + body;
}

/**
 * Transform frontmatter for CodeBuddy: keep name + description + allowed-tools.
 * Strips hooks, version, and other Claude Code-specific fields.
 * CodeBuddy Skills support allowed-tools natively (unlike Codex which strips them).
 */
function transformFrontmatterForCodebuddy(content: string): string {
  // Find frontmatter boundaries
  const fmStart = content.indexOf('---\n');
  if (fmStart !== 0) return content;
  const fmEnd = content.indexOf('\n---', fmStart + 4);
  if (fmEnd === -1) return content;

  const frontmatter = content.slice(fmStart + 4, fmEnd);
  const body = content.slice(fmEnd + 4);

  // Parse name
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const name = nameMatch ? nameMatch[1].trim() : '';

  // Parse description — handle both simple and block scalar (|) formats
  let description = '';
  const lines = frontmatter.split('\n');
  let inDescription = false;
  const descLines: string[] = [];
  for (const line of lines) {
    if (line.match(/^description:\s*\|?\s*$/)) {
      inDescription = true;
      continue;
    }
    if (line.match(/^description:\s*\S/)) {
      description = line.replace(/^description:\s*/, '').trim();
      break;
    }
    if (inDescription) {
      if (line === '' || line.match(/^\s/)) {
        descLines.push(line.replace(/^  /, ''));
      } else {
        break;
      }
    }
  }
  if (descLines.length > 0) {
    description = descLines.join('\n').trim();
  }

  // Parse allowed-tools (list of indented "  - " entries)
  const allowedTools: string[] = [];
  let inAllowedTools = false;
  for (const line of lines) {
    if (line.match(/^allowed-tools:\s*$/)) {
      inAllowedTools = true;
      continue;
    }
    if (inAllowedTools) {
      if (line.match(/^\s+-\s/)) {
        allowedTools.push(line);
      } else {
        break;
      }
    }
  }

  // Re-emit CodeBuddy frontmatter: name + description + allowed-tools (if present)
  const indentedDesc = description.split('\n').map(l => `  ${l}`).join('\n');
  let codebuddyFm = `---\nname: ${name}\ndescription: |\n${indentedDesc}\n`;

  if (allowedTools.length > 0) {
    codebuddyFm += `allowed-tools:\n${allowedTools.join('\n')}\n`;
  }

  codebuddyFm += '---';
  return codebuddyFm + body;
}

/**
 * Extract hook descriptions from frontmatter for inline safety prose.
 * Returns a description of what the hooks do, or null if no hooks.
 */
function extractHookSafetyProse(tmplContent: string): string | null {
  if (!tmplContent.match(/^hooks:/m)) return null;

  // Parse the hook matchers to build a human-readable safety description
  const matchers: string[] = [];
  const matcherRegex = /matcher:\s*"(\w+)"/g;
  let m;
  while ((m = matcherRegex.exec(tmplContent)) !== null) {
    if (!matchers.includes(m[1])) matchers.push(m[1]);
  }

  if (matchers.length === 0) return null;

  // Build safety prose based on what tools are hooked
  const toolDescriptions: Record<string, string> = {
    Bash: 'check bash commands for destructive operations (rm -rf, DROP TABLE, force-push, git reset --hard, etc.) before execution',
    Edit: 'verify file edits are within the allowed scope boundary before applying',
    Write: 'verify file writes are within the allowed scope boundary before applying',
  };

  const safetyChecks = matchers
    .map(t => toolDescriptions[t] || `check ${t} operations for safety`)
    .join(', and ');

  return `> **Safety Advisory:** This skill includes safety checks that ${safetyChecks}. When using this skill, always pause and verify before executing potentially destructive operations. If uncertain about a command's safety, ask the user for confirmation before proceeding.`;
}

// ─── Claude Path Normalization ──────────────────────────────
// Templates are authored with Claude paths as source-of-truth (e.g.
// ~/.claude/skills/gstack/bin/xxx, .claude/skills/review/checklist.md).
// This function normalizes them to host-appropriate runtime paths for ALL hosts.
//
// Replacement order: most-specific first to prevent partial matches.
//
// Probe chain safety: The probe chain (generated by generateGstackRootDetect)
// contains bare paths like "$_ROOT/.claude/skills/gstack" and
// "$HOME/.claude/skills/gstack". For Claude host, a catch-all replacement of
// bare .claude/skills/gstack would corrupt these. Non-claude hosts' probe
// chains already use .codebuddy/.agents, so catch-all is safe for them.
// The .claude/skills/review pattern is safe for ALL hosts since it never
// appears in any probe chain.

function replaceClaudePaths(content: string, ctx: TemplateContext): string {
  const { host, paths } = ctx;

  // (1) ~/.claude/skills/gstack → $_GSTACK_ROOT  (tilde-prefixed absolute paths in bash)
  content = content.replace(/~\/\.claude\/skills\/gstack/g, paths.skillRoot);

  // (2) .claude/skills/gstack → localSkillRoot  (bare relative paths in prose)
  //     Skip for Claude: probe chain contains "$_ROOT/.claude/skills/gstack" that must not be touched.
  if (host !== 'claude') {
    content = content.replace(/\.claude\/skills\/gstack/g, paths.localSkillRoot);
  }

  // (3) .claude/skills/review → $_GSTACK_ROOT/review  (sidecar file references — ALL hosts)
  content = content.replace(/\.claude\/skills\/review/g, `${paths.skillRoot}/review`);

  // (4) ~/.claude/skills → $_GSTACK_ROOT  (tilde-prefixed catch-all)
  content = content.replace(/~\/\.claude\/skills/g, paths.skillRoot);

  // (5) .claude/skills → $_GSTACK_ROOT  (bare catch-all — non-claude only, same probe chain concern as #2)
  if (host !== 'claude') {
    content = content.replace(/\.claude\/skills/g, paths.skillRoot);
  }

  // (6) ${CLAUDE_SKILL_DIR} → $_GSTACK_ROOT  (legacy runtime variable)
  content = content.replace(/\$\{CLAUDE_SKILL_DIR\}/g, paths.skillRoot);

  return content;
}

// ─── Preamble Tier Mapping ──────────────────────────────────
// Upstream v0.14.3 preambleTier system:
//   T1 — Minimal (no voice/completeness): browse, benchmark
//   T2 — Standard: most skills (default)
//   T3 — Enhanced: investigate, qa, qa-only
//   T4 — Full (completion audit): ship, review
//
// Key: hostSkillName(skillDir) output (e.g. 'gstack' for root, 'browse' for browse/)
//
// NOTE: Tier mapping is defined but NOT yet activated. All skills currently get
// tier=undefined (full preamble output, backward compatible). Activation will
// happen per-skill during Phase 3 (template upgrades) to avoid breaking existing
// test expectations. To activate for a skill, uncomment the tier assignment in
// processTemplate() below.

export const SKILL_TIER_MAP: Record<string, number> = {
  // T1 — Minimal preamble (lightweight tools, no voice/completeness)
  'benchmark': 1,
  'browse': 1,

  // T2 — Standard preamble (most skills)
  'canary': 2,
  'cso': 2,
  'gstack': 2,
  'learn': 2,
  'office-hours': 2,
  'plan-ceo-review': 2,
  'plan-eng-review': 2,
  'plan-design-review': 2,
  'design-consultation': 2,
  'design-review': 2,
  'design-shotgun': 2,
  'design-html': 2,
  'document-release': 2,
  'retro': 2,
  'codex': 2,
  'setup-browser-cookies': 2,
  'setup-deploy': 2,

  // T3 — Enhanced preamble (deep investigation skills)
  'investigate': 3,
  'qa': 3,
  'qa-only': 3,
  'autoplan': 3,

  // T4 — Full preamble (shipping/review — includes completion audit)
  'land-and-deploy': 4,
  'ship': 4,
  'review': 4,
};

// ─── Template Processing ────────────────────────────────────

const GENERATED_HEADER = `<!-- AUTO-GENERATED from {{SOURCE}} — do not edit directly -->\n<!-- Regenerate: bun run gen:skill-docs -->\n`;

function processTemplate(tmplPath: string, host: Host = 'claude'): { outputPath: string; content: string } {
  const tmplContent = fs.readFileSync(tmplPath, 'utf-8');
  const relTmplPath = path.relative(ROOT, tmplPath);

  // Determine skill directory relative to ROOT
  const rawSkillDir = path.relative(ROOT, path.dirname(tmplPath));
  // Strip skill-templates/ prefix so skill-templates/qa → qa, skill-templates → .
  const skillDir = rawSkillDir.startsWith('skill-templates')
    ? rawSkillDir === 'skill-templates' ? '.' : rawSkillDir.slice('skill-templates/'.length)
    : rawSkillDir;

  // All hosts output to dist/{host}/{skillName}/SKILL.md
  const name = hostSkillName(skillDir === '.' ? '' : skillDir);
  const outputDir = path.join(ROOT, 'dist', host, name);
  fs.mkdirSync(outputDir, { recursive: true });
  let outputPath = path.join(outputDir, 'SKILL.md');

  // Extract skill name from frontmatter for TemplateContext
  const nameMatch = tmplContent.match(/^name:\s*(.+)$/m);
  const skillName = nameMatch ? nameMatch[1].trim() : path.basename(path.dirname(tmplPath));

  // Extract benefits-from list from frontmatter (inline YAML: benefits-from: [a, b])
  const benefitsMatch = tmplContent.match(/^benefits-from:\s*\[([^\]]*)\]/m);
  const benefitsFrom = benefitsMatch
    ? benefitsMatch[1].split(',').map(s => s.trim()).filter(Boolean)
    : undefined;

  const ctx: TemplateContext = { skillName, tmplPath, host, paths: HOST_PATHS[host], benefitsFrom };

  // Tier assignment: activated during Phase 3 (template upgrades).
  // Each skill gets its tier from SKILL_TIER_MAP; undefined = full preamble (backward compatible).
  const tier = SKILL_TIER_MAP[name];
  if (tier !== undefined) {
    ctx.preambleTier = tier;
  }

  // Replace placeholders — supports both simple {{NAME}} and parameterized {{NAME:arg1:arg2}}
  let content = tmplContent.replace(/\{\{(\w+(?::[^}]*)?)\}\}/g, (match, expr) => {
    const parts = expr.split(':');
    const name = parts[0];
    const args = parts.length > 1 ? parts.slice(1) : undefined;
    const resolver = RESOLVERS[name];
    if (!resolver) throw new Error(`Unknown placeholder {{${name}}} in ${relTmplPath}`);
    return resolver(ctx, args);
  });

  // Check for any remaining unresolved placeholders
  const remaining = content.match(/\{\{(\w+(?::[^}]*)?)\}\}/g);
  if (remaining) {
    throw new Error(`Unresolved placeholders in ${relTmplPath}: ${remaining.join(', ')}`);
  }

  // ─── Host-specific post-processing ──────────────────────────
  // All hosts now use $_GSTACK_ROOT runtime probe. Non-claude hosts need
  // frontmatter transformation and brand/path replacements.

  if (host === 'codex') {
    // Extract hook safety prose BEFORE transforming frontmatter (which strips hooks)
    const safetyProse = extractHookSafetyProse(tmplContent);

    // Transform frontmatter: keep only name + description
    content = transformFrontmatter(content, host);

    // Insert safety advisory at the top of the body (after frontmatter)
    if (safetyProse) {
      const bodyStart = content.indexOf('\n---') + 4;
      content = content.slice(0, bodyStart) + '\n' + safetyProse + '\n' + content.slice(bodyStart);
    }
  }

  if (host === 'codebuddy') {
    // Extract hook safety prose BEFORE transforming frontmatter (which strips hooks)
    const safetyProse = extractHookSafetyProse(tmplContent);

    // Transform frontmatter: keep name + description + allowed-tools
    content = transformFrontmatterForCodebuddy(content);

    // Insert safety advisory at the top of the body (after frontmatter)
    if (safetyProse) {
      const bodyStart = content.indexOf('\n---') + 4;
      content = content.slice(0, bodyStart) + '\n' + safetyProse + '\n' + content.slice(bodyStart);
    }

  }

  // ─── All hosts: normalize hardcoded Claude paths to runtime $_GSTACK_ROOT ──
  content = replaceClaudePaths(content, ctx);

  // ─── All hosts: replace unprefixed qa/ auxiliary file paths ──
  content = content.replace(/qa\/templates\//g, `${ctx.paths.skillRoot}/qa/templates/`);
  content = content.replace(/qa\/references\//g, `${ctx.paths.skillRoot}/qa/references/`);

  // ─── Common post-processing for non-claude hosts ──────────
  if (host !== 'claude') {
    // Replace brand names in template prose
    // IMPORTANT: PR footer link must be replaced BEFORE \bClaude Code\b (which would
    // partially match the link text, leaving the URL orphaned)
    content = content.replace(/CC\+gstack/g, HOST_BRAND_NAMES[host]);
    content = content.replace(
      /\[Claude Code\]\(https:\/\/claude\.com\/claude-code\)/g,
      HOST_PR_FOOTER_LINKS[host]
    );
    content = content.replace(/\bClaude Code\b/g, HOST_PLATFORM_NAMES[host]);
    content = content.replace(/Co-Authored-By: Claude Opus 4\.6 <noreply@anthropic\.com>/g, HOST_COAUTHOR_TRAILERS[host]);

    // Replace MCP tool reference (only relevant for Claude Code)
    content = content.replace(
      /- NEVER use `mcp__claude-in-chrome__\*` tools\. They are slow and unreliable\.\n/g,
      ''
    );

    // Replace standalone CC short brand in known phrases from templates
    content = content.replace(/\/ CC: ~/g, `/ ${HOST_SHORT_BRANDS[host]}: ~`);
    content = content.replace(/shortcut with CC,/g, `shortcut with ${HOST_SHORT_BRANDS[host]},`);
    content = content.replace(/shortcut with CC\./g, `shortcut with ${HOST_SHORT_BRANDS[host]}.`);
    content = content.replace(/seconds with CC\./g, `seconds with ${HOST_SHORT_BRANDS[host]}.`);
    content = content.replace(/With CC \+ gstack/g, `With ${HOST_BRAND_NAMES[host]}`);
  }

  // ─── All hosts: Auto-inject $_GSTACK_ROOT probe into standalone bash blocks ──
  // After path replacement, some bash blocks reference $_GSTACK_ROOT but lack
  // the probe chain (because the probe was only added to Preamble/resolver blocks).
  // This pass finds ```bash blocks containing $_GSTACK_ROOT that DON'T already
  // have the probe, and injects a compact version at the top of the block.
  const probeSnippet = generateGstackRootDetect(ctx);
  if (probeSnippet) {
    content = content.replace(/```bash\n((?:(?!```)[\s\S])*?\$_GSTACK_ROOT[\s\S]*?)```/g, (match, blockBody) => {
      // Skip if block already has the probe chain
      if (blockBody.includes('_GSTACK_ROOT=""')) return match;
      return '```bash\n' + probeSnippet + blockBody + '```';
    });
  }

  // Prepend generated header (after frontmatter)
  const header = GENERATED_HEADER.replace('{{SOURCE}}', path.basename(tmplPath));
  const fmEnd = content.indexOf('---', content.indexOf('---') + 3);
  if (fmEnd !== -1) {
    const insertAt = content.indexOf('\n', fmEnd) + 1;
    content = content.slice(0, insertAt) + header + content.slice(insertAt);
  } else {
    content = header + content;
  }

  return { outputPath, content };
}

// ─── Runtime Asset Copying (Phase 6A: Self-Contained Install) ──

/**
 * Copy runtime assets into dist/{host}/ so the output is self-contained.
 * After this runs, dist/{host}/ contains everything needed to run gstack
 * without the source repository — bin scripts, review/qa auxiliary files,
 * browse binaries, and supporting config files.
 *
 * This function is idempotent: running it multiple times produces the same result.
 * In --dry-run mode, it checks whether assets are already present and reports staleness.
 */
function copyRuntimeAssets(host: Host): void {
  const distRoot = path.join(ROOT, 'dist', host);

  // ── 1. bin/ scripts (shared runtime, used by all 22 skills via Preamble + Telemetry) ──
  const BIN_SCRIPTS = [
    'gstack-config', 'gstack-telemetry-log',
    'gstack-diff-scope', 'gstack-slug',
    'gstack-review-log', 'gstack-review-read',
    'gstack-analytics',
    'gstack-learnings-log', 'gstack-learnings-search',
    'gstack-repo-mode',
    'remote-slug',
  ];
  const binDir = path.join(distRoot, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  for (const script of BIN_SCRIPTS) {
    const src = path.join(ROOT, 'bin', script);
    const dst = path.join(binDir, script);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
      fs.chmodSync(dst, 0o755);
    }
  }

  // ── 2. review/ auxiliary markdown files ──
  const REVIEW_FILES = [
    'checklist.md', 'design-checklist.md',
    'greptile-triage.md', 'TODOS-format.md',
  ];
  const reviewDir = path.join(distRoot, hostSkillName('review'));
  // reviewDir already exists from SKILL.md generation; ensure it does
  fs.mkdirSync(reviewDir, { recursive: true });
  for (const file of REVIEW_FILES) {
    const src = path.join(ROOT, 'skill-templates', 'review', file);
    const dst = path.join(reviewDir, file);
    if (fs.existsSync(src)) {
      // All hosts now use $_GSTACK_ROOT — replace hardcoded paths in auxiliary files
      let content = fs.readFileSync(src, 'utf-8');
      content = content.replace(/~\/\.claude\/skills\/gstack/g, '$_GSTACK_ROOT');
      content = content.replace(/\.claude\/skills\/gstack/g, `dist/${host}/gstack`);
      fs.writeFileSync(dst, content);
    }
  }

  // ── 3. qa/ auxiliary files (templates + references) ──
  const qaDir = path.join(distRoot, hostSkillName('qa'));
  fs.mkdirSync(path.join(qaDir, 'templates'), { recursive: true });
  fs.mkdirSync(path.join(qaDir, 'references'), { recursive: true });

  const qaFiles = [
    { src: 'skill-templates/qa/templates/qa-report-template.md', dst: 'templates/qa-report-template.md' },
    { src: 'skill-templates/qa/references/issue-taxonomy.md', dst: 'references/issue-taxonomy.md' },
  ];
  for (const { src, dst } of qaFiles) {
    const srcPath = path.join(ROOT, src);
    const dstPath = path.join(qaDir, dst);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }

  // ── 3.5. cso/ auxiliary files (acknowledgements) ──
  const csoDir = path.join(distRoot, hostSkillName('cso'));
  fs.mkdirSync(csoDir, { recursive: true });
  const csoAck = path.join(ROOT, 'skill-templates', 'cso', 'ACKNOWLEDGEMENTS.md');
  if (fs.existsSync(csoAck)) {
    fs.copyFileSync(csoAck, path.join(csoDir, 'ACKNOWLEDGEMENTS.md'));
  }

  // ── 4. browse/bin/ scripts (used by plan-eng-review, plan-ceo-review, browse) ──
  const browseBinDir = path.join(distRoot, 'browse', 'bin');
  fs.mkdirSync(browseBinDir, { recursive: true });
  const BROWSE_BIN_SCRIPTS = ['find-browse'];
  for (const script of BROWSE_BIN_SCRIPTS) {
    const src = path.join(ROOT, 'browse', 'bin', script);
    const dst = path.join(browseBinDir, script);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
      fs.chmodSync(dst, 0o755);
    }
  }

  // ── 5. browse/dist/ binaries (compiled browse CLI + find-browse + .version) ──
  // These are large compiled binaries (~70 MB) — only copy if they exist.
  // They are built by `bun build --compile` in the build script before gen-skill-docs runs.
  const browseDistDir = path.join(distRoot, 'browse', 'dist');
  fs.mkdirSync(browseDistDir, { recursive: true });
  const BROWSE_DIST_FILES = ['browse', 'find-browse', '.version'];
  for (const file of BROWSE_DIST_FILES) {
    const src = path.join(ROOT, 'browse', 'dist', file);
    const dst = path.join(browseDistDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
      // Make binaries executable
      if (file !== '.version') {
        fs.chmodSync(dst, 0o755);
      }
    }
  }

  // ── 5.5. browse/src/ source files (runtime dependency of compiled CLI) ──
  // The compiled browse binary (cli.ts) starts the server via `bun run server.ts`.
  // server.ts is NOT bundled into the binary — it runs as an interpreted Bun script.
  // resolveServerScript() in cli.ts looks for ../src/server.ts relative to the binary.
  // Without these files, browse cannot start its server process.
  // TODO: Bundle server.ts into the compiled binary (TODOS.md P2) to eliminate this.
  const browseSrcDir = path.join(ROOT, 'browse', 'src');
  const browseSrcDst = path.join(distRoot, 'browse', 'src');
  if (fs.existsSync(browseSrcDir)) {
    fs.mkdirSync(browseSrcDst, { recursive: true });
    for (const entry of fs.readdirSync(browseSrcDir)) {
      const srcFile = path.join(browseSrcDir, entry);
      const dstFile = path.join(browseSrcDst, entry);
      if (fs.statSync(srcFile).isFile()) {
        fs.copyFileSync(srcFile, dstFile);
      }
    }
  }

  // ── 6. VERSION file (referenced by bin scripts for version checks) ──
  const versionFile = path.join(ROOT, 'VERSION');
  if (fs.existsSync(versionFile)) {
    fs.copyFileSync(versionFile, path.join(distRoot, 'VERSION'));
  }

  console.log(`ASSETS: copied runtime assets to dist/${host}/`);
}

// ─── Main ───────────────────────────────────────────────────

function findTemplates(): string[] {
  const templates: string[] = [];
  const SKILL_TEMPLATES_DIR = path.join(ROOT, 'skill-templates');

  // Root-level template (now lives in skill-templates/)
  const rootTmpl = path.join(SKILL_TEMPLATES_DIR, 'SKILL.md.tmpl');
  if (fs.existsSync(rootTmpl)) templates.push(rootTmpl);

  // Scan skill-templates/ subdirectories
  if (fs.existsSync(SKILL_TEMPLATES_DIR)) {
    for (const entry of fs.readdirSync(SKILL_TEMPLATES_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const tmpl = path.join(SKILL_TEMPLATES_DIR, entry.name, 'SKILL.md.tmpl');
      if (fs.existsSync(tmpl)) templates.push(tmpl);
    }
  }

  // Also scan ROOT for any remaining templates (e.g. browse/)
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'skill-templates') continue;
    const tmpl = path.join(ROOT, entry.name, 'SKILL.md.tmpl');
    if (fs.existsSync(tmpl)) templates.push(tmpl);
  }
  return templates;
}

let hasChanges = false;

for (const tmplPath of findTemplates()) {
  // Skip /codex skill for codex/codebuddy hosts (self-referential — it's a Claude wrapper around codex exec)
  if (HOST === 'codex' || HOST === 'codebuddy') {
    const dir = path.basename(path.dirname(tmplPath));
    if (dir === 'codex') continue;
  }

  const { outputPath, content } = processTemplate(tmplPath, HOST);
  const relOutput = path.relative(ROOT, outputPath);

  if (DRY_RUN) {
    const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf-8') : '';
    if (existing !== content) {
      console.log(`STALE: ${relOutput}`);
      hasChanges = true;
    } else {
      console.log(`FRESH: ${relOutput}`);
    }
  } else {
    fs.writeFileSync(outputPath, content);
    console.log(`GENERATED: ${relOutput}`);
  }
}

// Copy runtime assets to dist/{host}/ for self-contained installs (Phase 6A)
if (!DRY_RUN) {
  copyRuntimeAssets(HOST);
}

if (DRY_RUN && hasChanges) {
  console.error('\nGenerated SKILL.md files are stale. Run: bun run gen:skill-docs');
  process.exit(1);
}
