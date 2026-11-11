/**
 * What `pnpm parity:bump:dry-run` does with each step of ci.yml's
 * `rails-comparison` job. `steps.test.ts` holds every script the job names to
 * exactly one of these lists.
 *
 * Hard rules: no node:* imports, no process.*, no I/O.
 */

export interface Step {
  name: string;
  args: string[];
}

export const TSX = ["exec", "tsx"];

/** `--source <name> --ref <tag>`; a missing flag or a flag-shaped value reads as absent. */
export function parseArgs(argv: readonly string[]): { source?: string; ref?: string } {
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    const v = i === -1 ? undefined : argv[i + 1];
    return v === undefined || v.startsWith("--") ? undefined : v;
  };
  return { source: value("--source"), ref: value("--ref") };
}

/** The gating steps the dry run runs against both manifests, in ci.yml's order. */
export const STEPS: Step[] = [
  ["API comparison", "scripts/api-compare/compare.ts"],
  ["API comparison (privates)", "scripts/api-compare/compare.ts --privates"],
  ["Extra-surface tag gates", "scripts/api-compare/extra-surface.ts"],
  ["Body-pins gate", "scripts/api-compare/lint-body-pins.ts"],
  ["API comparison (calls)", "scripts/api-compare/compare.ts --calls"],
  ["Call-mismatches ratchet", "scripts/api-compare/lint-call-mismatches.ts --no-regen"],
  ["Call-argument ratchet", "scripts/api-compare/lint-call-args.ts --no-regen"],
  ...["activerecord", "activemodel"].map((pkg) => [
    `Receipt audit (${pkg})`,
    `scripts/api-compare/receipt-audit.ts --package ${pkg} --gate`,
  ]),
  ["Ruby-compat call ratchet", "scripts/api-compare/lint-ruby-compat-calls.ts --no-regen"],
  ["Arm-parity report", "scripts/api-compare/report-arms.ts --report"],
  ["Missing-throw arm ratchet", "scripts/api-compare/lint-arm-throws.ts"],
  ["Extra-surface ratchet", "scripts/api-compare/lint-extra-surface-ratchet.ts"],
  ["Parameter-name ratchet", "scripts/api-compare/lint-param-names.ts"],
  ["Block-parameter ratchet", "scripts/api-compare/lint-block-params.ts"],
  ["Predicate-kind ratchet", "scripts/api-compare/lint-predicate-kinds.ts"],
  ["Inlined-from staleness gate", "scripts/api-compare/lint-inlined-from.ts"],
  ["Class-path table gate", "scripts/api-compare/class-paths.ts --check"],
  ["Ambiguous-parent ratchet", "scripts/api-compare/lint-ambiguous-parents.ts"],
  [
    "Deprecation manifest up to date",
    "scripts/build-rails-privates-manifest.ts --check-deprecated",
  ],
  ["Dependency lint", "scripts/api-compare/lint-deps.ts"],
  ["Test comparison (TS extract)", "scripts/test-compare/extract-ts-tests.ts"],
  ["Test comparison", "scripts/test-compare/compare.ts --gates --check"],
  ["Assertion-mismatch ratchet", "scripts/test-compare/lint-assertion-mismatches.ts --no-regen"],
  ["AR-closure test manifest guard", "scripts/test-compare/closure-cli.ts --check"],
].map(([name, cmd]) => ({ name, args: [...TSX, ...cmd.split(" ")] }));

/**
 * The steps the dry run does not run, and why. `predictor` names the upstream
 * count `dry-run.ts` reports in their place; a step with none is independent
 * of the ref.
 */
