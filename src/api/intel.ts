/**
 * Intelligence API hooks.
 *
 * All `/intel/*` hooks previously exported from here (`useIntelligence`,
 * `useIntelHistory`, `useIntelEvents`, `useIntelSignals`, `useIntelTickers`,
 * `useRefreshIntel`) backed the removed `/intel` page. They were only
 * consumed by `src/pages/IntelligencePage.tsx`, which has been removed.
 *
 * The two Intelligence panels still mounted in CC v1
 * (`IntelligencePanel.tsx` and `IntelligencePanelV3.tsx`) talk to the
 * backend directly via `apiClient` and `src/api/intelV3.ts` respectively,
 * so they are unaffected.
 *
 * This file is intentionally kept (no exports) so any future intel hooks
 * have an obvious home. Delete if a downstream cleanup eliminates the
 * module entirely.
 */
export {};
