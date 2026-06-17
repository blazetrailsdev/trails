import { RuleTester } from "eslint";
import rule from "./no-standalone-associations.mjs";

// Point the rule at a non-existent exclude baseline so the committed list
// never grandfathers these synthetic fixtures.
process.env.NO_STANDALONE_ASSOCIATIONS_EXCLUDE_PATH = "/nonexistent-exclude.json";

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
      code:
        "Associations.hasMany.call(P, 'cs', {});\n" +
        "class P extends Base {\n  static {}\n}",
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
  ],
});
