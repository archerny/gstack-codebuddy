#!/usr/bin/env bash
# verify-self-contained.sh — Phase 6D manual verification script
#
# Simulates the "Acid Test": copies dist/codebuddy/ to a temp directory,
# verifies all runtime assets are present, scripts are executable,
# SKILL.md files have no broken references, and bin scripts resolve
# GSTACK_DIR correctly from the isolated directory.
#
# Usage:
#   bash scripts/verify-self-contained.sh
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more checks failed
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_SRC="$ROOT/dist/codebuddy"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

PASS=0
FAIL=0
WARN=0

pass() { PASS=$((PASS + 1)); echo -e "  ${GREEN}✓${NC} $1"; }
fail() { FAIL=$((FAIL + 1)); echo -e "  ${RED}✗${NC} $1"; }
warn() { WARN=$((WARN + 1)); echo -e "  ${YELLOW}⚠${NC} $1"; }

echo -e "${BOLD}Phase 6D: Self-Contained Verification${NC}"
echo "========================================"
echo ""

# ── Pre-check: dist/codebuddy/ exists ──

if [ ! -d "$DIST_SRC" ]; then
  echo -e "${RED}ERROR: dist/codebuddy/ does not exist. Run 'bun run build' first.${NC}"
  exit 1
fi

# ── Step 1: Verify dist/ structure completeness ──

echo -e "${BOLD}Step 1: dist/ structure completeness${NC}"

# bin/ scripts
BIN_SCRIPTS=(
  gstack-config gstack-telemetry-log
  gstack-diff-scope gstack-slug
  gstack-review-log gstack-review-read
  gstack-analytics
  remote-slug
)

for script in "${BIN_SCRIPTS[@]}"; do
  if [ -f "$DIST_SRC/bin/$script" ]; then
    if [ -x "$DIST_SRC/bin/$script" ]; then
      pass "bin/$script (present + executable)"
    else
      fail "bin/$script (present but NOT executable)"
    fi
  else
    fail "bin/$script (MISSING)"
  fi
done

# dev-only scripts should NOT be present
for script in dev-setup dev-teardown; do
  if [ -f "$DIST_SRC/bin/$script" ]; then
    fail "bin/$script (dev-only script should NOT be in dist)"
  else
    pass "bin/$script correctly excluded"
  fi
done

# review/ auxiliary files
REVIEW_FILES=(checklist.md design-checklist.md greptile-triage.md TODOS-format.md)
for file in "${REVIEW_FILES[@]}"; do
  if [ -f "$DIST_SRC/review/$file" ]; then
    pass "review/$file"
  else
    fail "review/$file (MISSING)"
  fi
done

# qa/ auxiliary files
if [ -f "$DIST_SRC/qa/templates/qa-report-template.md" ]; then
  pass "qa/templates/qa-report-template.md"
else
  fail "qa/templates/qa-report-template.md (MISSING)"
fi

if [ -f "$DIST_SRC/qa/references/issue-taxonomy.md" ]; then
  pass "qa/references/issue-taxonomy.md"
else
  fail "qa/references/issue-taxonomy.md (MISSING)"
fi

# browse/bin/ scripts
for script in find-browse; do
  if [ -f "$DIST_SRC/browse/bin/$script" ] && [ -x "$DIST_SRC/browse/bin/$script" ]; then
    pass "browse/bin/$script (present + executable)"
  elif [ -f "$DIST_SRC/browse/bin/$script" ]; then
    fail "browse/bin/$script (present but NOT executable)"
  else
    fail "browse/bin/$script (MISSING)"
  fi
done

# browse/dist/ binaries
if [ -f "$DIST_SRC/browse/dist/browse" ] && [ -x "$DIST_SRC/browse/dist/browse" ]; then
  pass "browse/dist/browse (present + executable)"
elif [ -f "$DIST_SRC/browse/dist/browse" ]; then
  fail "browse/dist/browse (present but NOT executable)"
else
  warn "browse/dist/browse (MISSING — run 'bun run build' to compile)"
fi

if [ -f "$DIST_SRC/browse/dist/find-browse" ] && [ -x "$DIST_SRC/browse/dist/find-browse" ]; then
  pass "browse/dist/find-browse (present + executable)"
elif [ -f "$DIST_SRC/browse/dist/find-browse" ]; then
  fail "browse/dist/find-browse (present but NOT executable)"
else
  warn "browse/dist/find-browse (MISSING — run 'bun run build' to compile)"
fi

# VERSION
if [ -f "$DIST_SRC/VERSION" ]; then
  pass "VERSION ($(cat "$DIST_SRC/VERSION"))"
else
  fail "VERSION (MISSING)"
fi

echo ""

# ── Step 2: Simulate self-contained install (Acid Test) ──

