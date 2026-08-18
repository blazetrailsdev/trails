/**
 * ESLint rule: schema-memo-read-through-guard
 *
 * Rails invalidates schema state by pushing DOWN through DescendantsTracker,
 * whose registry Ruby's `inherited` hook fills the moment a subclass is defined
 * (`vendor/rails/activerecord/lib/active_record/model_schema.rb:553-568`). JS
 * has no `inherited` hook: trails registers a subclass only when
 * `registerSubclass` is explicitly called, so `reloadSchemaFromCache`'s
 * recursive push (`model-schema.ts`) reaches only the registered ones.
 *
 * The gap is covered by a PULL fallback — `schemaStaleAgainstAncestors`
 * (`model-schema.ts:74`) walks the prototype chain on every schema-memo read and
 * answers the memo as `undefined` when an ancestor stamped a newer
 * `_schemaRevision`. That is only sound while EVERY read of the memoized schema
 * state routes through `ownSchemaMemo` / `isSchemaLoaded`. Nothing enforced it;
 * a raw `this._columnsHash` read on a subclass silently serves the ancestor's
 * stale value (JS statics are inherited, Ruby class ivars are not), which is the
 * defect this rule makes impossible.
 *
 * Scoped to the model-class statics: `packages/activerecord/src/*.ts` (the
 * directory the invariant was hand-verified over). `SchemaCache`'s unrelated
 * private `_columnsHash` instance field lives a directory down and is untouched.
 *
 * Writes are fine — they are how the memo gets filled and reset. Only reads are
 * flagged.
 */

const DEFAULT_MEMOS = [
  "_schemaLoaded",
  "_columnsHash",
  "_columns",
  "_attributesBuilder",
  "_virtualAttributesReconciled",
];

/** `x.y = v`, `x.y += v`, `x.y++`, `delete x.y` — a write, not a read. */
function isWritePosition(node, parent) {
  if (!parent) return false;
  if (parent.type === "AssignmentExpression" && parent.left === node) return true;
  if (parent.type === "UpdateExpression" && parent.argument === node) return true;
  if (parent.type === "UnaryExpression" && parent.operator === "delete") return true;
  return false;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require reads of the memoized model schema state to route through `ownSchemaMemo` / `isSchemaLoaded`.",
    },
    schema: [
      {
        type: "object",
        properties: {
          memos: { type: "array", items: { type: "string" }, minItems: 1 },
          allowIn: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      rawRead:
        'Raw read of `{{name}}`: JS statics are inherited where Ruby class ivars are not, so on a subclass this serves the ancestor\'s memo — stale once an ancestor stamped `_schemaRevision`. Route it through one of: `isSchemaLoaded(host)` for the loaded flag; `ownSchemaMemo(host, "{{name}}")` outside a schema load, which adds the `schemaStaleAgainstAncestors` pull fallback; or `ownProp(host, "{{name}}")` for a reader running INSIDE the class\'s own `applyColumnsHash` / decorator replay, where `_schemaRevision` is not stamped until the end and the pull fallback would blank the hash just written.',
    },
  },

  create(context) {
    const options = context.options[0] ?? {};
    const memos = new Set(options.memos ?? DEFAULT_MEMOS);
    // `ownSchemaMemo`, `ownProp` and `schemaStaleAgainstAncestors` ARE the guard;
    // their own reads are the sanctioned ones.
    const allowIn = new Set(
      options.allowIn ?? ["ownSchemaMemo", "ownProp", "schemaStaleAgainstAncestors"],
    );

    /** Name of the nearest enclosing function declaration/expression, if any. */
    function enclosingFunctionNames(node) {
      const names = [];
      for (let n = node.parent; n; n = n.parent) {
        if (n.type === "FunctionDeclaration" && n.id) names.push(n.id.name);
        else if (
          (n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression") &&
          n.parent?.type === "VariableDeclarator" &&
          n.parent.id.type === "Identifier"
        )
          names.push(n.parent.id.name);
      }
      return names;
    }

    return {
      MemberExpression(node) {
        if (node.computed || node.property.type !== "Identifier") return;
        const name = node.property.name;
        if (!memos.has(name)) return;
        if (isWritePosition(node, node.parent)) return;
        if (enclosingFunctionNames(node).some((n) => allowIn.has(n))) return;
        context.report({ node, messageId: "rawRead", data: { name } });
      },
    };
  },
};

export default rule;
