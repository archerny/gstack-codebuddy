import type { TemplateContext } from './types';

/**
 * INVOKE_SKILL composition resolver — enables inline skill invocation.
 * Syntax: {{INVOKE_SKILL:skill-name:skip=section1,section2,...}}
 *
 * Used by: plan-ceo-review (calls office-hours), autoplan (future)
 *
 * The resolver reads the target skill's SKILL.md and injects it inline,
 * skipping specified sections to avoid duplication (e.g., preamble, telemetry).
 */

// Default sections to skip when inlining a skill — these are either
// already provided by the calling skill or not relevant when embedded.
const DEFAULT_SKIP_SECTIONS = [
  'Preamble',
  'AskUserQuestion Format',
  'Completeness Principle',
  'Contributor Mode',
  'Completion Status Protocol',
  'SETUP',
  'Step 0: Detect base branch',
  'Review Readiness Dashboard',
  'Test Framework Bootstrap',
  'Important Rules',
  'Confidence Calibration',
  'Error Handling',
];

export function generateInvokeSkill(ctx: TemplateContext, args?: string[]): string {
  if (!args || args.length === 0) {
    throw new Error('{{INVOKE_SKILL}} requires at least one argument: the skill name. Usage: {{INVOKE_SKILL:skill-name}} or {{INVOKE_SKILL:skill-name:skip=section1,section2}}');
  }

  const skillName = args[0];
  let skipSections = [...DEFAULT_SKIP_SECTIONS];

  // Parse optional skip= parameter
  if (args.length > 1) {
    for (const arg of args.slice(1)) {
      if (arg.startsWith('skip=')) {
        const extraSkips = arg.slice(5).split(',').map(s => s.trim()).filter(Boolean);
        skipSections = [...skipSections, ...extraSkips];
      }
    }
  }

  // Determine host-specific global skills directory for fallback path
  const hostSkillsDir = ctx.host === 'codex' ? '.agents' : `.${ctx.host}`;

  // Generate the inline invocation instruction.
  // At template expansion time, we don't read the actual SKILL.md — instead we emit
  // instructions for the AI agent to read and inline the skill at runtime.
  return `## Inline Skill: /${skillName}

**Read and execute** the \`/${skillName}\` skill inline. Find the skill file:

\`\`\`bash
# Check project-local first, then global
for _d in ${ctx.paths.skillRoot}/skills/${skillName}/SKILL.md $HOME/${hostSkillsDir}/skills/${skillName}/SKILL.md; do
  [ -f "$_d" ] && echo "FOUND: $_d" && break
done
\`\`\`

Read the skill file. Execute it inline with these rules:
1. **Skip these sections** (already provided by the current skill or not applicable when embedded): ${skipSections.join(', ')}
2. **Execute all other sections** as if they were part of this skill.
3. **Do not re-run the preamble** — the current session's preamble is already active.
4. **Merge findings** — any findings from the inlined skill contribute to the current skill's output.`;
}
