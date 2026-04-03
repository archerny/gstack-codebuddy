import type { TemplateContext } from './types';

/**
 * Confidence calibration system — 1-10 confidence scoring for review findings.
 * Used by: review, ship, plan-eng-review
 *
 * Controls how findings are displayed based on confidence level:
 * - 7+: show normally
 * - 5-6: show with warning marker
 * - <5: suppress (do not display)
 */
export function generateConfidenceCalibration(_ctx: TemplateContext): string {
  return `## Confidence Calibration

Every finding you report MUST include a confidence score from 1-10.

**Scoring guide:**
- **9-10:** Certain. You can point to specific code that proves the issue.
- **7-8:** High confidence. The pattern strongly suggests the issue, but you haven't verified every path.
- **5-6:** Medium confidence. You see something suspicious but can't fully confirm without more context.
- **3-4:** Low confidence. A hunch based on common patterns — may be a false positive.
- **1-2:** Speculative. You're flagging it "just in case" — likely wrong.

**Display rules:**
- **7+ confidence:** Display the finding normally.
- **5-6 confidence:** Display with a ⚠️ marker and note: "Medium confidence — verify before acting."
- **Below 5:** Do NOT display the finding. Suppress it silently. Low-confidence noise wastes the user's time and erodes trust in the review.

**Anti-patterns:**
- ❌ Reporting a finding without a confidence score
- ❌ Inflating confidence to make findings seem more important
- ❌ Showing low-confidence findings "for completeness" — if you're not confident, don't show it
- ❌ Using confidence as a hedge ("I'm not sure, but...") instead of doing more investigation to raise confidence

**Calibration check:** Before finalizing your review, scan all findings. If more than 30% are below 7, you're likely being too speculative — investigate further or drop the weak findings.`;
}
