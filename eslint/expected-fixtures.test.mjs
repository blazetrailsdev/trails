import { RuleTester } from "eslint";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Point the rule at tmp files via env overrides so the committed
// expected-fixtures-exclude.json (and the gitignored deps artifact) are
// never touched — a hard SIGKILL between beforeAll and afterAll can no
// longer leave a synthetic baseline staged in the worktree.
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "expected-fixtures-"));
const TMP_DEPS = path.join(TMP_DIR, "deps.json");
const TMP_EXCLUDE = path.join(TMP_DIR, "exclude.json");
process.env.EXPECTED_FIXTURES_DEPS_PATH = TMP_DEPS;
process.env.EXPECTED_FIXTURES_EXCLUDE_PATH = TMP_EXCLUDE;

// Imported AFTER env vars are set so the rule's module-level path
// constants pick them up.
const {
  default: rule,
  trailsToRailsRel,
  collectUseFixturesKeys,
} = await import("./expected-fixtures.mjs");

beforeAll(() => {
  fs.writeFileSync(
    TMP_DEPS,
    JSON.stringify({
      "aggregations_test.rb": {
        requires: ["customer"],
        fixtures: ["customers", "warehouse-things"],
        setFixtureClass: {},
        // Both sets are referenced by at least one Rails test → enforced.
        tests: {
          test_find: {
            fixtures: { customers: ["david"], "warehouse-things": ["one"] },
          },
        },
      },
      "associations/eager_test.rb": {
        requires: [],
        fixtures: ["posts", "authors"],
        setFixtureClass: {},
        tests: { test_eager: { fixtures: { posts: ["a"], authors: ["b"] } } },
      },
      "excluded_test.rb": {
        requires: [],
        fixtures: ["topics"],
        setFixtureClass: {},
        tests: { test_t: { fixtures: { topics: ["first"] } } },
      },
      "no_fixtures_test.rb": {
        requires: [],
        fixtures: [],
        setFixtureClass: {},
        tests: {},
      },
      "declared_but_unreferenced_test.rb": {
        requires: [],
        // fixtures declared but no test references a record — scaffolding-only;
        // rule should not fire.
        fixtures: ["topics"],
        setFixtureClass: {},
        tests: {},
      },
      "partial_reference_test.rb": {
        requires: [],
        // Only `posts` is dereferenced; `authors` is scaffolding only. Rule
        // should require `posts` and ignore `authors`.
        fixtures: ["posts", "authors"],
        setFixtureClass: {},
        tests: { test_p: { fixtures: { posts: ["a"] } } },
      },
    }),
  );
  fs.writeFileSync(TMP_EXCLUDE, JSON.stringify(["packages/activerecord/src/excluded.test.ts"]));
});
afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("trailsToRailsRel", () => {
  it("maps kebab-case basenames to snake_case rails paths", () => {
    expect(trailsToRailsRel("/x/packages/activerecord/src/aggregations.test.ts")).toBe(
      "aggregations_test.rb",
    );
    expect(
      trailsToRailsRel("/x/packages/activerecord/src/associations/has-many-associations.test.ts"),
    ).toBe("associations/has_many_associations_test.rb");
  });
  it("returns null for non-activerecord paths", () => {
    expect(trailsToRailsRel("/x/packages/arel/src/foo.test.ts")).toBeNull();
    expect(trailsToRailsRel("/x/random/file.ts")).toBeNull();
  });
});

