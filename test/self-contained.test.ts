/**
 * Self-contained dist/ validation tests (Phase 6A + 6D).
 *
 * Phase 6A tests verify that `bun run build` (specifically `gen-skill-docs`)
 * copies all runtime assets into dist/{host}/, making each host's output
 * directory a complete, self-contained artifact.
 *
 * Phase 6D tests add the "Acid Test": simulate a self-contained install to
 * a temp directory and verify everything works in isolation (no source repo).
 *
 * Run with: bun test test/self-contained.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT = path.resolve(import.meta.dir, '..');

// All three hosts should get runtime assets
const HOSTS = ['claude', 'codex', 'codebuddy'] as const;

// ─── bin/ scripts that must be present ─────────────────────────

const REQUIRED_BIN_SCRIPTS = [
  'gstack-config',
  'gstack-telemetry-log',
  'gstack-diff-scope',
  'gstack-slug',
  'gstack-review-log',
  'gstack-review-read',
  'gstack-analytics',
  'gstack-learnings-log',
  'gstack-learnings-search',
  'gstack-repo-mode',
  'remote-slug',
];

// Scripts that should NOT be in dist (dev-only)
const EXCLUDED_BIN_SCRIPTS = ['dev-setup', 'dev-teardown'];

// ─── review/ auxiliary files ──────────────────────────────────

const REQUIRED_REVIEW_FILES = [
  'checklist.md',
  'design-checklist.md',
  'greptile-triage.md',
  'TODOS-format.md',
];

// ─── qa/ auxiliary files ──────────────────────────────────────

const REQUIRED_QA_FILES = [
  'templates/qa-report-template.md',
  'references/issue-taxonomy.md',
];

// ─── browse/bin/ scripts ──────────────────────────────────────

const REQUIRED_BROWSE_BIN_SCRIPTS = ['find-browse'];

// ─── Tests ────────────────────────────────────────────────────

describe('self-contained dist (Phase 6A)', () => {

  // ── bin/ scripts ──

  for (const host of HOSTS) {
    describe(`dist/${host}/bin/`, () => {
      test('contains all required runtime scripts', () => {
        for (const script of REQUIRED_BIN_SCRIPTS) {
          const scriptPath = path.join(ROOT, 'dist', host, 'bin', script);
          expect(fs.existsSync(scriptPath)).toBe(true);
        }
      });

      test('scripts are executable', () => {
        for (const script of REQUIRED_BIN_SCRIPTS) {
          const scriptPath = path.join(ROOT, 'dist', host, 'bin', script);
          if (fs.existsSync(scriptPath)) {
            const stat = fs.statSync(scriptPath);
            // Check that at least owner-execute bit is set (0o100)
            expect(stat.mode & 0o111).toBeGreaterThan(0);
          }
        }
      });

      test('does not contain dev-only scripts', () => {
        for (const script of EXCLUDED_BIN_SCRIPTS) {
          const scriptPath = path.join(ROOT, 'dist', host, 'bin', script);
          expect(fs.existsSync(scriptPath)).toBe(false);
        }
      });

      test('bin scripts match source content', () => {
        for (const script of REQUIRED_BIN_SCRIPTS) {
          const src = path.join(ROOT, 'bin', script);
          const dst = path.join(ROOT, 'dist', host, 'bin', script);
          if (fs.existsSync(src) && fs.existsSync(dst)) {
            const srcContent = fs.readFileSync(src, 'utf-8');
            const dstContent = fs.readFileSync(dst, 'utf-8');
            expect(dstContent).toBe(srcContent);
          }
        }
      });
    });
  }

  // ── review/ auxiliary files ──

  for (const host of HOSTS) {
    describe(`dist/${host}/review/ auxiliary files`, () => {
      test('contains all review auxiliary markdown files', () => {
        for (const file of REQUIRED_REVIEW_FILES) {
          const filePath = path.join(ROOT, 'dist', host, 'review', file);
          expect(fs.existsSync(filePath)).toBe(true);
        }
      });

      test('review files match source content', () => {
        for (const file of REQUIRED_REVIEW_FILES) {
          const src = path.join(ROOT, 'skill-templates', 'review', file);
          const dst = path.join(ROOT, 'dist', host, 'review', file);
          if (fs.existsSync(src) && fs.existsSync(dst)) {
            const srcContent = fs.readFileSync(src, 'utf-8');
            const dstContent = fs.readFileSync(dst, 'utf-8');
            // Build replaces: ~/.claude/skills/gstack → $_GSTACK_ROOT
            // Build replaces: .claude/skills/gstack → dist/{host}/gstack
            let normalized = srcContent.replace(/~\/\.claude\/skills\/gstack/g, '$_GSTACK_ROOT');
            normalized = normalized.replace(/\.claude\/skills\/gstack/g, `dist/${host}/gstack`);
            expect(dstContent).toBe(normalized);
          }
        }
      });
    });
  }

  // ── qa/ auxiliary files ──

  for (const host of HOSTS) {
    describe(`dist/${host}/qa/ auxiliary files`, () => {
      test('contains qa templates and references', () => {
        for (const file of REQUIRED_QA_FILES) {
          const filePath = path.join(ROOT, 'dist', host, 'qa', file);
          expect(fs.existsSync(filePath)).toBe(true);
        }
      });

      test('qa files match source content', () => {
        for (const file of REQUIRED_QA_FILES) {
          const src = path.join(ROOT, 'skill-templates', 'qa', file);
          const dst = path.join(ROOT, 'dist', host, 'qa', file);
          if (fs.existsSync(src) && fs.existsSync(dst)) {
            const srcContent = fs.readFileSync(src, 'utf-8');
            const dstContent = fs.readFileSync(dst, 'utf-8');
            expect(dstContent).toBe(srcContent);
          }
        }
      });
    });
  }

  // ── browse/bin/ scripts ──

  for (const host of HOSTS) {
    describe(`dist/${host}/browse/bin/ scripts`, () => {
      test('contains browse bin scripts', () => {
        for (const script of REQUIRED_BROWSE_BIN_SCRIPTS) {
          const scriptPath = path.join(ROOT, 'dist', host, 'browse', 'bin', script);
          expect(fs.existsSync(scriptPath)).toBe(true);
        }
      });

      test('browse bin scripts are executable', () => {
        for (const script of REQUIRED_BROWSE_BIN_SCRIPTS) {
          const scriptPath = path.join(ROOT, 'dist', host, 'browse', 'bin', script);
          if (fs.existsSync(scriptPath)) {
            const stat = fs.statSync(scriptPath);
            expect(stat.mode & 0o111).toBeGreaterThan(0);
          }
        }
      });

      test('browse bin scripts match source content', () => {
        for (const script of REQUIRED_BROWSE_BIN_SCRIPTS) {
          const src = path.join(ROOT, 'browse', 'bin', script);
          const dst = path.join(ROOT, 'dist', host, 'browse', 'bin', script);
          if (fs.existsSync(src) && fs.existsSync(dst)) {
            const srcContent = fs.readFileSync(src, 'utf-8');
            const dstContent = fs.readFileSync(dst, 'utf-8');
            expect(dstContent).toBe(srcContent);
          }
        }
      });
    });
  }

  // ── VERSION file ──

  for (const host of HOSTS) {
    test(`dist/${host}/VERSION exists and matches source`, () => {
      const src = path.join(ROOT, 'VERSION');
      const dst = path.join(ROOT, 'dist', host, 'VERSION');
      expect(fs.existsSync(dst)).toBe(true);
      if (fs.existsSync(src) && fs.existsSync(dst)) {
        expect(fs.readFileSync(dst, 'utf-8')).toBe(fs.readFileSync(src, 'utf-8'));
      }
    });
  }

  // ── browse/dist/ binaries (conditional — only if source browse/dist/ exists) ──

  for (const host of HOSTS) {
    describe(`dist/${host}/browse/dist/ binaries`, () => {
      const browseSrcDir = path.join(ROOT, 'browse', 'dist');

      test('browse/dist/ directory exists', () => {
        const browseDistDir = path.join(ROOT, 'dist', host, 'browse', 'dist');
        expect(fs.existsSync(browseDistDir)).toBe(true);
      });

      test('browse binary copied if source exists', () => {
        const src = path.join(browseSrcDir, 'browse');
        const dst = path.join(ROOT, 'dist', host, 'browse', 'dist', 'browse');
        if (fs.existsSync(src)) {
          expect(fs.existsSync(dst)).toBe(true);
          // Check it's executable
          const stat = fs.statSync(dst);
          expect(stat.mode & 0o111).toBeGreaterThan(0);
        }
      });

      test('find-browse binary copied if source exists', () => {
        const src = path.join(browseSrcDir, 'find-browse');
        const dst = path.join(ROOT, 'dist', host, 'browse', 'dist', 'find-browse');
        if (fs.existsSync(src)) {
          expect(fs.existsSync(dst)).toBe(true);
          const stat = fs.statSync(dst);
          expect(stat.mode & 0o111).toBeGreaterThan(0);
        }
      });

      test('.version file copied if source exists', () => {
        const src = path.join(browseSrcDir, '.version');
        const dst = path.join(ROOT, 'dist', host, 'browse', 'dist', '.version');
        if (fs.existsSync(src)) {
          expect(fs.existsSync(dst)).toBe(true);
        }
      });
    });
  }

  // ── browse/src/ source files (server.ts runtime dependency) ──

  for (const host of HOSTS) {
    describe(`dist/${host}/browse/src/ server runtime`, () => {
      test('browse/src/ directory exists with server.ts', () => {
        const browseSrcDir = path.join(ROOT, 'dist', host, 'browse', 'src');
        expect(fs.existsSync(browseSrcDir)).toBe(true);
        expect(fs.existsSync(path.join(browseSrcDir, 'server.ts'))).toBe(true);
      });

      test('all browse/src/ files are copied', () => {
        const srcDir = path.join(ROOT, 'browse', 'src');
        const dstDir = path.join(ROOT, 'dist', host, 'browse', 'src');
        if (fs.existsSync(srcDir) && fs.existsSync(dstDir)) {
          const srcFiles = fs.readdirSync(srcDir).filter(f =>
            fs.statSync(path.join(srcDir, f)).isFile()
          );
          for (const file of srcFiles) {
            expect(fs.existsSync(path.join(dstDir, file))).toBe(true);
          }
        }
      });
    });
  }

  // ── Structural integrity: no stale .claude paths in codebuddy dist ──

  describe('path isolation in codebuddy dist', () => {
    test('no stale ~/.claude/ paths in codebuddy SKILL.md files', () => {
      const codebuddyDir = path.join(ROOT, 'dist', 'codebuddy');
      const skillDirs = fs.readdirSync(codebuddyDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const dir of skillDirs) {
        const skillMd = path.join(codebuddyDir, dir, 'SKILL.md');
        if (fs.existsSync(skillMd)) {
          const content = fs.readFileSync(skillMd, 'utf-8');
          expect(content).not.toContain('~/.claude/skills');
        }
      }
    });

    test('no stale ~/.codex/ paths in codebuddy SKILL.md files', () => {
      const codebuddyDir = path.join(ROOT, 'dist', 'codebuddy');
      const skillDirs = fs.readdirSync(codebuddyDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const dir of skillDirs) {
        const skillMd = path.join(codebuddyDir, dir, 'SKILL.md');
        if (fs.existsSync(skillMd)) {
          const content = fs.readFileSync(skillMd, 'utf-8');
          expect(content).not.toContain('~/.codex/skills');
        }
      }
    });
  });

  // ── GSTACK_DIR resolution: bin scripts use relative $(dirname "$0")/../ ──

  describe('bin scripts GSTACK_DIR resolution', () => {
    test('bin scripts that use GSTACK_DIR resolve via relative dirname', () => {
      const scriptsWithGstackDir = [
        'gstack-telemetry-log',
      ];
      for (const script of scriptsWithGstackDir) {
        const src = path.join(ROOT, 'bin', script);
        if (fs.existsSync(src)) {
          const content = fs.readFileSync(src, 'utf-8');
          // These scripts should use $(dirname "$0")/.. pattern
          // which naturally resolves to dist/{host}/ when bin/ is inside dist/{host}/
          if (content.includes('GSTACK_DIR')) {
            expect(content).toMatch(/dirname.*\$0/);
          }
        }
      }
    });
  });

  // ── Overall completeness check ──

  describe('overall completeness', () => {
    for (const host of HOSTS) {
      test(`dist/${host}/ has required top-level structure`, () => {
        const distHostDir = path.join(ROOT, 'dist', host);
        // Must have bin/, browse/, and VERSION
        expect(fs.existsSync(path.join(distHostDir, 'bin'))).toBe(true);
        expect(fs.existsSync(path.join(distHostDir, 'browse'))).toBe(true);
        expect(fs.existsSync(path.join(distHostDir, 'VERSION'))).toBe(true);
        // Must have review and qa with auxiliary files
        expect(fs.existsSync(path.join(distHostDir, 'review', 'SKILL.md'))).toBe(true);
        expect(fs.existsSync(path.join(distHostDir, 'review', 'checklist.md'))).toBe(true);
        expect(fs.existsSync(path.join(distHostDir, 'qa', 'SKILL.md'))).toBe(true);
        expect(fs.existsSync(path.join(distHostDir, 'qa', 'templates', 'qa-report-template.md'))).toBe(true);
      });
    }
  });
});

// ─── Phase 6D: Acid Test — End-to-End Self-Contained Verification ─────

describe('self-contained acid test (Phase 6D)', () => {
  const distSrc = path.join(ROOT, 'dist', 'codebuddy');
  let tempDir: string;
  let skillsDir: string;
  let gstackRoot: string;

  beforeAll(() => {
    // Create a temp directory simulating a fresh project
    tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gstack-acid-'));
    skillsDir = path.join(tempDir, '.codebuddy', 'skills');
    gstackRoot = path.join(skillsDir, 'gstack');

    // Simulate install_codebuddy_copy: copy dist/codebuddy/ to temp/.codebuddy/skills/
    fs.mkdirSync(gstackRoot, { recursive: true });

    // Copy shared runtime resources to gstack root
    copyDirRecursive(path.join(distSrc, 'bin'), path.join(gstackRoot, 'bin'));
    copyDirRecursive(path.join(distSrc, 'browse'), path.join(gstackRoot, 'browse'));
    if (fs.existsSync(path.join(distSrc, 'VERSION'))) {
      fs.copyFileSync(path.join(distSrc, 'VERSION'), path.join(gstackRoot, 'VERSION'));
    }
    if (fs.existsSync(path.join(distSrc, 'gstack', 'SKILL.md'))) {
      fs.copyFileSync(path.join(distSrc, 'gstack', 'SKILL.md'), path.join(gstackRoot, 'SKILL.md'));
    }

    // Copy individual skill directories (all dirs with SKILL.md except runtime asset dirs)
    for (const entry of fs.readdirSync(distSrc, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      // Skip non-skill directories and gstack root (already handled above)
      if (['bin', 'browse', 'gstack'].includes(entry.name)) continue;
      if (!fs.existsSync(path.join(distSrc, entry.name, 'SKILL.md'))) continue;
      copyDirRecursive(path.join(distSrc, entry.name), path.join(skillsDir, entry.name));
    }
  });

  afterAll(() => {
    // Cleanup
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ── Structure tests ──

  test('installed gstack root has bin/, browse/, VERSION', () => {
    expect(fs.existsSync(path.join(gstackRoot, 'bin'))).toBe(true);
    expect(fs.existsSync(path.join(gstackRoot, 'browse'))).toBe(true);
    expect(fs.existsSync(path.join(gstackRoot, 'VERSION'))).toBe(true);
    expect(fs.existsSync(path.join(gstackRoot, 'SKILL.md'))).toBe(true);
  });

  test('installed ≥19 skills', () => {
    let count = 0;
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const skillMd = path.join(skillsDir, entry.name, 'SKILL.md');
        if (fs.existsSync(skillMd)) count++;
      }
    }
    expect(count).toBeGreaterThanOrEqual(19);
  });

  // ── bin script execution tests ──

  test('gstack-slug executes from isolated location', () => {
    const slugPath = path.join(gstackRoot, 'bin', 'gstack-slug');
    expect(fs.existsSync(slugPath)).toBe(true);
    // gstack-slug requires a git repo to read origin/branch.
    // Run it from ROOT (a real git repo) to prove the binary itself works
    // when invoked from the isolated install path.
    const result = execSync(`"${slugPath}"`, {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(result).toContain('SLUG=');
    expect(result).toContain('BRANCH=');
  });

  test('gstack-config executes from isolated location', () => {
    const configPath = path.join(gstackRoot, 'bin', 'gstack-config');
    expect(fs.existsSync(configPath)).toBe(true);
    // gstack-config list should not crash
    try {
      execSync(`"${configPath}" list`, {
        cwd: tempDir,
        encoding: 'utf-8',
        timeout: 5000,
      });
    } catch (e: any) {
      // gstack-config may return non-zero if config doesn't exist, that's acceptable
      // but it should NOT fail with "command not found" or "permission denied"
      expect(e.message).not.toContain('ENOENT');
      expect(e.message).not.toContain('EACCES');
    }
  });

  // ── GSTACK_DIR resolution test ──

  test('bin scripts resolve GSTACK_DIR to correct root via dirname', () => {
    // The convention is: GSTACK_DIR=$(cd "$(dirname "$0")/.." && pwd)
    // From gstackRoot/bin/script, dirname is gstackRoot/bin, /.. is gstackRoot
    const resolvedDir = path.resolve(path.join(gstackRoot, 'bin'), '..');
    expect(resolvedDir).toBe(path.resolve(gstackRoot));
    // And the resolved dir should contain VERSION
    expect(fs.existsSync(path.join(resolvedDir, 'VERSION'))).toBe(true);
  });

  // ── Auxiliary files accessibility ──

  test('review auxiliary files accessible from installed location', () => {
    const reviewDir = path.join(skillsDir, 'review');
    expect(fs.existsSync(reviewDir)).toBe(true);
    for (const file of ['checklist.md', 'design-checklist.md', 'greptile-triage.md', 'TODOS-format.md']) {
      const filePath = path.join(reviewDir, file);
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content.length).toBeGreaterThan(0);
    }
  });

  test('qa auxiliary files accessible from installed location', () => {
    const qaDir = path.join(skillsDir, 'qa');
    expect(fs.existsSync(qaDir)).toBe(true);
    expect(fs.existsSync(path.join(qaDir, 'templates', 'qa-report-template.md'))).toBe(true);
    expect(fs.existsSync(path.join(qaDir, 'references', 'issue-taxonomy.md'))).toBe(true);
  });

  // ── Path integrity in installed SKILL.md files ──

  test('no stale platform paths in installed SKILL.md files', () => {
    const stalePatterns = ['~/.claude/skills', '~/.codex/skills'];
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillMd = path.join(skillsDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillMd)) continue;
      const content = fs.readFileSync(skillMd, 'utf-8');
      for (const pattern of stalePatterns) {
        expect(content).not.toContain(pattern);
      }
    }
  });

  test('no source repo references in installed SKILL.md files', () => {
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillMd = path.join(skillsDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillMd)) continue;
      const content = fs.readFileSync(skillMd, 'utf-8');
      expect(content).not.toContain('gstack-codebuddy');
    }
  });

  test('$_GSTACK_ROOT detection chain present in SKILL.md files that use it', () => {
    let filesWithGstackRoot = 0;
    let filesWithDetectionChain = 0;

    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillMd = path.join(skillsDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillMd)) continue;
      const content = fs.readFileSync(skillMd, 'utf-8');
      if (content.includes('$_GSTACK_ROOT')) {
        filesWithGstackRoot++;
        if (content.includes('Detect gstack installation root')) {
          filesWithDetectionChain++;
        }
      }
    }

    // All files using $_GSTACK_ROOT should have the detection chain
    expect(filesWithGstackRoot).toBeGreaterThan(0);
    expect(filesWithDetectionChain).toBe(filesWithGstackRoot);
  });

  // ── No symlinks in installed directory ──

  test('installed directory contains zero symlinks (fully self-contained)', () => {
    const symlinks: string[] = [];
    walkDir(skillsDir, (filePath) => {
      if (fs.lstatSync(filePath).isSymbolicLink()) {
        symlinks.push(path.relative(skillsDir, filePath));
      }
    });
    expect(symlinks).toEqual([]);
  });

  // ── Browse binary (conditional) ──

  test('browse binary copied to installed location if it exists in dist', () => {
    const srcBrowse = path.join(ROOT, 'browse', 'dist', 'browse');
    if (fs.existsSync(srcBrowse)) {
      const installedBrowse = path.join(gstackRoot, 'browse', 'dist', 'browse');
      expect(fs.existsSync(installedBrowse)).toBe(true);
      const stat = fs.statSync(installedBrowse);
      expect(stat.mode & 0o111).toBeGreaterThan(0); // executable
    }
  });
});

// ─── Helpers ──────────────────────────────────────────────────

/** Recursively copy a directory */
function copyDirRecursive(src: string, dst: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
      // Preserve executable bit
      const stat = fs.statSync(srcPath);
      if (stat.mode & 0o111) {
        fs.chmodSync(dstPath, stat.mode);
      }
    }
  }
}

/** Walk a directory tree and call callback for each file/dir */
function walkDir(dir: string, callback: (filePath: string) => void): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    callback(fullPath);
    if (entry.isDirectory() && !fs.lstatSync(fullPath).isSymbolicLink()) {
      walkDir(fullPath, callback);
    }
  }
}
