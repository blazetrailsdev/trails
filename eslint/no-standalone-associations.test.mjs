import { RuleTester } from "eslint";
import { expect } from "vitest";
import rule, { macroOfCall } from "./no-standalone-associations.mjs";

const FILENAME = "packages/activerecord/src/associations.test.ts";

const tester = new RuleTester({
  languageOptions: {
    parser: (await import("typescript-eslint")).parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

tester.run("no-standalone-associations", rule, {
  valid: [
    // The desired in-class form is never flagged.
    {
      filename: FILENAME,
      code: "class P extends Base {\n  static {\n    this.hasMany('cs', { className: 'C' });\n  }\n}",
    },
    // Unrelated `.call` usages are ignored.
    { filename: FILENAME, code: "foo.bar.call(x, 1);" },
    { filename: FILENAME, code: "Associations.loadHasMany.call(x, 'cs');" },
    // Outside packages/ tree → rule is a no-op.
    { filename: "/tmp/scratch.ts", code: "Associations.hasMany.call(P, 'cs', {});" },
  ],
  invalid: [
    // Safe fix: class declared before the call, in the same file, with a
    // static {} block → relocated into the block, statement removed.
    {
      filename: FILENAME,
      code:
        "class P extends Base {\n  static {\n    this._tableName = 'ps';\n  }\n}\n" +
        "Associations.hasMany.call(P, 'cs', { className: 'C' });\n",
      output:
        "class P extends Base {\n  static {\n    this._tableName = 'ps';\n    this.hasMany('cs', { className: 'C' });\n  }\n}\n",
      errors: [{ messageId: "standalone", data: { macro: "hasMany", receiver: "P" } }],
    },
    // belongsTo with a multi-line options object — continuation lines are
    // reindented to land cleanly inside the static block (old statement col 0
    // → new indent 4, so a +4 shift on every line after the first).
    {
      filename: FILENAME,
      code:
        "class C extends Base {\n  static {\n    this._tableName = 'cs';\n  }\n}\n" +
        "Associations.belongsTo.call(C, 'p', {\n  className: 'P',\n});\n",
      output:
        "class C extends Base {\n  static {\n    this._tableName = 'cs';\n    this.belongsTo('p', {\n      className: 'P',\n    });\n  }\n}\n",
      errors: [{ messageId: "standalone" }],
    },
    // Safe fix into an EMPTY static block — insert right after `{`.
    {
      filename: FILENAME,
      code: "class P extends Base {\n  static {}\n}\nAssociations.hasMany.call(P, 'cs', {});\n",
      output: "class P extends Base {\n  static {\n    this.hasMany('cs', {});\n  }\n}\n",
      errors: [{ messageId: "standalone" }],
    },
    // Multi-line arg dedented when the old statement was more deeply indented
    // than the target static block (shift is negative).
    {
      filename: FILENAME,
      code:
        "class C extends Base {\nstatic {\nthis._tableName = 'cs';\n}\n}\n" +
        "    Associations.hasMany.call(C, 'xs', {\n      className: 'X',\n    });\n",
      output:
        "class C extends Base {\nstatic {\nthis._tableName = 'cs';\nthis.hasMany('xs', {\n  className: 'X',\n});\n}\n}\n",
      errors: [{ messageId: "standalone" }],
    },
    // A local alias of a class (`const Q = P;`) resolves through to the class
    // it aliases, and the report names the real class.
    {
      filename: FILENAME,
      code:
        "class P extends Base {\n  static {\n    this._tableName = 'ps';\n  }\n}\n" +
        "const Q = P;\n" +
        "Associations.hasMany.call(Q, 'cs', { className: 'C' });\n",
      output:
        "class P extends Base {\n  static {\n    this._tableName = 'ps';\n    this.hasMany('cs', { className: 'C' });\n  }\n}\n" +
        "const Q = P;\n",
      errors: [{ messageId: "standalone", data: { macro: "hasMany", receiver: "P" } }],
    },
    // An alias chain resolves through every hop.
    {
      filename: FILENAME,
      code:
        "class P extends Base {\n  static {}\n}\nconst Q = P;\nconst R = Q;\n" +
        "Associations.hasOne.call(R, 'c', {});\n",
      output:
        "class P extends Base {\n  static {\n    this.hasOne('c', {});\n  }\n}\nconst Q = P;\nconst R = Q;\n",
      errors: [{ messageId: "standalone", data: { macro: "hasOne", receiver: "P" } }],
    },
    // An alias bound in an UNRELATED block does not reach a receiver it never
    // shadows: resolution walks the scope chain from the call site, so `Q` here
    // stays unresolved rather than picking up the sibling block's binding.
    {
      filename: FILENAME,
      code:
        "class P extends Base {\n  static {}\n}\n" +
        "{\n  const Q = P;\n  void Q;\n}\n" +
        "Associations.hasMany.call(Q, 'cs', {});\n",
      errors: [
        {
          messageId: "standaloneNoFix",
          data: { macro: "hasMany", reason: "Q is not declared in this file" },
        },
      ],
    },
    // An alias of a name that is NOT a class in this file still reports, and
    // the reason names the resolved identifier.
    {
      filename: FILENAME,
      code: "const Q = Imported;\nAssociations.hasMany.call(Q, 'cs', {});\n",
      errors: [
        {
          messageId: "standaloneNoFix",
          data: { macro: "hasMany", reason: "Imported is not declared in this file" },
        },
      ],
    },
    // No fix: receiver class is not declared in this file.
    {
      filename: FILENAME,
      code: "Associations.hasOne.call(Imported, 'x', {});",
      errors: [{ messageId: "standaloneNoFix" }],
    },
    // No fix: target class has no static {} block.
    {
      filename: FILENAME,
      code: "class P extends Base {}\nAssociations.hasMany.call(P, 'cs', {});",
      errors: [{ messageId: "standaloneNoFix" }],
    },
    // No fix: the call is not a standalone statement (used as an initializer).
    {
      filename: FILENAME,
      code: "class P extends Base { static {} }\nconst r = Associations.hasMany.call(P, 'cs', {});",
      errors: [{ messageId: "standaloneNoFix" }],
    },
    // No fix: receiver is not a simple identifier.
    {
      filename: FILENAME,
      code: "Associations.hasMany.call(makeClass(), 'cs', {});",
      errors: [{ messageId: "standaloneNoFix" }],
    },
    // No fix: class declared AFTER the call (moving it earlier could reorder).
    {
      filename: FILENAME,
      code: "Associations.hasMany.call(P, 'cs', {});\n" + "class P extends Base {\n  static {}\n}",
      errors: [{ messageId: "standaloneNoFix" }],
    },
    // No fix: ambiguous — two classes share the receiver name.
    {
      filename: FILENAME,
      code:
        "{ class P extends Base { static {} } }\n" +
        "{ class P extends Base { static {} } }\n" +
        "Associations.hasAndBelongsToMany.call(P, 'cs', {});",
      errors: [{ messageId: "standaloneNoFix" }],
    },
    // No fix: the call lives in a deeper scope than the class declaration
    // (e.g. inside an it() callback while the class is at describe scope).
    // Hoisting a per-invocation call into the once-run static {} block would
    // drop repeat declarations and change behavior.
    {
      filename: FILENAME,
      code:
        "class P extends Base {\n  static {}\n}\n" +
        "describe('x', () => {\n  Associations.hasMany.call(P, 'cs', {});\n});",
      errors: [{ messageId: "standaloneNoFix" }],
    },
    // No fix: a sibling statement between the class and the call mutates a
    // member of the receiver (the `X._associations = []` reset idiom). Hoisting
    // the call into the static {} block would run it before the reset wipes it.
    {
      filename: FILENAME,
      code:
        "class P extends Base {\n  static {}\n}\n" +
        "P._associations = [];\n" +
        "Associations.hasMany.call(P, 'cs', {});",
      errors: [{ messageId: "standaloneNoFix" }],
    },
    // No fix: the aliased reset form `[X].forEach((m) => { m._associations = [] })`
    // — guard #4 must walk into the callback and match the `_associations` reset
    // even though the assignment target's root is the loop variable, not P.
    {
      filename: FILENAME,
      code:
        "class P extends Base {\n  static {}\n}\n" +
        "[P].forEach((m) => { m._associations = []; });\n" +
        "Associations.hasMany.call(P, 'cs', {});",
      errors: [{ messageId: "standaloneNoFix" }],
    },
    // No fix: an argument references a binding declared AFTER the target class.
    // Hoisting into the static {} block would read `scope` in its TDZ at
    // class-evaluation time (runtime ReferenceError), so leave it in place.
    {
      filename: FILENAME,
      code:
        "class P extends Base {\n  static {}\n}\n" +
        "const scope = () => {};\n" +
        "Associations.hasMany.call(P, 'cs', { scope });",
      errors: [{ messageId: "standaloneNoFix" }],
    },
    // No fix: a destructured binding declared after the class is referenced in
    // the args — `bindingNamesOf` must record the destructured name so the TDZ
    // guard fires (a simple-identifier-only check would miss it).
    {
      filename: FILENAME,
      code:
        "class P extends Base {\n  static {}\n}\n" +
        "const { scope } = getOpts();\n" +
        "Associations.hasMany.call(P, 'cs', { scope });",
      errors: [{ messageId: "standaloneNoFix" }],
    },
    // Safe fix despite a same-named variable between class and call: the `owner`
    // in `scope: (owner) => owner` is the arrow's own parameter, not the outer
    // `const owner`, so the reference walk excludes it and the fix proceeds.
    {
      filename: FILENAME,
      code:
        "class P extends Base {\n  static {\n    this._tableName = 'ps';\n  }\n}\n" +
        "const owner = 5;\n" +
        "Associations.hasMany.call(P, 'cs', { scope: (owner) => owner });\n",
      output:
        "class P extends Base {\n  static {\n    this._tableName = 'ps';\n    this.hasMany('cs', { scope: (owner) => owner });\n  }\n}\n" +
        "const owner = 5;\n",
      errors: [{ messageId: "standalone" }],
    },
  ],
});

describe("macroOfCall", () => {
  const macroCalls = async (code) => {
    const { parseForESLint } = (await import("typescript-eslint")).parser;
    const found = [];
    const walk = (node) => {
      if (!node || typeof node.type !== "string") return;
      if (node.type === "CallExpression" && macroOfCall(node.callee)) found.push(node);
      for (const [key, child] of Object.entries(node)) {
        if (key === "parent") continue;
        for (const c of Array.isArray(child) ? child : [child]) walk(c);
      }
    };
    walk(parseForESLint(code, { ecmaVersion: 2022, sourceType: "module" }).ast);
    return found;
  };

  it("macroOfCall matches only a callee rooted at the identifier Associations", async () => {
    for (const code of [
      "const A = Associations; A.hasMany.call(P, 'cs');",
      "ns.Associations.hasMany.call(P, 'cs');",
      "Associations['hasMany'].call(P, 'cs');",
      "Assoc.hasMany.call(P, 'cs');",
    ]) {
      expect(await macroCalls(code)).toHaveLength(0);
    }
  });
});
