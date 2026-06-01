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

const AR = (rel) => path.join(ROOT, "packages/activerecord/src", rel);

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
          name: "accessor called in it() body → no warning",
          filename: AR("aggregations.test.ts"),
          code: `describe("T", () => { const { customers } = useFixtures(["c"], () => conn); it("find single value object", () => { customers("david"); }); });`,
        },
        {
          name: "useHandlerFixtures accessor called in body → no warning",
          filename: AR("aggregations.test.ts"),
          code: `const { customers } = useHandlerFixtures({ customers: [C, {}] }); describe("T", () => { it("find single value object", () => { customers("david"); }); });`,
        },
        {
          name: "useHandlerTransactionalFixtures (no accessor) → scope-level pass",
          filename: AR("aggregations.test.ts"),
          code: `describe("T", () => { useHandlerTransactionalFixtures(); it("find single value object", () => { expect(1).toBe(1); }); });`,
        },
        {
          name: "accessor from outer describe used in nested it() → no warning",
          filename: AR("aggregations.test.ts"),
          code: `describe("Outer", () => { const { customers } = useFixtures(["c"], () => conn); describe("Inner", () => { it("find single value object", () => { customers("david"); }); }); });`,
        },
        {
          name: "accessor at file scope used in describe it() → no warning",
          filename: AR("aggregations.test.ts"),
          code: `const { customers } = useFixtures(["c"], () => conn); describe("T", () => { it("find single value object", () => { customers("david"); }); });`,
        },
        {
          name: "it.skipIf with accessor called → no warning",
          filename: AR("aggregations.test.ts"),
          code: `describe("T", () => { const { customers } = useFixtures(["c"], () => conn); it.skipIf(true)("find single value object", () => { customers("david"); }); });`,
        },
        {
          name: "describe.only recognized as scope",
          filename: AR("aggregations.test.ts"),
          code: `describe.only("T", () => { const { customers } = useFixtures(["c"], () => conn); it("find single value object", () => { customers("david"); }); });`,
        },
        {
          name: "test not in mapping → no warning",
          filename: AR("aggregations.test.ts"),
          code: `describe("X", () => { it("trails-only test", () => {}); });`,
        },
        {
          name: "file not in mapping → no warning",
          filename: AR("attribute-methods.test.ts"),
          code: `describe("X", () => { it("find single value object", () => {}); });`,
        },
        {
          name: "non-activerecord file → ignored",
          filename: path.join(ROOT, "packages/arel/src/foo.test.ts"),
          code: `describe("X", () => { it("find single value object", () => {}); });`,
        },
      ],
      invalid: [
        {
          name: "no useFixtures in scope → warns",
          filename: AR("aggregations.test.ts"),
          code: `describe("T", () => { it("find single value object", () => { expect(1).toBe(1); }); });`,
          errors: [{ messageId: "missing" }],
        },
        {
          name: "useFixtures present but it() body never calls accessor → warns",
          filename: AR("aggregations.test.ts"),
          code: `describe("T", () => { const { customers } = useFixtures(["c"], () => conn); it("find single value object", () => { expect(1).toBe(1); }); });`,
          errors: [{ messageId: "missing" }],
        },
        {
          name: "sibling describe accessor not visible → warns",
          filename: AR("aggregations.test.ts"),
          code: `describe("A", () => { const { customers } = useFixtures(["c"], () => conn); }); describe("B", () => { it("find single value object", () => { customers("david"); }); });`,
          errors: [{ messageId: "missing" }],
        },
        {
          name: "subdirectory file without accessor call → warns",
          filename: AR("associations/eager.test.ts"),
          code: `describe("EagerTest", () => { it("eager loading", () => {}); });`,
          errors: [{ messageId: "missing" }],
        },
        {
          name: "it.skipIf without accessor call → warns",
          filename: AR("aggregations.test.ts"),
          code: `describe("T", () => { it.skipIf(true)("find single value object", () => {}); });`,
          errors: [{ messageId: "missing" }],
        },
      ],
    });
  });
});