echo -e "${BOLD}Step 2: Acid Test — isolated directory simulation${NC}"

TEMP_DIR=$(mktemp -d)
TEMP_SKILLS="$TEMP_DIR/.codebuddy/skills"
mkdir -p "$TEMP_SKILLS"

# Copy dist/codebuddy/ contents into simulated install location
# gstack root resources
mkdir -p "$TEMP_SKILLS/gstack"
cp -R "$DIST_SRC/bin" "$TEMP_SKILLS/gstack/bin"
[ -f "$DIST_SRC/VERSION" ] && cp "$DIST_SRC/VERSION" "$TEMP_SKILLS/gstack/VERSION"
[ -f "$DIST_SRC/gstack/SKILL.md" ] && cp "$DIST_SRC/gstack/SKILL.md" "$TEMP_SKILLS/gstack/SKILL.md"

# Individual skills (including browse as a standalone skill)
for skill_dir in "$DIST_SRC"/*/; do
  [ -d "$skill_dir" ] || continue
  skill_name="$(basename "$skill_dir")"
  # Skip non-skill directories and gstack root (already handled above)
  case "$skill_name" in bin|gstack) continue ;; esac
  [ -f "$skill_dir/SKILL.md" ] || continue
  cp -R "$skill_dir" "$TEMP_SKILLS/$skill_name"
done

echo "  Installed to: $TEMP_DIR"

# 2a. Verify bin scripts can execute from isolated location
echo ""
echo "  2a. bin script execution:"

# gstack-config list should work (it reads ~/.gstack/config.toml)
if "$TEMP_SKILLS/gstack/bin/gstack-config" list >/dev/null 2>&1; then
  pass "gstack-config list (executes successfully)"
else
  # gstack-config may fail if ~/.gstack doesn't exist, that's OK for fresh systems
  if "$TEMP_SKILLS/gstack/bin/gstack-config" list 2>&1 | grep -qi "error\|not found\|no such"; then
    fail "gstack-config list (execution error)"
  else
    pass "gstack-config list (executes, no fatal error)"
  fi
fi

# gstack-slug should work (just outputs a slug based on cwd)
if SLUG=$("$TEMP_SKILLS/gstack/bin/gstack-slug" 2>/dev/null); then
  pass "gstack-slug → $SLUG"
else
  fail "gstack-slug (execution error)"
fi

# 2b. Verify GSTACK_DIR resolves correctly from isolated bin/
echo ""
echo "  2b. GSTACK_DIR resolution:"

# The bin scripts use $(dirname "$0")/.. to find GSTACK_DIR
# From $TEMP_SKILLS/gstack/bin/script, dirname is $TEMP_SKILLS/gstack/bin,
# /.. resolves to $TEMP_SKILLS/gstack — which should have VERSION, etc.
RESOLVED_DIR="$(cd "$(dirname "$TEMP_SKILLS/gstack/bin/gstack-config")/.." && pwd)"
if [ -f "$RESOLVED_DIR/VERSION" ]; then
  pass "GSTACK_DIR resolves to directory with VERSION ($RESOLVED_DIR)"
else
  fail "GSTACK_DIR resolves to $RESOLVED_DIR but VERSION not found there"
fi

# 2c. Verify auxiliary files are readable
echo ""
echo "  2c. auxiliary files:"

if [ -f "$TEMP_SKILLS/review/checklist.md" ]; then
  LINES=$(wc -l < "$TEMP_SKILLS/review/checklist.md")
  pass "review/checklist.md ($LINES lines)"
else
  fail "review/checklist.md (MISSING from installed location)"
fi

if [ -f "$TEMP_SKILLS/qa/templates/qa-report-template.md" ]; then
  LINES=$(wc -l < "$TEMP_SKILLS/qa/templates/qa-report-template.md")
  pass "qa/templates/qa-report-template.md ($LINES lines)"
else
  fail "qa/templates/qa-report-template.md (MISSING from installed location)"
fi

# 2d. Count installed skills
echo ""
echo "  2d. installed skills:"

SKILL_COUNT=0
for d in "$TEMP_SKILLS"/*/; do
  [ -d "$d" ] || continue
  [ -f "$d/SKILL.md" ] && SKILL_COUNT=$((SKILL_COUNT + 1))
done

if [ "$SKILL_COUNT" -ge 19 ]; then
  pass "$SKILL_COUNT skills installed (expected ≥19)"
else
  fail "$SKILL_COUNT skills installed (expected ≥19)"
fi

# 2e. Browse binary
echo ""
echo "  2e. browse binary:"

if [ -x "$TEMP_SKILLS/browse/dist/browse" ]; then
  if "$TEMP_SKILLS/browse/dist/browse" --version >/dev/null 2>&1; then
    pass "browse binary executes (--version)"
  else
    # browse may not support --version, check if it at least runs
    warn "browse binary exists but --version returned non-zero"
  fi
