/**
 * Per-package mode for the gates that read a whole-surface artifact.
 *
 * A gate fed an artifact covering one package must not read every other
 * package's committed rows as converged: an absent row is exactly what STALE
 * looks like. So a scoped gate does two things, and both live here — it holds
 * only the scope's committed rows against the artifact ({@link inScope}), and
 * it refuses an artifact whose population is anything but that one package
 * ({@link scopeMismatch}), the scoped twin of each gate's `missingScope`.
 *
 * CI takes this arm for a diff that touches one package only
 * (scripts/ci/thor-comparison.sh); every other run stays whole-surface.
 *
 * Hard rules: no node:* imports, no process.*, no third-party runtime deps.
 */

import { PACKAGES } from "./config.js";

/** The package `--package <name>` scopes a gate to, or null for the whole surface. */
export function scopeOf(argv: readonly string[]): string | null {
  const at = argv.indexOf("--package");
  if (at === -1) return null;
  const pkg = argv[at + 1];
  const writer = argv.find((arg) => arg === "--write" || arg.startsWith("--tighten"));
  if (writer !== undefined) {
    throw new Error(`--package gates one package; ${writer} rewrites marks it never measured`);
  }
  if (pkg === undefined || !PACKAGES.includes(pkg)) {
    throw new Error(`--package: expected one of ${PACKAGES.join(", ")}; got ${pkg ?? "nothing"}`);
  }
  return pkg;
}

/** The rows a scoped gate judges: the scope's own, or all of them unscoped. */
export function inScope<T extends { package?: string }>(
  rows: readonly T[],
  scope: string | null,
): T[] {
  return scope === null ? [...rows] : rows.filter((row) => row.package === scope);
}

/**
 * Why an artifact cannot drive a gate scoped to `scope`, or null when its
 * population is exactly that package. A wider artifact is refused as well as a
 * narrower one: the scoped arm judges one package's rows, so passing it over a
 * whole-surface artifact would report every other package as checked.
 */
export function scopeMismatch(
  gate: string,
  artifactPackages: readonly string[] | undefined,
  scope: string,
): string | null {
  const present = [...new Set(artifactPackages ?? [])].sort();
  if (present.length === 1 && present[0] === scope) return null;
  return (
    `\n${gate}: scoped to ${scope}, but the artifact compared ` +
    `${present.length === 0 ? "no package" : present.join(", ")}.\n` +
    `Regenerate it for that package alone (\`compare.ts --package ${scope}\`), or drop ` +
    "`--package` to gate the whole surface.\n"
  );
}
