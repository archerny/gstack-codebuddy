# gstack

An open-source collection of AI agent skills that turn a single AI coding assistant into a structured development workflow. Each skill gives the agent a specialist persona — product strategist, engineering reviewer, designer, QA tester, release engineer — with a step-by-step SOP (Standard Operating Procedure) the agent follows.

Fifteen skills and six power tools, all as slash commands, all Markdown, **MIT license, available now.**

**Who this is for:**
- **Solo developers and small teams** — structured review, QA, and release process without needing a full team.
- **First-time AI coding assistant users** — structured roles instead of a blank prompt.
- **Tech leads and staff engineers** — bring rigorous review, QA, and release automation to every PR

## Quick start: your first 10 minutes

1. Install gstack (30 seconds — see below)
2. Run `/office-hours` — describe what you're building. It will reframe the problem before you write a line of code.
3. Run `/plan-ceo-review` on any feature idea
4. Run `/review` on any branch with changes
5. Run `/qa` on your staging URL
6. Stop there. You'll know if this is for you.

Expect first useful run in under 5 minutes on any repo with tests already set up.

**If you only read one more section, read this one.**

## Install — takes 30 seconds

**Requirements:** [CodeBuddy](https://www.codebuddy.ai/), [Git](https://git-scm.com/), [Bun](https://bun.sh/) v1.0+

```bash
git clone https://git.woa.com/fedrichchen/gstack-codebuddy.git ~/gstack-codebuddy
cd ~/gstack-codebuddy && ./setup --host codebuddy --project ~/workspace/your-project
```

This copies all skills into `~/workspace/your-project/.codebuddy/skills/`. Commit them to your repo so teammates get it automatically — no submodules, no extra setup. Nothing touches your PATH or runs in the background.

Clone to anywhere you like — the repo is just the source. `./setup` does the actual install.

## See it work

```
You:    I want to build a daily briefing app for my calendar.
You:    /office-hours
Claude: [asks about the pain — specific examples, not hypotheticals]

You:    Multiple Google calendars, events with stale info, wrong locations.
        Prep takes forever and the results aren't good enough...

Claude: I'm going to push back on the framing. You said "daily briefing
        app." But what you actually described is a personal chief of
        staff AI.
        [extracts 5 capabilities you didn't realize you were describing]
        [challenges 4 premises — you agree, disagree, or adjust]
        [generates 3 implementation approaches with effort estimates]
        RECOMMENDATION: Ship the narrowest wedge tomorrow, learn from
        real usage. The full vision is a 3-month project — start with
        the daily briefing that actually works.
        [writes design doc → feeds into downstream skills automatically]

You:    /plan-ceo-review
        [reads the design doc, challenges scope, runs 10-section review]

You:    /plan-eng-review
        [ASCII diagrams for data flow, state machines, error paths]
        [test matrix, failure modes, security concerns]

You:    Approve plan. Exit plan mode.
        [writes 2,400 lines across 11 files. ~8 minutes.]

You:    /review
        [AUTO-FIXED] 2 issues. [ASK] Race condition → you approve fix.

You:    /qa https://staging.myapp.com
        [opens real browser, clicks through flows, finds and fixes a bug]

You:    /ship
        Tests: 42 → 51 (+9 new). PR: github.com/you/app/pull/42
```

The agent listened to the actual pain, not the feature request. It challenged assumptions, generated alternatives, and wrote a design doc that feeds into downstream skills. Eight commands, each handled by a different specialist persona.

## The sprint

gstack is a process, not a collection of tools. The skills are ordered the way a sprint runs:

**Think → Plan → Build → Review → Test → Ship → Reflect**

Each skill feeds into the next. `/office-hours` writes a design doc that `/plan-ceo-review` reads. `/plan-eng-review` writes a test plan that `/qa` picks up. `/review` catches bugs that `/ship` verifies are fixed. Nothing falls through the cracks because every step knows what came before it.

**Important: this is a recommended workflow, not an automated pipeline.** Each arrow in the sequence above is a manual gear shift — you decide when to move to the next stage. The agent may suggest "you should run `/qa` next" but it won't auto-trigger it. One agent, one skill at a time. This is deliberate: the transition between stages is often where the most important decisions happen. See [Architecture — Execution model](docs/architecture.md#execution-model-single-agent-skill-switching) for the full rationale.

One sprint, one person, one feature — typically takes about 30 minutes with gstack. Multiple sprints can run in parallel across different features, branches, and agent sessions.

| Skill | Your specialist | What they do |
|-------|----------------|--------------|
| `/office-hours` | **YC Office Hours** | Start here. Six forcing questions that reframe your product before you write code. Pushes back on your framing, challenges premises, generates implementation alternatives. Design doc feeds into every downstream skill. |
| `/plan-ceo-review` | **CEO / Founder** | Rethink the problem. Find the 10-star product hiding inside the request. Four modes: Expansion, Selective Expansion, Hold Scope, Reduction. |
| `/plan-eng-review` | **Eng Manager** | Lock in architecture, data flow, diagrams, edge cases, and tests. Forces hidden assumptions into the open. |
| `/plan-design-review` | **Senior Designer** | Rates each design dimension 0-10, explains what a 10 looks like, then edits the plan to get there. AI Slop detection. Interactive — one AskUserQuestion per design choice. |
| `/design-consultation` | **Design Partner** | Build a complete design system from scratch. Knows the landscape, proposes creative risks, generates realistic product mockups. Design at the heart of all other phases. |
| `/review` | **Staff Engineer** | Find the bugs that pass CI but blow up in production. Auto-fixes the obvious ones. Flags completeness gaps. |
| `/investigate` | **Debugger** | Systematic root-cause debugging. Iron Law: no fixes without investigation. Traces data flow, tests hypotheses, stops after 3 failed fixes. |
| `/design-review` | **Designer Who Codes** | Same audit as /plan-design-review, then fixes what it finds. Atomic commits, before/after screenshots. |
| `/qa` | **QA Lead** | Test your app, find bugs, fix them with atomic commits, re-verify. Auto-generates regression tests for every fix. |
| `/qa-only` | **QA Reporter** | Same methodology as /qa but report only. Use when you want a pure bug report without code changes. |
| `/ship` | **Release Engineer** | Sync main, run tests, audit coverage, push, open PR. Bootstraps test frameworks if you don't have one. One command. |
| `/document-release` | **Technical Writer** | Update all project docs to match what you just shipped. Catches stale READMEs automatically. |
| `/retro` | **Eng Manager** | Team-aware weekly retro. Per-person breakdowns, shipping streaks, test health trends, growth opportunities. |
| `/browse` | **QA Engineer** | Give the agent eyes. Real Chromium browser, real clicks, real screenshots. ~100ms per command. |
| `/setup-browser-cookies` | **Session Manager** | Import cookies from your real browser (Chrome, Arc, Brave, Edge) into the headless session. Test authenticated pages. |

### Power tools

| Skill | What it does |
|-------|-------------|
| `/codex` | **Second Opinion** — independent code review from OpenAI Codex CLI. Three modes: review (pass/fail gate), adversarial challenge, and open consultation. Cross-model analysis when both `/review` and `/codex` have run. |
| `/careful` | **Safety Guardrails** — warns before destructive commands (rm -rf, DROP TABLE, force-push). Say "be careful" to activate. Override any warning. |
| `/freeze` | **Edit Lock** — restrict file edits to one directory. Prevents accidental changes outside scope while debugging. |
| `/guard` | **Full Safety** — `/careful` + `/freeze` in one command. Maximum safety for prod work. |
| `/unfreeze` | **Unlock** — remove the `/freeze` boundary. |

**[Deep dives with examples and philosophy for every skill →](docs/skills.md)**

## What's new and why it matters

**`/office-hours` reframes your product before you write code.** You say "daily briefing app." It listens to your actual pain, pushes back on the framing, tells you you're really building a personal chief of staff AI, challenges your premises, and generates three implementation approaches with effort estimates. The design doc it writes feeds directly into `/plan-ceo-review` and `/plan-eng-review` — so every downstream skill starts with real clarity instead of a vague feature request.

**Design is at the heart.** `/design-consultation` doesn't just pick fonts. It researches what's out there in your space, proposes safe choices AND creative risks, generates realistic mockups of your actual product, and writes `DESIGN.md` — and then `/design-review` and `/plan-eng-review` read what you chose. Design decisions flow through the whole system.

**`/qa` is a major capability.** It enables the agent to visually verify changes in a real browser, find bugs, fix them, generate regression tests, and re-verify — closing the feedback loop without manual QA.

**Smart review routing.** Just like at a well-run startup: CEO doesn't have to look at infra bug fixes, design review isn't needed for backend changes. gstack tracks what reviews are run, figures out what's appropriate, and just does the smart thing. The Review Readiness Dashboard tells you where you stand before you ship.

**Test everything.** `/ship` bootstraps test frameworks from scratch if your project doesn't have one. Every `/ship` run produces a coverage audit. Every `/qa` bug fix generates a regression test. 100% test coverage is the goal — tests make vibe coding safe instead of yolo coding.

**`/document-release` keeps docs current automatically.** It reads every doc file in your project, cross-references the diff, and updates everything that drifted. README, ARCHITECTURE, CONTRIBUTING, CLAUDE.md, TODOS — all kept current automatically. `/ship` auto-invokes it — docs stay current without an extra command.

**Browser handoff when the AI gets stuck.** Hit a CAPTCHA, auth wall, or MFA prompt? `$B handoff` opens a visible Chrome at the exact same page with all your cookies and tabs intact. Solve the problem, tell Claude you're done, `$B resume` picks up right where it left off. The agent even suggests it automatically after 3 consecutive failures.

**Multi-AI second opinion.** `/codex` gets an independent review from OpenAI's Codex CLI — a completely different AI looking at the same diff. Three modes: code review with a pass/fail gate, adversarial challenge that actively tries to break your code, and open consultation with session continuity. When both `/review` (Claude) and `/codex` (OpenAI) have reviewed the same branch, you get a cross-model analysis showing which findings overlap and which are unique to each.

**Safety guardrails on demand.** Say "be careful" and `/careful` warns before any destructive command — rm -rf, DROP TABLE, force-push, git reset --hard. `/freeze` locks edits to one directory while debugging so Claude can't accidentally "fix" unrelated code. `/guard` activates both. `/investigate` auto-freezes to the module being investigated.

**Proactive skill suggestions.** gstack notices what stage you're in — brainstorming, reviewing, debugging, testing — and suggests the right skill. Don't like it? Say "stop suggesting" and it remembers across sessions.

## Parallel sprints

gstack works well with a single sprint. It scales further when running multiple agent sessions in parallel.

[Conductor](https://conductor.build) runs multiple Claude Code sessions in parallel — each in its own isolated workspace. One session running `/office-hours` on a new idea, another doing `/review` on a PR, a third implementing a feature, a fourth running `/qa` on staging, and more on other branches. All at the same time.

The sprint structure is what makes parallelism practical. Without a process, multiple agents are sources of chaos. With a process — think, plan, build, review, test, ship — each agent knows exactly what to do and when to stop.

---

## Docs

| Doc | What it covers |
|-----|---------------|
| [Skill Deep Dives](docs/skills.md) | Philosophy, examples, and workflow for every skill (includes Greptile integration) |
| [Architecture](docs/architecture.md) | Design decisions and system internals |
| [Browser Reference](docs/browser.md) | Full command reference for `/browse` |
| [Contributing](CONTRIBUTING.md) | Dev setup, testing, contributor mode, and dev mode |
| [Changelog](CHANGELOG.md) | What's new in every version |

## Privacy & Telemetry

gstack includes **local-only** usage analytics to help you understand your own workflow. Here's exactly what happens:

- **All data stays on your machine.** Nothing is ever sent to any remote server.
- **Default is off.** Run `gstack-config set telemetry anonymous` to enable local logging.
- **What's logged:** skill name, duration, success/fail, gstack version, OS — to a local JSONL file at `<state-dir>/analytics/skill-usage.jsonl` (project install: `<project>/.gstack/`, global install: `~/.gstack/`).
- **What's never logged:** code, file paths, repo names, branch names, prompts, or any user-generated content.
- **Change anytime:** `gstack-config set telemetry off` disables everything instantly.

Run `gstack-analytics` to see your personal usage dashboard from the local JSONL file.

## Troubleshooting

**Skill not showing up?** Re-run `./setup --host codebuddy --project ~/workspace/your-project` from the gstack-codebuddy repo.

**`/browse` fails?** `cd ~/gstack-codebuddy && bun install && bun run build`, then re-run setup.

**Stale install?** Re-run `./setup --host codebuddy --project ~/workspace/your-project` from the gstack-codebuddy repo.

## License

MIT.
