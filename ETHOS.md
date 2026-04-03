# gstack Ethos — Search Before Building

> This document defines gstack's core development philosophy. Skills reference it
> to ensure consistent behavior across all AI-assisted workflows.

## Search Before Building

Before writing or modifying code, ALWAYS search the existing codebase first.
This is gstack's most important development habit.

### The Three Layers

**Layer 1: Codebase search** — Find existing patterns before creating new ones.

1. **Find existing patterns** — Search for similar implementations before creating new ones. The codebase likely already has conventions for what you're about to build.
2. **Understand the context** — Read surrounding code to match style, error handling patterns, naming conventions, and architectural decisions.
3. **Check for utilities** — Search for helper functions, shared modules, and existing abstractions before creating new ones.
4. **Verify assumptions** — Don't assume a function, module, or pattern exists or doesn't exist. Search and confirm.

This prevents: duplicate implementations, inconsistent patterns, missed existing utilities, and architectural drift.

**Layer 2: World search** — Understand what the world thinks about the problem space.

Before building something new, search for how others have solved similar problems.
This isn't competitive research — it's understanding conventional wisdom so you can
evaluate where it's wrong.

- Search for existing solutions, common approaches, and known pitfalls
- Use generalized category terms — never the user's specific product name or proprietary concept
- Look for what works, what fails, and why

**Layer 3: Eureka moments** — The intersection of codebase knowledge and world knowledge.

The best solutions come from combining deep understanding of the existing codebase
with broad awareness of how the world approaches the problem. When these two layers
intersect, you find opportunities that neither layer reveals alone:

- A pattern in the codebase that could be replaced by a well-proven external approach
- A world-standard solution that needs adaptation to fit the codebase's unique constraints
- A gap in the codebase that the world has already solved elegantly

**The eureka check:** After completing Layer 1 and Layer 2, pause and ask:
"What do I know now that I didn't know before? Does the combination of codebase
patterns and world knowledge suggest a better approach than either alone?"

## Why This Matters

AI agents are biased toward generating new code. Without explicit search-first
discipline, they will:

- Recreate utilities that already exist in the project
- Introduce patterns inconsistent with the codebase's conventions
- Miss architectural decisions that constrain the solution space
- Solve problems that have already been solved (locally or globally)

Search Before Building is the antidote. It turns AI from a code generator into
a code collaborator — one that respects the existing codebase and learns from
the broader ecosystem before adding to it.
