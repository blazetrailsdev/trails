import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { RuleTester } from "eslint";
import { describe, it, expect } from "vitest";
import { Linter } from "eslint";
import rule, { STUBBED_DDL_METHODS } from "./no-load-schema-with-stubbed-ddl.mjs";

const FILENAME = "packages/activerecord/src/support/load-schema-helper-uuid-default.trails.test.ts";

const tester = new RuleTester({
  languageOptions: {
    parser: (await import("typescript-eslint")).parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

tester.run("no-load-schema-with-stubbed-ddl", rule, {
  valid: [
    // The arm-direct shape this cover must keep: createTable stubbed, the
    // adapter-specific arm called directly.
    {
      filename: FILENAME,
      code: `
        import { loadAdapterSpecificSchema } from "./load-schema-helper.js";
        const probe = new Proxy(adapter, {
          get(target, prop) {
            if (prop === "createTable") return async () => {};
            return Reflect.get(target, prop, target);
          },
        });
        await loadAdapterSpecificSchema(probe);
      `,
    },
    // loadSchema with no DDL emitter stubbed is the ordinary schema load.
    {
      filename: "packages/activerecord/src/support/load-schema-helper.test.ts",
      code: `
        import { loadSchema } from "./load-schema-helper.js";
        await loadSchema(adapter);
      `,
    },
    // A createTable call is not a stub — only naming it as an intercepted
    // member is.
    {
      filename: FILENAME,
      code: `
        import { loadSchema } from "./load-schema-helper.js";
        await adapter.createTable("posts", {}, (t) => {});
        await loadSchema(adapter);
      `,
    },
    // `Model.loadSchema()` is AR's own reflection load, unrelated to the
    // test-infra helper — migration.test.ts pairs it with a createTable stub.
    {
      filename: "packages/activerecord/src/migration.test.ts",
      code: `
        const delegate = { createTable: () => "hi mom!" };
        await BigNumber.loadSchema();
      `,
    },
    // Naming the method without intercepting it is not a stub.
    {
      filename: "packages/activerecord/src/migration.test.ts",
      code: `
        import { loadSchema } from "./support/load-schema-helper.js";
        expect(migration.methodMissing("createTable")).toBe("hi mom!");
        await loadSchema(adapter);
      `,
    },
  ],
  invalid: [
    // The #5676 shape: Proxy trap on createTable + loadSchema.
    {
      filename: FILENAME,
      code: `
        import { loadSchema } from "./load-schema-helper.js";
        const probe = new Proxy(adapter, {
          get(target, prop) {
            if (prop === "createTable") return async () => {};
            return Reflect.get(target, prop, target);
          },
        });
        await loadSchema(probe);
      `,
      errors: [{ messageId: "misrouted" }, { messageId: "misrouted" }],
    },
    // The stub-object form of the same mistake.
    {
      filename: FILENAME,
      code: `
        const stub = { createTable: async () => {} };
        await loadSchema(stub);
      `,
      errors: [{ messageId: "misrouted" }],
    },
    // A member past `createTable`: `runTable` lays canonical tables through the
    // SchemaStatements companion, which reaches the database via
    // `adapter.execute`, so intercepting that lays nothing either.
    {
      filename: FILENAME,
      code: `
        const probe = new Proxy(adapter, {
          get(target, prop) {
            if (prop === "execute") return async () => [];
            return Reflect.get(target, prop, target);
          },
        });
        await loadSchema(probe);
      `,
      errors: [{ messageId: "misrouted" }],
    },
    {
      filename: FILENAME,
      code: `
        const stub = { schemaStatements: () => ({ createTable: async () => {} }) };
        await loadSchema(stub);
      `,
      errors: [{ messageId: "misrouted" }],
    },
    // The other two interception dispatch shapes.
    {
      filename: FILENAME,
      code: `
        const probe = new Proxy(adapter, {
          get(target, prop) {
            switch (prop) {
              case "createTable":
                return async () => {};
            }
            return Reflect.get(target, prop, target);
          },
        });
        await loadSchema(probe);
      `,
      errors: [{ messageId: "misrouted" }],
    },
    {
      filename: FILENAME,
      code: `
        const intercepted = ["createTable", "dropTable"];
        if (intercepted.includes(prop)) return async () => {};
        await loadSchema(probe);
      `,
      errors: [{ messageId: "misrouted" }],
    },
  ],
});

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

describe("the real arm-content cover", () => {
  it("is clean under the rule", async () => {
    const file = path.join(repoRoot, FILENAME);
    const code = await fs.readFile(file, "utf8");
    const linter = new Linter();
    const messages = linter.verify(code, {
      plugins: { blazetrails: { rules: { "no-load-schema-with-stubbed-ddl": rule } } },
      languageOptions: {
        parser: (await import("typescript-eslint")).parser,
        ecmaVersion: 2022,
        sourceType: "module",
      },
      rules: { "blazetrails/no-load-schema-with-stubbed-ddl": "error" },
    });
    expect(messages).toEqual([]);
    // Guards the fixture itself: if the cover stops stubbing createTable the
    // rule would pass vacuously here.
    expect(code).toContain('prop === "createTable"');
  });
});

// The rule reads its set out of the TS declaration site's text rather than
// importing it. This pins that the parse really landed: a regex that stopped
// matching the array would otherwise leave the rule guarding a stale set, and
// the throw only covers parsing *nothing*.
describe("the guarded method set", () => {
  it("is the runtime guard's, parsed out of its declaration site", async () => {
    const { STUBBED_DDL_METHODS: runtimeMethods } =
      await import("../packages/activerecord/src/support/stubbed-ddl-methods.ts");
    expect([...STUBBED_DDL_METHODS].sort()).toEqual([...runtimeMethods].sort());
    expect(STUBBED_DDL_METHODS.has("createTable")).toBe(true);
  });
});
