import { RuleTester } from "eslint";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import { describe, it, expect, afterAll } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rails-test-name-parity-"));
const TMP_NAMES = path.join(TMP_DIR, "names.json");
const TMP_MARK = path.join(TMP_DIR, "mark.json");
const _prevNames = process.env.RAILS_TEST_NAMES_PATH;
const _prevMark = process.env.RAILS_TEST_NAME_PARITY_MARK_PATH;
process.env.RAILS_TEST_NAMES_PATH = TMP_NAMES;
process.env.RAILS_TEST_NAME_PARITY_MARK_PATH = TMP_MARK;

fs.writeFileSync(
  TMP_NAMES,
  JSON.stringify({
    "packages/arel/src/table.test.ts": ["should return an attribute", "should create a join"],
    "packages/arel/src/marked.test.ts": ["should return an attribute"],
    "packages/arel/src/table.trails.test.ts": ["should return an attribute"],
  }),
);
fs.writeFileSync(TMP_MARK, JSON.stringify({ "packages/arel/src/marked.test.ts": 1 }));

const { default: rule, isManifestAvailable } = await import("./rails-test-name-parity.mjs");

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  if (_prevNames === undefined) delete process.env.RAILS_TEST_NAMES_PATH;
  else process.env.RAILS_TEST_NAMES_PATH = _prevNames;
  if (_prevMark === undefined) delete process.env.RAILS_TEST_NAME_PARITY_MARK_PATH;
  else process.env.RAILS_TEST_NAME_PARITY_MARK_PATH = _prevMark;
});

const AREL = (rel) => path.join(ROOT, "packages/arel/src", rel);

describe("rails-test-name-parity rule", () => {
  it("runs RuleTester cases", () => {
    const tester = new RuleTester();
    tester.run("rails-test-name-parity", rule, {
      valid: [
        {
          name: "a test whose name matches a Rails test in the counterpart",
          filename: AREL("table.test.ts"),
          code: `describe("Table", () => { it("should return an attribute", () => {}); });`,
        },
        {
          name: "normalization matches on case, whitespace and erb→tse",
          filename: AREL("table.test.ts"),
          code: `describe("Table", () => { it("Should   Create A Join", () => {}); });`,
        },
        {
          name: "a skipped test is exempt",
          filename: AREL("table.test.ts"),
          code: `describe("Table", () => { it.skip("no such rails test", () => {}); });`,
        },
        {
          name: "a test inside a skipped describe is exempt",
          filename: AREL("table.test.ts"),
          code: `describe.skip("Table", () => { it("no such rails test", () => {}); });`,
        },
        {
          name: "a .trails.test.ts file is exempt",
          filename: AREL("table.trails.test.ts"),
          code: `describe("Table", () => { it("no such rails test", () => {}); });`,
        },
        {
          name: "a file with no Rails counterpart is out of scope",
          filename: AREL("unmapped.test.ts"),
          code: `describe("Unmapped", () => { it("no such rails test", () => {}); });`,
        },
        {
          name: "extras at the file's mark stay green",
          filename: AREL("marked.test.ts"),
          code: `describe("Marked", () => { it("ts only one", () => {}); });`,
        },
      ],
      invalid: [
        {
          name: "a test with no Rails counterpart is reported",
          filename: AREL("table.test.ts"),
          code: `describe("Table", () => { it("no such rails test", () => {}); });`,
          errors: [{ messageId: "overMark" }],
        },
        {
          name: "extras over the file's mark are reported",
          filename: AREL("marked.test.ts"),
          code: `describe("Marked", () => { it("ts only one", () => {}); it("ts only two", () => {}); });`,
          errors: [{ messageId: "overMark" }],
        },
        {
          name: "reportAll flags each extra individually",
          filename: AREL("marked.test.ts"),
          code: `describe("Marked", () => { it("ts only one", () => {}); it("ts only two", () => {}); });`,
          options: [{ reportAll: true }],
          errors: [{ messageId: "extra" }, { messageId: "extra" }],
        },
      ],
    });
  });

  it("reports the manifest as available when it carries names", () => {
    expect(isManifestAvailable()).toBe(true);
  });
});
