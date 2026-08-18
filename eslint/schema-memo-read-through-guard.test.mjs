import { RuleTester } from "eslint";
import rule from "./schema-memo-read-through-guard.mjs";

const tester = new RuleTester({
  languageOptions: {
    parser: (await import("typescript-eslint")).parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

tester.run("schema-memo-read-through-guard", rule, {
  valid: [
    // The guarded reads.
    'const hash = ownSchemaMemo(host, "_columnsHash");',
    // Mid-replay readers take the own-property half, without the pull fallback.
    'const hash = ownProp(host, "_columnsHash");',
    "if (isSchemaLoaded(this)) return;",
    // Writes fill and reset the memo — that is not the stale-read hazard.
    "this._virtualAttributesReconciled = false;",
    "host._columnsHash = hash;",
    "delete host._schemaLoaded;",
    // The guard's own raw reads are the sanctioned ones.
    "function ownSchemaMemo(host, key) { return host._columnsHash; }",
    "function schemaStaleAgainstAncestors(host) { return current._columns; }",
    "function ownProp(host, key) { return host._columnsHash; }",
    // An unrelated property name.
    "const cache = this._schemaCache;",
    // Computed access cannot be resolved statically.
    "const v = host[key];",
  ],
  invalid: [
    {
      code: "const hash = this._columnsHash;",
      errors: [{ messageId: "rawRead", data: { name: "_columnsHash" } }],
    },
    {
      code: "if (this._schemaLoaded) return;",
      errors: [{ messageId: "rawRead" }],
    },
    {
      code: "const builder = (this as any)._attributesBuilder;",
      errors: [{ messageId: "rawRead" }],
    },
    {
      code: "function loadSchema(host) { return host._columns.length; }",
      errors: [{ messageId: "rawRead" }],
    },
    {
      code: "if (!this._virtualAttributesReconciled) reconcile();",
      errors: [{ messageId: "rawRead" }],
    },
  ],
});

// The message is the only place a violator learns which primitive to reach for,
// and routing a mid-replay reader through `ownSchemaMemo` blanks the hash its
// own `applyColumnsHash` just wrote — so the message must name `ownProp` too.
for (const primitive of ["isSchemaLoaded", "ownSchemaMemo", "ownProp"]) {
  if (!rule.meta.messages.rawRead.includes(primitive)) {
    throw new Error(`rawRead message does not name \`${primitive}\``);
  }
}
