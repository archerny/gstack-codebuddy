export type Host = 'claude' | 'codex' | 'codebuddy';

export interface HostPaths {
  skillRoot: string;
  localSkillRoot: string;
  binDir: string;
  browseDir: string;
}

export const HOST_PATHS: Record<Host, HostPaths> = {
  claude: {
    skillRoot: '$_GSTACK_ROOT',
    localSkillRoot: 'dist/claude/gstack',
    binDir: '$_GSTACK_ROOT/bin',
    browseDir: '$_BROWSE_ROOT/dist',
  },
  codex: {
    skillRoot: '$_GSTACK_ROOT',
    localSkillRoot: 'dist/codex/gstack',
    binDir: '$_GSTACK_ROOT/bin',
    browseDir: '$_BROWSE_ROOT/dist',
  },
  codebuddy: {
    skillRoot: '$_GSTACK_ROOT',
    localSkillRoot: 'dist/codebuddy/gstack',
    binDir: '$_GSTACK_ROOT/bin',
    browseDir: '$_BROWSE_ROOT/dist',
  },
};

// Brand names used in skill prose — parameterized per host
export const HOST_BRAND_NAMES: Record<Host, string> = {
  claude: 'CC+gstack',
  codex: 'Codex+gstack',
  codebuddy: 'CodeBuddy+gstack',
};

// Short brand names (for inline references like "with CC")
export const HOST_SHORT_BRANDS: Record<Host, string> = {
  claude: 'CC',
  codex: 'Codex',
  codebuddy: 'CodeBuddy',
};

// Full platform names (for prose like "using Claude Code as a force multiplier")
export const HOST_PLATFORM_NAMES: Record<Host, string> = {
  claude: 'Claude Code',
  codex: 'Codex CLI',
  codebuddy: 'CodeBuddy',
};

// Co-Authored-By trailer for git commits
export const HOST_COAUTHOR_TRAILERS: Record<Host, string> = {
  claude: 'Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>',
  codex: 'Co-Authored-By: Codex CLI <noreply@openai.com>',
  codebuddy: 'Co-Authored-By: CodeBuddy <noreply@codebuddy.ai>',
};

// PR footer link (used in ship template's PR body)
export const HOST_PR_FOOTER_LINKS: Record<Host, string> = {
  claude: '[Claude Code](https://claude.com/claude-code)',
  codex: '[Codex CLI](https://openai.com/index/introducing-codex/)',
  codebuddy: '[CodeBuddy](https://www.codebuddy.ai)',
};

export interface TemplateContext {
  skillName: string;
  tmplPath: string;
  benefitsFrom?: string[];
  host: Host;
  paths: HostPaths;
  preambleTier?: number;  // 1-4, controls which preamble sections are included
}

/** Resolver function signature. args is populated for parameterized placeholders like {{INVOKE_SKILL:name}}. */
export type ResolverFn = (ctx: TemplateContext, args?: string[]) => string;