export const NOT_EXERCISED: {
  name: string;
  covers: string[];
  reason: string;
  predictor?: string;
}[] = [
  {
    name: "Rails-private JSDoc lint and runtime artifact",
    covers: ["scripts/build-rails-privates-manifest.ts", "eslint/rails-private-jsdoc.config.mjs"],
    reason: "reads the active version directory's lib files",
    predictor: "lib",
  },
  {
    name: "Rails file-structure method-order lint",
    covers: ["scripts/build-rails-file-structure-manifest.ts"],
    reason: "reads the active version directory's arel and activemodel lib files",
    predictor: "methodOrder",
  },
  {
    name: "Rails test-name parity ratchet",
    covers: ["scripts/build-rails-test-names-manifest.ts"],
    reason: "reads the active version directory's test files",
    predictor: "testNames",
  },
  {
    name: "ESLint exclude baselines up to date",
    covers: ["scripts/test-deps/rails-test-deps.ts", "scripts/test-deps/build-fixture-baseline.ts"],
    reason: "reads the active version directory's activerecord tests",
    predictor: "arTests",
  },
  {
    name: "Fixtures comparison",
    covers: ["scripts/fixtures-compare/compare.ts"],
    reason: "reads the active version directory's fixtures",
    predictor: "fixtures",
  },
  {
    name: "Models comparison",
    covers: ["scripts/fixtures-compare/compare.ts"],
    reason: "reads the active version directory's models",
    predictor: "models",
  },
  {
    name: "Schema comparison, its unit tests, Schema Parity and Query Parity",
    covers: ["scripts/schema-compare/compare.ts", "scripts/schema-compare"],
    reason: "reads the active version directory's schema; the parity jobs run real Rails",
    predictor: "schema",
  },
  {
    name: "Mail parsers regeneration check",
    covers: ["pnpm mail:parsers"],
    reason: "TS-side only",
  },
  {
    name: "Missing-call reasons gate",
    covers: ["scripts/api-compare/lint-missing-rails-call-reasons.ts"],
    reason: "TS-side only",
  },
  {
    name: "Detached JSDoc tag blocks gate",
    covers: ["scripts/api-compare/lint-detached-jsdoc-tags.ts"],
    reason: "TS-side only",
  },
  {
    name: "Conventions doc up to date",
    covers: ["scripts/parity/conventions-doc.ts"],
    reason: "TS-side only",
  },
  {
    name: "Legacy compare-script name gate",
    covers: ["scripts/parity/lint-legacy-script-names.ts"],
    reason: "TS-side only",
  },
  {
    name: "Package summary",
    covers: ["pnpm parity:packages"],
    reason: "report only, gates nothing",
  },
  {
    name: "Ratchet baseline reseed drift",
    covers: ["pnpm parity:api:calls:reseed"],
    reason: "writes the call baseline; follows the call-mismatches ratchet",
    predictor: "calls",
  },
];

/** The extraction the dry run performs itself, once per manifest. */
export const EXTRACTION = [
  "scripts/api-compare/extract-ruby-api.rb",
  "scripts/api-compare/extract-ts-api.ts",
  "scripts/test-compare/extract-ruby-tests.rb",
  "scripts/ci/bg-gates.mjs",
];

/** Every script or command ci.yml's `rails-comparison` job names. */
export function railsComparisonScripts(ciYml: string): string[] {
  const start = ciYml.indexOf("\n  rails-comparison:\n");
  const end = ciYml.indexOf("\n  rails-comparison-scoped:\n");
  const job = ciYml
    .slice(start, end)
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
  const found = job.match(
    /scripts\/[\w./-]+\.(?:ts|mjs|rb)|pnpm (?:mail:parsers|parity:[a-z:]+)|vitest run scripts\/[\w-]+|eslint\/[\w.-]+\.mjs/g,
  );
  return [...new Set((found ?? []).map((s) => s.replace(/^vitest run /, "")))].sort();
}

/** The scripts `railsComparisonScripts` finds that no list accounts for. */
export function unaccounted(scripts: readonly string[]): string[] {
  const known = new Set([
    ...STEPS.flatMap((s) => s.args),
    ...NOT_EXERCISED.flatMap((s) => s.covers),
    ...EXTRACTION,
  ]);
  return scripts.filter((s) => !known.has(s));
}
