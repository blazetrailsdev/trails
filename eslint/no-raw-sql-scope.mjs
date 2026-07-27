/**
 * Single source of truth for the `blazetrails/no-raw-sql` scope.
 *
 * The rule re-checks scope by filename (so it stays testable in isolation) and
 * eslint.config.mjs applies the same scope as `files`/`ignores`. Those two lists
 * used to be maintained separately — a regex list in the rule and a glob list in
 * the config — so any test-infra file move (RFC 0064 does several) had to touch
 * both, and missing one silently changed which files are linted. Both now derive
 * from the globs below: rename a scoped-out file, edit exactly this file.
 */

/** Files the rule applies to (repo-relative glob). */
export const noRawSqlFiles = ["packages/activerecord/src/**/*.ts"];

/**
 * Paths that legitimately render SQL → out of scope (repo-relative globs).
 *
 * Test-infra DDL helpers render SQL by design and will never migrate to
 * @blazetrails/arel — scope them out rather than baseline them so the RFC-0022
 * burndown worklist reflects only real arel migration targets.
 */
export const noRawSqlIgnores = [
  "packages/activerecord/src/**/*.test.ts",
  "packages/activerecord/src/connection-adapters/**",
  "packages/activerecord/src/adapters/**",
  "packages/activerecord/src/tasks/**",
  "packages/activerecord/src/**/schema-*.ts",
  "packages/activerecord/src/test-helpers/**",
  // The fixture machinery is `lib/active_record/fixtures.rb:595` /
  // `test_fixtures.rb:113` code (RFC 0064 bucket D); it renders DDL/DML
  // directly for the same reason the rest of the test-infra does. Anchored to
  // the exact ported files — matching `fixtures.ts` by basename would also
  // exempt any future same-named module elsewhere under activerecord/src.
  "packages/activerecord/src/fixtures.ts",
  "packages/activerecord/src/test-fixtures.ts",
  "packages/activerecord/src/test-fixtures/**",
  "packages/activerecord/src/support/**",
  "packages/activerecord/src/test-setup-*.ts",
  "packages/activerecord/src/cases/helper.ts",
];

/** Minimal glob → RegExp for the subset used above: `**`, `*`, literals. */
function globToRegExp(glob) {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          source += "(?:.*/)?";
        } else {
          source += ".*";
        }
      } else {
        source += "[^/]*";
      }
    } else if ("\\^$.|?+()[]{}".includes(ch)) {
      source += `\\${ch}`;
    } else {
      source += ch;
    }
  }
  return new RegExp(`^${source}$`);
}

const ignoreRes = noRawSqlIgnores.map(globToRegExp);

/** True when `rel` (a repo-relative path) is out of the rule's scope. */
export function isExcludedPath(rel) {
  return ignoreRes.some((re) => re.test(rel));
}
