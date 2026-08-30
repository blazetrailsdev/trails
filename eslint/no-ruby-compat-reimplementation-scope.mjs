/**
 * Single source of truth for the `blazetrails/no-ruby-compat-reimplementation`
 * scope and its alias register. The rule re-checks scope by filename (so it
 * stays testable in isolation) and eslint.config.mjs applies the same globs —
 * the `no-raw-sql-scope.mjs` split, for the same reason: two independently
 * maintained lists disagree after any file move.
 */

/** Files the rule applies to (repo-relative globs). */
export const noRubyCompatReimplementationFiles = ["packages/*/src/**/*.ts"];

/**
 * Out of scope (repo-relative globs). `packages/ruby-compat/` is the sanctioned
 * home: a declaration there is the primitive, not a re-implementation of it.
 * Tests and test-helpers mirror Rails' `test/` tree.
 */
export const noRubyCompatReimplementationIgnores = [
  "packages/ruby-compat/**",
  "**/*.test.ts",
  "**/test-helpers/**",
];

/**
 * The alias register: names that ARE a ruby-compat primitive under another
 * spelling, seeded from today's tree, growing by one row whenever a convergence
 * uncovers another spelling.
 *
 * Each entry is a name plus the CONTEXT that makes it unambiguous, because a
 * bare name list would flag Rails ports. `kind: "function"` matches a
 * standalone function declaration (or a `const f = () => …`), never a class
 * method: a method named `isSymbol` is `Journey::Nodes::Node#symbol?`
 * (`actionpack/lib/action_dispatch/journey/nodes/node.rb:103`) and one named
 * `fetch` is `ActiveSupport::Cache::Store#fetch`
 * (`activesupport/lib/active_support/cache.rb:444`). `firstParamType` separates
 * a local `fetch(hash, key, default)` over a `Record` from anything else.
 *
 * `compare` is deliberately NOT registered: `ActiveRecord::Core#<=>`
 * (`activerecord/lib/active_record/core.rb:665`) and
 * `DateAndTime::Calculations#<=>` port to a function named exactly that, and
 * nothing distinguishes those from a hand-rolled comparator. `cmp` and
 * `spaceship` carry no such port and are registered.
 */
export const rubyCompatAliases = [
  { name: "regexpEscape", kind: "function", primitive: "Regexp.escape" },
  { name: "escapeRegExp", kind: "function", primitive: "Regexp.escape" },
  { name: "isSymbol", kind: "function", primitive: "the Symbol predicate" },
  { name: "symbolToS", kind: "function", primitive: "Symbol#to_s" },
  { name: "rational", kind: "function", primitive: "Kernel#Rational()" },
  { name: "Rational", kind: "class", primitive: "Rational" },
  { name: "ZeroDivisionError", kind: "class", primitive: "ZeroDivisionError" },
  { name: "cmp", kind: "function", primitive: "Comparable's `<=>`" },
  { name: "spaceship", kind: "function", primitive: "Comparable's `<=>`" },
  { name: "fetch", kind: "function", firstParamType: "Record", primitive: "Hash#fetch" },
  { name: "KeyError", kind: "class", primitive: "KeyError" },
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
    } else if (ch === ".") {
      source += "\\.";
    } else {
      source += ch;
    }
  }
  return new RegExp(`(^|/)${source}$`);
}

const fileMatchers = noRubyCompatReimplementationFiles.map(globToRegExp);
const ignoreMatchers = noRubyCompatReimplementationIgnores.map(globToRegExp);

/** Whether a repo-relative path is in scope. */
export function inScope(rel) {
  if (ignoreMatchers.some((re) => re.test(rel))) return false;
  return fileMatchers.some((re) => re.test(rel));
}
