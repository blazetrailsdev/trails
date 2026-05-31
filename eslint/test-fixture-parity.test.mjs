import { RuleTester } from "eslint";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import { describe, it, beforeAll, afterAll } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "test-fixture-parity-"));
const TMP_MAP = path.join(TMP_DIR, "map.json");
const _prevMapPath = process.env.TEST_FIXTURE_PARITY_MAP_PATH;
process.env.TEST_FIXTURE_PARITY_MAP_PATH = TMP_MAP;

const { default: rule } = await import("./test-fixture-parity.mjs");

beforeAll(() => {
  fs.writeFileSync(
    TMP_MAP,
    JSON.stringify({
      "aggregations.test.ts": ["find single value object", "find multiple value object"],
      "associations/eager.test.ts": ["eager loading"],
    }),
  );
});

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  if (_prevMapPath === undefined) delete process.env.TEST_FIXTURE_PARITY_MAP_PATH;
  else process.env.TEST_FIXTURE_PARITY_MAP_PATH = _prevMapPath;
});

describe("test-fixture-parity rule", () => {
  it("runs RuleTester cases", async () => {
    const tester = new RuleTester({
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        parser: (await import("typescript-eslint")).parser,
      },
    });

    tester.run("test-fixture-parity", rule, {
      valid: [
        {
          name: "describe with useFixtures → no warning",
          filename: path.join(ROOT, "packages/activerecord/src/aggregations.test.ts"),
          code: `describe("T", () => { const fx = useFixtures(["customers"], () => conn); it("find single value object", () => {}); });`,
        },
        {
          name: "useHandlerTransactionalFixtures also satisfies",
          filename: path.join(ROOT, "packages/activerecord/src/aggregations.test.ts"),
          code: `describe("T", () => { useHandlerTransactionalFixtures(); it("find single value object", () => {}); });`,
        },
        {
          name: "test not in mapping → no warning",
          filename: path.join(ROOT, "packages/activerecord/src/aggregations.test.ts"),
          code: `describe("X", () => { it("trails-only test not in rails", () => {}); });`,
        },
        {
          name: "file not in mapping → no warning",
          filename: path.join(ROOT, "packages/activerecord/src/attribute-methods.test.ts"),
          code: `describe("X", () => { it("find single value object", () => {}); });`,
        },
        {
          name: "non-activerecord file → ignored",
          filename: path.join(ROOT, "packages/arel/src/foo.test.ts"),
          code: `describe("X", () => { it("find single value object", () => {}); });`,
        },
        {
          name: "useFixtures at file scope satisfies it() at file scope",
          filename: path.join(ROOT, "packages/activerecord/src/aggregations.test.ts"),
          code: `const fx = useFixtures(["customers"], () => conn); it("find single value object", () => {});`,
        },
        {
          name: "useFixtures at file scope satisfies it() inside describe",
          filename: path.join(ROOT, "packages/activerecord/src/aggregations.test.ts"),
          code: `const fx = useFixtures(["customers"], () => conn); describe("T", () => { it("find single value object", () => {}); });`,
        },
        {
          name: "useFixtures in outer describe satisfies it() in nested describe",
          filename: path.join(ROOT, "packages/activerecord/src/aggregations.test.ts"),
          code: `describe("Outer", () => { useFixtures(["customers"], () => conn); describe("Inner", () => { it("find single value object", () => {}); }); });`,
        },
        {
          name: "describe.only is recognized as a describe scope",
          filename: path.join(ROOT, "packages/activerecord/src/aggregations.test.ts"),
          code: `describe.only("T", () => { useFixtures(["customers"], () => conn); it("find single value object", () => {}); });`,
        },
        {
          name: "it.skipIf(cond)(...) is checked and passes when useFixtures present",
          filename: path.join(ROOT, "packages/activerecord/src/aggregations.test.ts"),
          code: `describe("T", () => { useFixtures(["customers"], () => conn); it.skipIf(true)("find single value object", () => {}); });`,
        },
        {
          name: "describe.skipIf(cond)(...) is recognized as describe scope",
          filename: path.join(ROOT, "packages/activerecord/src/aggregations.test.ts"),
          code: `describe.skipIf(true)("T", () => { useFixtures(["customers"], () => conn); it("find single value object", () => {}); });`,
        },
      ],
      invalid: [
        {
          name: "describe missing useFixtures → warns",
          filename: path.join(ROOT, "packages/activerecord/src/aggregations.test.ts"),
          code: `describe("T", () => { it("find single value object", () => {}); });`,
          errors: [{ messageId: "missing" }],
        },
        {
          name: "subdirectory file warned",
          filename: path.join(ROOT, "packages/activerecord/src/associations/eager.test.ts"),
          code: `describe("EagerTest", () => { it("eager loading", () => {}); });`,
          errors: [{ messageId: "missing" }],
        },
        {
          name: "useFixtures in sibling describe does not satisfy another describe",
          filename: path.join(ROOT, "packages/activerecord/src/aggregations.test.ts"),
          code: `describe("A", () => { useFixtures(["customers"], () => conn); }); describe("B", () => { it("find single value object", () => {}); });`,
          errors: [{ messageId: "missing" }],
        },
        {
          name: "it.skipIf without useFixtures → warns",
          filename: path.join(ROOT, "packages/activerecord/src/aggregations.test.ts"),
          code: `describe("T", () => { it.skipIf(true)("find single value object", () => {}); });`,
          errors: [{ messageId: "missing" }],
        },
      ],
    });
  });
});
