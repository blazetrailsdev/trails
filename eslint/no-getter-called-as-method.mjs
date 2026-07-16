/**
 * ESLint rule: no-getter-called-as-method
 *
 * Some Rails predicates port onto TypeScript *getters* rather than methods —
 * `ActiveModel::Dirty#has_changes_to_save?` becomes
 * `get hasChangesToSave(): boolean` (activemodel/src/model.ts). Those getters
 * are deliberately never wired through `include()`, because `include()`
 * replaces the getter descriptor with a data property (see the Category A note
 * in activerecord/src/base.ts).
 *
 * Ruby's uniform-access principle makes `record.has_changes_to_save?` read the
 * same whether it's an attribute or a method, so a port transcribed from Rails
 * naturally comes out as `record.hasChangesToSave()`. That is always wrong, and
 * `tsc` cannot see it once the receiver is widened with `as any` — which is
 * exactly how six association call sites drifted before this rule existed. Two
 * failure modes, both silent:
 *
 *   typeof x.hasChangesToSave === "function"   // "boolean" — gate always false,
 *                                              // the Rails clause is dropped
 *   x.hasChangesToSave?.()                     // getter yields false;
 *                                              // `false?.()` throws TypeError
 *
 * Flags, for each configured getter name:
 *   - `x.hasChangesToSave()` and `x.hasChangesToSave?.()`
 *   - `typeof x.hasChangesToSave === "function"` (and `!==`)
 *
 * `changed` (`ActiveModel::Dirty#changed?`, model.ts:1943) is the same shape
 * with the same footgun, and `find_from_target?` is one of its call sites, so it
 * is defaulted on too — there are no `.changed()` callers to grandfather.
 *
 * Configure with `[{ getters: ["..."] }]`; defaults to the getters that have
 * actually been miscalled. Read the getter instead: `x.hasChangesToSave`, or
 * `x?.hasChangesToSave === true` when the receiver may be nil.
 */

const DEFAULT_GETTERS = ["hasChangesToSave", "changed"];

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow calling Rails-ported boolean getters (e.g. `hasChangesToSave`) as if they were methods.",
    },
    schema: [
      {
        type: "object",
        properties: {
          getters: { type: "array", items: { type: "string" }, minItems: 1 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      called:
        "`{{name}}` is a getter, not a method — `{{name}}()` calls its boolean result and throws. Read it instead: `x.{{name}}` (or `x?.{{name}} === true` if the receiver may be nil).",
      typeofGuard:
        '`typeof x.{{name}}` is always "boolean", never "function" — this guard is dead and silently drops the gate it protects. Read the getter instead: `x.{{name}}`.',
    },
  },

  create(context) {
    const getters = new Set(context.options[0]?.getters ?? DEFAULT_GETTERS);

    /** Returns the getter name when `node` is `<expr>.<getter>`, else null. */
    function getterName(node) {
      if (!node || node.type !== "MemberExpression" || node.computed) return null;
      if (node.property.type !== "Identifier") return null;
      return getters.has(node.property.name) ? node.property.name : null;
    }

    return {
      // `x.hasChangesToSave()` / `x.hasChangesToSave?.()`
      CallExpression(node) {
        const name = getterName(node.callee);
        if (name) context.report({ node, messageId: "called", data: { name } });
      },
      // `typeof x.hasChangesToSave === "function"`
      BinaryExpression(node) {
        if (node.operator !== "===" && node.operator !== "!==") return;
        for (const [side, other] of [
          [node.left, node.right],
          [node.right, node.left],
        ]) {
          if (side.type !== "UnaryExpression" || side.operator !== "typeof") continue;
          const name = getterName(side.argument);
          if (!name) continue;
          if (other.type !== "Literal" || other.value !== "function") continue;
          context.report({ node, messageId: "typeofGuard", data: { name } });
          return;
        }
      },
    };
  },
};

export default rule;
