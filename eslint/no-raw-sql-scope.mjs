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

import { activerecordSrcRoot } from "./test-infra-scope.mjs";

/** Root the rule and its scope globs are anchored to (repo-relative). */
export const noRawSqlRoot = activerecordSrcRoot;

/** Files the rule applies to (repo-relative glob). */
export const noRawSqlFiles = [`${noRawSqlRoot}/**/*.ts`];

/**
 * Paths that legitimately render SQL → out of scope (repo-relative globs).
 *
 * Test-infra DDL helpers render SQL by design and will never migrate to
 * @blazetrails/arel — scope them out rather than baseline them so the RFC-0022
 * burndown worklist reflects only real arel migration targets.
 */
export const noRawSqlIgnores = [
  "**/*.test.ts",
  "connection-adapters/**",
  "adapters/**",
  "tasks/**",
  "**/schema-*.ts",
  "test-helpers/**",
  // The fixture machinery is `lib/active_record/fixtures.rb:595` /
  // `test_fixtures.rb:113` code (RFC 0064 bucket D); it renders DDL/DML
  // directly for the same reason the rest of the test-infra does. Anchored to
  // the exact ported files — matching `fixtures.ts` by basename would also
  // exempt any future same-named module elsewhere under activerecord/src.
  "fixtures.ts",
  "test-fixtures.ts",
  "test-fixtures/**",
  "support/**",
  "test-setup-*.ts",
  "cases/helper.ts",
].map((glob) => `${noRawSqlRoot}/${glob}`);

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

/** Repo-relative path under the rule's root; null when the file is outside it. */
export function repoRel(filename) {
  const norm = filename.replace(/\\/g, "/");
  const m = norm.match(new RegExp(`(?:^|/)(${noRawSqlRoot}/.+\\.ts)$`));
  return m ? m[1] : null;
}

/** True when `rel` (a repo-relative path) is out of the rule's scope. */
export function isExcludedPath(rel) {
  return ignoreRes.some((re) => re.test(rel));
}