else
  warn "browse binary not present (not critical for structure test)"
fi

# Cleanup
rm -rf "$TEMP_DIR"

echo ""

# ── Step 3: Path integrity in SKILL.md files ──

echo -e "${BOLD}Step 3: SKILL.md path integrity${NC}"

# No stale .claude/skills paths in codebuddy dist
STALE_CLAUDE=$(grep -rn '~/.claude/skills' "$DIST_SRC" 2>/dev/null | grep -v '.version' || true)
if [ -z "$STALE_CLAUDE" ]; then
  pass "no stale ~/.claude/skills paths in codebuddy dist"
else
  fail "stale ~/.claude/skills paths found:"
  echo "$STALE_CLAUDE" | head -5
fi

# No stale .codex/skills paths
STALE_CODEX=$(grep -rn '~/.codex/skills' "$DIST_SRC" 2>/dev/null || true)
if [ -z "$STALE_CODEX" ]; then
  pass "no stale ~/.codex/skills paths in codebuddy dist"
else
  fail "stale ~/.codex/skills paths found:"
  echo "$STALE_CODEX" | head -5
fi

# No source repo name references (gstack-codebuddy is the repo name, not a runtime path)
REPO_REFS=$(grep -rn 'gstack-codebuddy' "$DIST_SRC" 2>/dev/null || true)
if [ -z "$REPO_REFS" ]; then
  pass "no source repo (gstack-codebuddy) references in codebuddy dist"
else
  fail "source repo references found:"
  echo "$REPO_REFS" | head -5
fi

# $_GSTACK_ROOT is used in codebuddy SKILL.md files
GSTACK_ROOT_COUNT=$(grep -rc '\$_GSTACK_ROOT' "$DIST_SRC" 2>/dev/null | awk -F: '{s+=$NF} END {print s}')
if [ "$GSTACK_ROOT_COUNT" -gt 0 ]; then
  pass "\$_GSTACK_ROOT referenced $GSTACK_ROOT_COUNT times across codebuddy dist"
else
  fail "no \$_GSTACK_ROOT references found in codebuddy dist"
fi

# Verify detection chain is injected in SKILL.md files that use $_GSTACK_ROOT
DETECT_CHAIN_COUNT=$(grep -rl 'Detect gstack installation root' "$DIST_SRC" 2>/dev/null | wc -l | tr -d ' ')
if [ "$DETECT_CHAIN_COUNT" -gt 0 ]; then
  pass "gstack root detection chain injected in $DETECT_CHAIN_COUNT files"
else
  fail "no gstack root detection chain found in any SKILL.md"
fi

# No hardcoded absolute paths to bin (should all use $_GSTACK_ROOT/bin)
HARDCODED_BIN=$(grep -rn '~/.codebuddy/skills/gstack/bin' "$DIST_SRC" 2>/dev/null || true)
if [ -z "$HARDCODED_BIN" ]; then
  pass "no hardcoded ~/.codebuddy/skills/gstack/bin paths"
else
  fail "hardcoded bin paths found:"
  echo "$HARDCODED_BIN" | head -5
fi

echo ""

# ── Step 4: setup script validation ──

echo -e "${BOLD}Step 4: setup script validation${NC}"

if [ -f "$ROOT/setup" ]; then
  # Check that setup supports --project and --uninstall flags
  if grep -q '\-\-project' "$ROOT/setup"; then
    pass "setup supports --project flag"
  else
    fail "setup does not support --project flag"
  fi

  if grep -q 'install_copy' "$ROOT/setup"; then
    pass "setup has install_copy function"
  else
    fail "setup missing install_copy function"
  fi

  if grep -q '\-\-uninstall' "$ROOT/setup"; then
    pass "setup supports --uninstall flag"
  else
    fail "setup does not support --uninstall flag"
  fi

  # All installs should be physical copy — no symlink functions
  if grep -q 'link_claude_skill_dirs\|link_codex_skill_dirs\|link_codebuddy_skill_dirs' "$ROOT/setup"; then
    fail "setup still contains legacy symlink functions"
  else
    pass "setup uses physical copy only (no symlink functions)"
  fi
else
  fail "setup script not found"
fi

echo ""

# ── Summary ──

echo "========================================"
echo -e "${BOLD}Results:${NC} ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, ${YELLOW}$WARN warnings${NC}"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}VERIFICATION FAILED${NC} — $FAIL check(s) did not pass."
  exit 1
else
  echo -e "${GREEN}ALL CHECKS PASSED${NC}"
  if [ "$WARN" -gt 0 ]; then
    echo -e "${YELLOW}($WARN warning(s) — non-critical)${NC}"
  fi
  exit 0
fi
