/**
 * ESLint rule: async-querying-empty
 *
 * `Object#blank?` is `respond_to?(:empty?) ? !!empty? : false`
 * (`activesupport/lib/active_support/core_ext/object/blank.rb:18-20`) — a
 * synchronous call that issues no I/O, because Ruby has no async `empty?`.
 *
 * trails does: `Relation#isEmpty`, `CollectionAssociation#isEmpty`,
 * `Preloader#isEmpty` and `Querying#isEmpty` all run a query. `isBlank`
 * (`activesupport/src/core-ext/object/blank.ts`) invokes a method-shaped
 * `isEmpty`/`empty` exactly as blank.rb:19 invokes `empty?`, and holds out the
 * querying ones by reading the function object's `AsyncFunction` tag BEFORE the
 * call — the only point at which exclusion is worth anything, since invoking to
 * find out would already have issued the query.
 *
 * A NON-`async` function returning a promise carries no `AsyncFunction` tag, so
 * nothing readable on the function object distinguishes it and the query goes
 * out. This rule closes that hole by construction: an `isEmpty` / `empty` that
 * answers a promise — declared as a `Promise` return type, or returning a
 * promise-shaped expression (`await`, `new Promise`, a `Promise.<static>` call,
 * a `.then`/`.catch`/`.finally` chain) — must carry the `async` keyword, so
 * blank.rb:19's probe can invoke every non-`async` one knowing it is
 * synchronous.
 *
 * Configure the names with `[{ names: ["..."] }]`; defaults to the two
 * spellings the probe reaches (`isEmpty`, the conventions-table spelling of
 * `empty?`, and `empty`, the getter actionpack's Hash-like wrappers carry).
 */

const DEFAULT_NAMES = ["isEmpty", "empty"];

/** True when a type annotation is `Promise<…>` / `PromiseLike<…>`, or a union containing one. */
function isPromiseType(typeAnnotation) {
  if (!typeAnnotation) return false;
  const node =
    typeAnnotation.type === "TSTypeAnnotation" ? typeAnnotation.typeAnnotation : typeAnnotation;
  if (!node) return false;
  if (node.type === "TSUnionType") return node.types.some((t) => isPromiseType(t));
  if (node.type !== "TSTypeReference" || node.typeName?.type !== "Identifier") return false;
  return node.typeName.name === "Promise" || node.typeName.name === "PromiseLike";
}

const PROMISE_METHODS = new Set(["then", "catch", "finally"]);

/** True when an expression is promise-shaped on its face, with no type information. */
function isPromiseExpression(node) {
  if (!node) return false;
  switch (node.type) {
    case "AwaitExpression":
      return true;
    case "NewExpression":
      return node.callee?.type === "Identifier" && node.callee.name === "Promise";
    case "CallExpression": {
      const callee = node.callee;
      if (callee?.type !== "MemberExpression" || callee.computed) return false;
      if (callee.property?.type !== "Identifier") return false;
      // `x.then(…)` / `x.catch(…)` / `x.finally(…)`, and every `Promise.<static>(…)`.
      if (PROMISE_METHODS.has(callee.property.name)) return true;
      return callee.object?.type === "Identifier" && callee.object.name === "Promise";
    }
    case "TSAsExpression":
    case "TSNonNullExpression":
      return isPromiseExpression(node.expression);
    case "ConditionalExpression":
      return isPromiseExpression(node.consequent) || isPromiseExpression(node.alternate);
    case "LogicalExpression":
      return isPromiseExpression(node.left) || isPromiseExpression(node.right);
    default:
      return false;
  }
}

/**
 * True when a function returns a promise-shaped expression, so an unannotated
 * body is caught as well as a declared `Promise` return type. Nested functions
 * are skipped: their returns belong to them, not to this one.
 */
function returnsPromiseShape(node) {
  const body = node.body;
  if (!body) return false;
  if (body.type !== "BlockStatement") return isPromiseExpression(body);

  const stack = [body];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current.type === "ReturnStatement") {
      if (isPromiseExpression(current.argument)) return true;
      continue;
    }
    for (const key of Object.keys(current)) {
      if (key === "parent") continue;
      const child = current[key];
      for (const value of Array.isArray(child) ? child : [child]) {
        if (value === null || typeof value?.type !== "string") continue;
        if (
          value.type === "FunctionDeclaration" ||
          value.type === "FunctionExpression" ||
          value.type === "ArrowFunctionExpression"
        ) {
          continue;
        }
        stack.push(value);
      }
    }
  }
  return false;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a promise-returning `isEmpty`/`empty` to be spelled `async`, so `blank?`'s probe can invoke the synchronous ones.",
    },
    schema: [
      {
        type: "object",
        properties: {
          names: { type: "array", items: { type: "string" }, minItems: 1 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingAsync:
        "`{{name}}` answers a promise but is not spelled `async`. `Object#blank?`'s probe (core_ext/object/blank.rb:19) invokes every non-`async` `empty?`, reading the `AsyncFunction` tag before the call — a bare `Promise` return type is erased by then, so this one's query would be issued. Add `async`.",
    },
  },

  create(context) {
    const names = new Set(context.options[0]?.names ?? DEFAULT_NAMES);

    /** The declared name of a function-like node, or null. */
    function declaredName(node) {
      const parent = node.parent;
      if (node.type === "FunctionDeclaration") return node.id?.name ?? null;
      if (!parent) return null;
      if (
        (parent.type === "MethodDefinition" ||
          parent.type === "Property" ||
          parent.type === "PropertyDefinition") &&
        !parent.computed &&
        parent.key?.type === "Identifier"
      ) {
        return parent.key.name;
      }
      if (parent.type === "VariableDeclarator" && parent.id?.type === "Identifier") {
        return parent.id.name;
      }
      return null;
    }

    function check(node) {
      if (node.async) return;
      if (!isPromiseType(node.returnType) && !returnsPromiseShape(node)) return;
      const name = declaredName(node);
      if (name === null || !names.has(name)) return;
      context.report({ node, messageId: "missingAsync", data: { name } });
    }

    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
    };
  },
};

export default rule;
