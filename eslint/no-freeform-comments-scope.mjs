/**
 * Scope data for `blazetrails/no-freeform-comments`, which is `error`
 * repo-wide in eslint.config.mjs with an exclusion list of the trees whose
 * comment backlog is not swept yet.
 *
 * The exclusion rows are trees, so without the list below a file that carries
 * no comment today would inherit its tree's pass. Every path here is
 * re-enrolled by eslint.config.mjs and may not regress. Measured 2026-08-28 by
 * running the rule in report mode over the repo. The list is only-shrink: an
 * entry leaves when the exclusion row covering it is deleted, never because a
 * file grew a comment.
 *
 * Bracketed SvelteKit route segments are escaped — a bare `[tutorial]` is a
 * minimatch character class and matches nothing on disk.
 */

export const sweptFilesInsideUnsweptTrees = [
  "eslint/canonical-catalogue-sources.mjs",
  "eslint/canonical-catalogue-sources.test.mjs",
  "eslint/expected-fixtures.d.mts",
  "eslint/nie-requires-annotation.mjs",
  "eslint/nie-requires-annotation.test.mjs",
  "eslint/no-raw-control-bytes.drift.test.mjs",
  "eslint/rails-test-name-parity.d.mts",
  "eslint/rails-test-name-parity.test.mjs",
  "eslint/require-canonical-rebuild.mjs",
  "eslint/require-canonical-rebuild.test.mjs",
  "eslint/test-fixture-parity.test.mjs",
  "examples/twitter-clone/db/migrate/20260101000002_create_tweets.ts",
  "examples/twitter-clone/db/schema.ts",
  "examples/twitter-clone/src/models/tweet.ts",
  "packages/website/docs/.vitepress/theme/index.mjs",
  "packages/website/src/lib/frontiers/app-server.test.ts",
  "packages/website/src/lib/frontiers/compiled-cache.test.ts",
  "packages/website/src/lib/frontiers/components/sandbox/DatabaseBrowser.test.ts",
  "packages/website/src/lib/frontiers/components/sandbox/FileTree.test.ts",
  "packages/website/src/lib/frontiers/components/sandbox/MonacoEditor.test.ts",
  "packages/website/src/lib/frontiers/components/sandbox/TabPanel.test.ts",
  "packages/website/src/lib/frontiers/components/tutorial/ActionCard.test.ts",
  "packages/website/src/lib/frontiers/components/tutorial/CheckpointPanel.test.ts",
  "packages/website/src/lib/frontiers/components/tutorial/CliAction.test.ts",
  "packages/website/src/lib/frontiers/components/tutorial/DiagramBlock.test.ts",
  "packages/website/src/lib/frontiers/components/tutorial/DiffViewer.test.ts",
  "packages/website/src/lib/frontiers/components/tutorial/StepContent.test.ts",
  "packages/website/src/lib/frontiers/components/tutorial/StepNav.test.ts",
  "packages/website/src/lib/frontiers/rack-bridge.test.ts",
  "packages/website/src/lib/frontiers/transpiler.test.ts",
  "packages/website/src/lib/frontiers/tutorials/diagram-renderer.test.ts",
  "packages/website/src/lib/frontiers/tutorials/diagram-renderer.ts",
  "packages/website/src/lib/frontiers/tutorials/diff-engine.test.ts",
  "packages/website/src/lib/frontiers/tutorials/docs/index.ts",
  "packages/website/src/lib/frontiers/tutorials/generator-fixtures.test.ts",
  "packages/website/src/lib/frontiers/tutorials/generator-fixtures.ts",
  "packages/website/src/lib/frontiers/tutorials/registry.test.ts",
  "packages/website/src/lib/frontiers/tutorials/registry.ts",
  "packages/website/src/routes/dev/filetree/+page.ts",
  "packages/website/src/routes/dev/monaco/+page.ts",
  "packages/website/src/routes/frontiers/learn/+page.ts",
  "packages/website/src/routes/frontiers/learn/\\[tutorial\\]/+page.ts",
  "packages/website/src/routes/frontiers/learn/\\[tutorial\\]/\\[step\\]/+page.ts",
  "packages/website/vite.config.ts",
  "scripts/api-compare/arity-exclude.test.ts",
  "scripts/api-compare/audit-cross-file-calls.test.ts",
  "scripts/api-compare/call-args-baseline.test.ts",
  "scripts/api-compare/config.test.ts",
  "scripts/api-compare/extra-surface-mark.test.ts",
  "scripts/api-compare/fold-skeleton-tokens.test.ts",
  "scripts/api-compare/inheritance-exclude.test.ts",
  "scripts/api-compare/lint-call-args.test.ts",
  "scripts/api-compare/lint-missing-rails-call-reasons.test.ts",
  "scripts/api-compare/missing-rails-args-tags.test.ts",
  "scripts/api-compare/param-name-mark.test.ts",
  "scripts/api-compare/privates-entities.test.ts",
  "scripts/api-compare/require-rails-api.test.ts",
  "scripts/api-compare/ts-file-walk.test.ts",
  "scripts/api-compare/typescript-internal.d.ts",
  "scripts/deprecated-manifest-diff.test.ts",
  "scripts/sync-stats/expired-job-log.test.ts",
  "scripts/sync-stats/gh-transient-error.test.ts",
  "scripts/test-compare/extract-ruby-define-method.test.ts",
  "scripts/test-compare/gate-check.test.ts",
  "scripts/test-compare/lint-assertion-mismatches.test.ts",
];
