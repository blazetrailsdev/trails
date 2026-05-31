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
          name: "string-array without schema but accessor never called → no warning",
          code: `describe("T", () => {
            const { customers } = useFixtures(["customers"], () => conn);
            it("foo", () => { expect(1).toBe(1); });
          });`,
        },
        {
          name: "string-array with schema in extra options key position",
          code: `describe("T", () => {
            const { customers } = useFixtures(["customers"], () => conn, { schema: S, other: 1 });
            it("foo", () => { customers("david"); });
          });`,
        },
      ],
      invalid: [
        {
          name: "string-array without schema, accessor used → warns with default schemaVar",
          code: `describe("T", () => {
            const { customers } = useFixtures(["customers"], () => conn);
            it("foo", () => { const c = customers("david"); });
          });`,
          errors: [{ messageId: "missingSchema" }],
          output: `describe("T", () => {
            const { customers } = useFixtures(["customers"], () => conn, { schema: TEST_SCHEMA });
            it("foo", () => { const c = customers("david"); });
          });`,
        },
        {
          name: "detects imported schema name and uses it in message + fix",
          code: `import { MY_SCHEMA } from "./test-schema.js";
describe("T", () => {
  const { customers } = useFixtures(["customers"], () => conn);
  it("foo", () => { customers("david"); });
});`,
          errors: [{ messageId: "missingSchema", data: { schemaVar: "MY_SCHEMA" } }],
          output: `import { MY_SCHEMA } from "./test-schema.js";
describe("T", () => {
  const { customers } = useFixtures(["customers"], () => conn, { schema: MY_SCHEMA });
  it("foo", () => { customers("david"); });
});`,
        },
        {
          name: "empty options object replaced, not appended",
          code: `describe("T", () => {
            const { encryptedBooks } = useFixtures(["encryptedBooks"], () => Base.adapter, {});
            it("foo", () => { encryptedBooks("awdr"); });
          });`,
          errors: [{ messageId: "missingSchema" }],
          output: `describe("T", () => {
            const { encryptedBooks } = useFixtures(["encryptedBooks"], () => Base.adapter, { schema: TEST_SCHEMA });
            it("foo", () => { encryptedBooks("awdr"); });
          });`,
        },
      ],
    });
  });
});
