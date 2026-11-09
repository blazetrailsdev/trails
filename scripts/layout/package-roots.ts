/**
 * Where a package keeps its library and its tests while RFC 0223 moves every
 * package from colocated `src/` to a Rails gem's `lib/` + `test/`.
 *
 * The answer is declared, not probed: a package PR that runs
 * `plan-test-moves --apply` adds its name to `LIB_TEST_PACKAGES` in the same
 * commit, so every caller (sync ones included: `packageSrcDir`, the vitest
 * config) reads one table, and `package-roots.test.ts` reds when the table and
 * the tree disagree. `lib-test-layout-retire-src-compat` deletes the `src`
 * arm once the set holds every package.
 *
 * Hard rules: no node:* imports, no process.* references.
 */

/** Packages already moved to `lib/` + `test/`. Only-grow. */
export const LIB_TEST_PACKAGES: ReadonlySet<string> = new Set<string>([
  "ruby-compat",
  "tzinfo",
  "mini-mime",
  "net-smtp",
  "et-orbi",
  "vitest-matchers",
  "fugit",
  "rackup",
  "solid-cable",
  "nokogiri",
  "mini-magick",
  "image-processing",
  "builder",
  "tse-compiler",
  "bcrypt",
  "actioncable",
  "actionmailer",
  "actionpack",
  "did-you-mean",
  "marcel",
  "trails-tsc",
  "rack-session",
  "rack-test",
  "date",
  "activesupport",
  "globalid",
  "mail",
  "solid-queue",
  "thor",
  "zeitwerk",
  "html-sanitizer",
  "msgpack",
  "chronic",
  "actionview",
  "activejob",
  "arel",
  "raabro",
  "rack",
  "rake",
  "activemodel",
  "activerecord-cli",
  "activestorage",
  "i18n",
]);

/** `packages/<pkg>/<libRoot>` holds the library sources. */
export function libRoot(pkg: string): "lib" | "src" {
  return LIB_TEST_PACKAGES.has(pkg) ? "lib" : "src";
}

/** `packages/<pkg>/<root>` for each root holding the package's tests. */
export function testRoots(pkg: string): readonly ("test" | "src")[] {
  return LIB_TEST_PACKAGES.has(pkg) ? ["test"] : ["src"];
}

/** Every root a package's committed `.ts` lives under, library first. */
export function sourceRoots(pkg: string): readonly string[] {
  return [...new Set<string>([libRoot(pkg), ...testRoots(pkg)])];
}
