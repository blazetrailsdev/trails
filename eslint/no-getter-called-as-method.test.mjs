import { RuleTester } from "eslint";
import rule from "./no-getter-called-as-method.mjs";

const tester = new RuleTester({
  languageOptions: {
    parser: (await import("typescript-eslint")).parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

tester.run("no-getter-called-as-method", rule, {
  valid: [
    // The correct reads.
    "const dirty = record.hasChangesToSave;",
    "if (record?.hasChangesToSave === true) save();",
    "const dirty = (record as any).hasChangesToSave;",
    // A same-named getter on an unrelated receiver still reads fine.
    "if (joinRecord.hasChangesToSave) save();",
    // Not a configured getter.
    "record.isNewRecord();",
    "if (typeof record.save === 'function') record.save();",
    // Computed access is out of scope (can't resolve the name statically).
    "record['hasChangesToSave']();",
    // A `typeof` guard against something other than "function" is not the
    // dead-gate shape this rule targets.
    "if (typeof record.hasChangesToSave === 'boolean') save();",
    // Non-default getter list leaves the default name alone.
    { code: "record.hasChangesToSave();", options: [{ getters: ["changed"] }] },
  ],
  invalid: [
    {
      code: "if (record.hasChangesToSave()) save();",
      errors: [{ messageId: "called", data: { name: "hasChangesToSave" } }],
    },
    // Mode B: optional-call still throws once the receiver is non-nil.
    {
      code: "if (record?.hasChangesToSave?.()) save();",
      errors: [{ messageId: "called" }],
    },
    {
      code: "const dirty = (record as any).hasChangesToSave();",
      errors: [{ messageId: "called" }],
    },
    // Mode A: the dead typeof gate, in both operand orders and both operators.
    {
      code: "if (typeof record.hasChangesToSave === 'function') record.hasChangesToSave();",
      errors: [{ messageId: "typeofGuard" }, { messageId: "called" }],
    },
    {
      code: "if ('function' === typeof record.hasChangesToSave) save();",
      errors: [{ messageId: "typeofGuard" }],
    },
    {
      code: "if (typeof record.hasChangesToSave !== 'function') save();",
      errors: [{ messageId: "typeofGuard" }],
    },
    // Configurable: an extra getter name is flagged when opted in.
    {
      code: "if (r.changed()) save();",
      options: [{ getters: ["changed"] }],
      errors: [{ messageId: "called", data: { name: "changed" } }],
    },
  ],
});