describe("collectUseFixturesKeys", () => {
  // The rule uses ESLint's CallExpression visitor and never invokes this
  // helper directly. The baseline builder (scripts/test-deps/build-fixture-
  // baseline.ts) parses source outside an ESLint run and depends entirely
  // on this walker, so it needs its own coverage.
  it("walks the program, unions keys across multiple calls, and ignores non-useFixtures calls", async () => {
    const { parser } = await import("typescript-eslint");
    const parse = (s) => parser.parseForESLint(s, { loc: true, range: true }).ast;
    const src = [
      'describe("A", () => { useFixtures({ customers: x, "warehouse-things": y }); });',
      'describe("B", () => { useFixtures({ posts: z }); });',
      "unrelated({ ignored: 1 });",
      "useFixtures();", // call with no arg — still counts as `found`
    ].join("\n");
    const ast = parse(src);
    const { found, keys } = collectUseFixturesKeys(ast);
    expect(found).toBe(true);
    expect([...keys].sort()).toEqual(["customers", "posts", "warehouse-things"]);
  });

  it("returns found=false when there are no useFixtures calls", async () => {
    const { parser } = await import("typescript-eslint");
    const parse = (s) => parser.parseForESLint(s, { loc: true, range: true }).ast;
    const ast = parse("const x = other({ customers: 1 });");
    const { found, keys } = collectUseFixturesKeys(ast);
    expect(found).toBe(false);
    expect(keys.size).toBe(0);
  });
});

describe("expected-fixtures rule", () => {
  it("runs RuleTester cases", async () => {
    const tester = new RuleTester({
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        parser: (await import("typescript-eslint")).parser,
      },
    });
    runCases(tester);
  });
});

function runCases(tester) {
  tester.run("expected-fixtures", rule, {
    valid: [
      {
        name: "matching useFixtures call (string + identifier keys)",
        filename: path.join(ROOT, "packages/activerecord/src/aggregations.test.ts"),
        code: `const fx = useFixtures({ customers: [C, {}], "warehouse-things": [W, {}] });\n`,
      },
      {
        name: "extra keys allowed",
        filename: path.join(ROOT, "packages/activerecord/src/aggregations.test.ts"),
        code: `const fx = useFixtures({ customers: [C, {}], "warehouse-things": [W, {}], extras: [E, {}] });\n`,
      },
      {
        name: "useFixtures inside describe block",
        filename: path.join(ROOT, "packages/activerecord/src/aggregations.test.ts"),
        code: `describe("X", () => { const fx = useFixtures({ customers: [C, {}], "warehouse-things": [W, {}] }); });\n`,
      },
      {
        name: "multiple useFixtures calls union their keys",
        filename: path.join(ROOT, "packages/activerecord/src/aggregations.test.ts"),
        code: `describe("A", () => { useFixtures({ customers: [C, {}] }); });\ndescribe("B", () => { useFixtures({ "warehouse-things": [W, {}] }); });\n`,
      },
      {
        name: "rails file with no fixtures → no-op",
        filename: path.join(ROOT, "packages/activerecord/src/no-fixtures.test.ts"),
        code: `// nothing\n`,
      },
      {
        name: "rails declares fixtures but no test references records → no-op",
        filename: path.join(ROOT, "packages/activerecord/src/declared-but-unreferenced.test.ts"),
        code: `// nothing — Rails scaffolding-only, no enforcement\n`,
      },
      {
        name: "partial-reference: only the dereferenced set is required",
        filename: path.join(ROOT, "packages/activerecord/src/partial-reference.test.ts"),
        code: `const fx = useFixtures({ posts: [P, {}] });\n`,
      },
      {
        name: "excluded files are skipped",
        filename: path.join(ROOT, "packages/activerecord/src/excluded.test.ts"),
        code: `// no useFixtures call but excluded\n`,
      },
      {
        name: "non-activerecord paths ignored",
        filename: path.join(ROOT, "packages/arel/src/foo.test.ts"),
        code: `// nothing\n`,
      },
    ],
    invalid: [
      {
        name: "missing useFixtures entirely",
        filename: path.join(ROOT, "packages/activerecord/src/aggregations.test.ts"),
        code: `// no fixtures here\n`,
        errors: [{ messageId: "missing" }],
      },
      {
        name: "useFixtures present but missing a key",
        filename: path.join(ROOT, "packages/activerecord/src/associations/eager.test.ts"),
        code: `const fx = useFixtures({ posts: [P, {}] });\n`,
        errors: [{ messageId: "incomplete" }],
      },
    ],
  });
}
