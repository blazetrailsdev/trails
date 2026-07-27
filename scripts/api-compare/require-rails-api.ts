/**
 * Shared missing-`rails-api.json` policy for the manifest builders whose
 * output is gitignored (`build-rails-privates-manifest.ts`,
 * `build-rails-file-structure-manifest.ts`).
 *
 * Those builders regenerate an ESLint manifest from
 * `scripts/api-compare/output/rails-api.json`, which only exists after
 * `pnpm api:compare` (it needs Ruby + the vendored Rails source). When it is
 * absent they used to write `{ files: {} }` and exit 0, so the rule reading
 * the manifest matched nothing and the gate passed silently — a lint job that
 * looks green while enforcing nothing.
 *
 * Policy now: missing input is a hard error by default. Callers that legitimately
 * run without Ruby (the `prelint` chain, and therefore the standalone Lint CI
 * job) opt in with `--allow-missing`, which restores the empty-manifest write
 * but announces that the rule is inert for that run.
 */
import * as fs from "fs";

/** Whether `--allow-missing` was passed on the command line. */
export function allowMissingRailsApi(argv: readonly string[]): boolean {
  return argv.includes("--allow-missing");
}

export interface MissingRailsApiOptions {
  /** Script name used to prefix the console message, e.g. `build-rails-privates-manifest`. */
  scriptName: string;
  /** Absolute path to the expected `rails-api.json`. */
  railsApiPath: string;
  /** Repo-relative path of the manifest that would have been written. */
  manifestName: string;
  /** Name of the ESLint rule(s) that go inert when the manifest is empty. */
  ruleName: string;
  /** Process argv (`process.argv.slice(2)` at the call site). */
  argv: readonly string[];
}

/**
 * Returns `true` when `rails-api.json` is present and the builder should carry
 * on with real data.
 *
 * Returns `false` when it is absent *and* `--allow-missing` was passed — the
 * caller should write its empty manifest and exit 0.
 *
 * Throws when it is absent without `--allow-missing`. Callers run this before
 * any work, so throwing gives a non-zero exit plus the remediation command.
 */
export function railsApiAvailable(options: MissingRailsApiOptions): boolean {
  const { scriptName, railsApiPath, manifestName, ruleName, argv } = options;
  if (fs.existsSync(railsApiPath)) return true;

  if (!allowMissingRailsApi(argv)) {
    throw new Error(
      `[${scriptName}] ${railsApiPath} is missing, so ${manifestName} cannot be built ` +
        `and \`blazetrails/${ruleName}\` would silently match nothing.\n` +
        `Run \`pnpm api:compare\` to generate it (needs Ruby + \`pnpm vendor:fetch\`), ` +
        `or pass \`--allow-missing\` to accept an inert manifest.`,
    );
  }

  console.warn(
    `[${scriptName}] ${railsApiPath} missing; wrote an EMPTY ${manifestName}. ` +
      `\`blazetrails/${ruleName}\` is INERT for this run and will report nothing. ` +
      `Run \`pnpm api:compare\` to regenerate with real data.`,
  );
  return false;
}
