import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { default as rule } from "./use-fixtures-schema.mjs";

describe("use-fixtures-schema rule", () => {
  it("runs RuleTester cases", async () => {
    const tester = new RuleTester({
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        parser: (await import("typescript-eslint")).parser,
      },
    });

    tester.run("use-fixtures-schema", rule, {
      valid: [
        {
          name: "string-array form with { schema } → valid",
          code: `describe("T", () => {
            const { customers } = useFixtures(["customers"], () => conn, { schema: TEST_SCHEMA });
            it("foo", () => { customers("david"); });
          });`,
        },
        {
          name: "object form (inline fixtures) → exempt",
          code: `describe("T", () => {
            const { topics } = useFixtures({ topics: [Topic, { r: {} }] }, () => conn);
            it("foo", () => { topics("r"); });
          });`,
        },
        {
          name: "accessor not called in any it() → no warning",
          code: `describe("T", () => {
            const { customers } = useFixtures(["customers"], () => conn);
            it("foo", () => { expect(1).toBe(1); });
          });`,
        },
        {
          name: "it.skipIf with schema present → valid",
          code: `describe("T", () => {
            const { customers } = useFixtures(["customers"], () => conn, { schema: S });
            it.skipIf(true)("foo", () => { customers("david"); });
          });`,
        },
        {
          name: "accessor called in nested describe → valid when schema present",
          code: `describe("Outer", () => {
            const { customers } = useFixtures(["customers"], () => conn, { schema: S });
            describe("Inner", () => { it("foo", () => { customers("david"); }); });
          });`,
        },
      ],
      invalid: [
        {
          name: "no schema, accessor used, schema import present → fix applied",
          code: `import { TEST_SCHEMA } from "./test-schema.js";
describe("T", () => {
  const { customers } = useFixtures(["customers"], () => conn);
  it("foo", () => { customers("david"); });
});`,
          errors: [{ messageId: "missingSchemaWithFix", data: { schemaVar: "TEST_SCHEMA" } }],
          output: `import { TEST_SCHEMA } from "./test-schema.js";
describe("T", () => {
  const { customers } = useFixtures(["customers"], () => conn, { schema: TEST_SCHEMA });
  it("foo", () => { customers("david"); });
});`,
        },
        {
          name: "no schema import → reports without autofix",
          code: `describe("T", () => {
            const { customers } = useFixtures(["customers"], () => conn);
            it("foo", () => { customers("david"); });
          });`,
          errors: [{ messageId: "missingSchemaNoFix" }],
          output: null,
        },
        {
          name: "empty options object replaced when schema import present",
          code: `import { MY_SCHEMA } from "./s.js";
describe("T", () => {
  const { books } = useFixtures(["books"], () => conn, {});
  it("foo", () => { books("one"); });
});`,
          errors: [{ messageId: "missingSchemaWithFix", data: { schemaVar: "MY_SCHEMA" } }],
          output: `import { MY_SCHEMA } from "./s.js";
describe("T", () => {
  const { books } = useFixtures(["books"], () => conn, { schema: MY_SCHEMA });
  it("foo", () => { books("one"); });
});`,
        },
        {
          name: "it.skipIf accessor usage triggers warning",
          code: `import { TEST_SCHEMA } from "./s.js";
describe("T", () => {
  const { customers } = useFixtures(["customers"], () => conn);
  it.skipIf(true)("foo", () => { customers("david"); });
});`,
          errors: [{ messageId: "missingSchemaWithFix" }],
          output: `import { TEST_SCHEMA } from "./s.js";
describe("T", () => {
  const { customers } = useFixtures(["customers"], () => conn, { schema: TEST_SCHEMA });
  it.skipIf(true)("foo", () => { customers("david"); });
});`,
        },
        {
          name: "accessor in nested describe triggers warning on outer useFixtures",
          code: `import { TEST_SCHEMA } from "./s.js";
describe("Outer", () => {
  const { customers } = useFixtures(["customers"], () => conn);
  describe("Inner", () => { it("foo", () => { customers("david"); }); });
});`,
          errors: [{ messageId: "missingSchemaWithFix" }],
          output: `import { TEST_SCHEMA } from "./s.js";
describe("Outer", () => {
  const { customers } = useFixtures(["customers"], () => conn, { schema: TEST_SCHEMA });
  describe("Inner", () => { it("foo", () => { customers("david"); }); });
});`,
        },
      ],
    });
  });
});
