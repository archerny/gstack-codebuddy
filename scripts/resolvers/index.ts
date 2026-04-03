/**
 * Resolver registry — single source of truth for all {{PLACEHOLDER}} resolvers.
 *
 * Each resolver is a pure function: (ctx: TemplateContext, args?: string[]) => string
 * Resolver modules are organized by domain:
 *   - preamble.ts      — session setup, ask-user format, completeness, telemetry
 *   - browse.ts        — command reference, snapshot flags, browse setup
 *   - utility.ts       — base branch detection, slug helpers, deploy bootstrap, co-author, changelog
 *   - design.ts        — design methodology, design review lite, design setup, design mockup, design shotgun loop
 *   - review.ts        — review dashboard, scope drift, adversarial step, plan audit, codex second opinion
 *   - testing.ts       — QA methodology, test bootstrap, test failure triage, test coverage audit
 *   - confidence.ts    — confidence calibration for review findings
 *   - composition.ts   — INVOKE_SKILL inline skill composition
 *   - learnings.ts     — cross-skill institutional memory (learnings search + log)
 *   - codex-helpers.ts — Codex integration shared helpers (used by Phase 1.5 resolvers)
 */

import type { TemplateContext, ResolverFn } from './types';

// Re-export types for convenience
export type { Host, HostPaths, TemplateContext, ResolverFn } from './types';
export {
  HOST_PATHS,
  HOST_BRAND_NAMES,
  HOST_SHORT_BRANDS,
  HOST_PLATFORM_NAMES,
  HOST_COAUTHOR_TRAILERS,
  HOST_PR_FOOTER_LINKS,
} from './types';

// Re-export shared helpers used by gen-skill-docs.ts post-processing
export { generateGstackRootDetect } from './preamble';

// Import all resolvers
import { generatePreamble } from './preamble';
import { generateCommandReference, generateSnapshotFlags, generateBrowseSetup } from './browse';
import { generateSlugEval, generateSlugSetup, generateBaseBranchDetect, generateDeployBootstrap, generateCoAuthorTrailer, generateChangelogWorkflow } from './utility';
import { generateDesignReviewLite, generateDesignMethodology, generateDesignSketch, generateDesignMockup, generateDesignSetup, generateDesignShotgunLoop } from './design';
import {
  generateReviewDashboard,
  generateScopeDrift,
  generateAdversarialStep,
  generateCodexSecondOpinion,
  generateCodexPlanReview,
  generatePlanCompletionAuditShip,
  generatePlanCompletionAuditReview,
  generatePlanVerificationExec,
  generateSpecReviewLoop,
  generateBenefitsFrom,
} from './review';
import { generateQAMethodology, generateTestBootstrap, generateTestFailureTriage, generateTestCoverageAuditPlan, generateTestCoverageAuditShip, generateTestCoverageAuditReview } from './testing';
import { generateConfidenceCalibration } from './confidence';
import { generateInvokeSkill } from './composition';
import { generateLearningsSearch, generateLearningsLog } from './learnings';

/**
 * Master resolver map — maps {{PLACEHOLDER_NAME}} to resolver functions.
 * gen-skill-docs.ts uses this to resolve all placeholders in .tmpl templates.
 *
 * Supports both simple {{NAME}} and parameterized {{NAME:arg1:arg2}} syntax.
 * For parameterized placeholders, args are passed as string[] to the resolver.
 */
export const RESOLVERS: Record<string, ResolverFn> = {
  COMMAND_REFERENCE: generateCommandReference,
  SNAPSHOT_FLAGS: generateSnapshotFlags,
  PREAMBLE: generatePreamble,
  BROWSE_SETUP: generateBrowseSetup,
  BASE_BRANCH_DETECT: generateBaseBranchDetect,
  SLUG_EVAL: generateSlugEval,
  SLUG_SETUP: generateSlugSetup,
  DEPLOY_BOOTSTRAP: generateDeployBootstrap,
  CO_AUTHOR_TRAILER: generateCoAuthorTrailer,
  CHANGELOG_WORKFLOW: generateChangelogWorkflow,
  QA_METHODOLOGY: generateQAMethodology,
  DESIGN_METHODOLOGY: generateDesignMethodology,
  DESIGN_REVIEW_LITE: generateDesignReviewLite,
  DESIGN_SKETCH: generateDesignSketch,
  DESIGN_MOCKUP: generateDesignMockup,
  DESIGN_SETUP: generateDesignSetup,
  DESIGN_SHOTGUN_LOOP: generateDesignShotgunLoop,
  REVIEW_DASHBOARD: generateReviewDashboard,
  SCOPE_DRIFT: generateScopeDrift,
  ADVERSARIAL_STEP: generateAdversarialStep,
  CODEX_SECOND_OPINION: generateCodexSecondOpinion,
  CODEX_PLAN_REVIEW: generateCodexPlanReview,
  PLAN_COMPLETION_AUDIT_SHIP: generatePlanCompletionAuditShip,
  PLAN_COMPLETION_AUDIT_REVIEW: generatePlanCompletionAuditReview,
  PLAN_VERIFICATION_EXEC: generatePlanVerificationExec,
  SPEC_REVIEW_LOOP: generateSpecReviewLoop,
  BENEFITS_FROM: generateBenefitsFrom,
  TEST_BOOTSTRAP: generateTestBootstrap,
  TEST_FAILURE_TRIAGE: generateTestFailureTriage,
  TEST_COVERAGE_AUDIT_PLAN: generateTestCoverageAuditPlan,
  TEST_COVERAGE_AUDIT_SHIP: generateTestCoverageAuditShip,
  TEST_COVERAGE_AUDIT_REVIEW: generateTestCoverageAuditReview,
  CONFIDENCE_CALIBRATION: generateConfidenceCalibration,
  INVOKE_SKILL: generateInvokeSkill,
  LEARNINGS_SEARCH: generateLearningsSearch,
  LEARNINGS_LOG: generateLearningsLog,
};
