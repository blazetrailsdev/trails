import { PACKAGES } from "./config.js";

/**
 * The package `--package <name>` scopes a gate to, or null for the whole
 * surface. CI takes the scoped arm for a diff confined to one package
 * (scripts/ci/thor-comparison.sh); a scoped run only gates, so a flag that
 * rewrites the committed marks is refused alongside it.
 */
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

/**
 * The committed rows a scoped gate holds against its artifact: the scope's
 * own, since a package the artifact never compared has no rows in it and would
 * read as STALE. Unscoped, all of them.
 */
export function inScope<T extends { package?: string }>(
  rows: readonly T[],
  scope: string | null,
): T[] {
  return scope === null ? [...rows] : rows.filter((row) => row.package === scope);
}

/**
 * The marks a scoped gate holds against its measurement: the scope's own, since
 * a package the artifact never compared measures zero and would read as
 * converged. Unscoped, every mark.
 */
export function scopedMarks<T>(marks: Record<string, T>, scope: string | null): Record<string, T> {
  if (scope === null) return marks;
  return marks[scope] === undefined ? {} : { [scope]: marks[scope] };
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
