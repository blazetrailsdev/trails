/**
 * ESLint rule: no-js-rendering-in-rails-messages
 *
 * Rails renders a value into an error message or an `inspect` body with
 * `inspect`, `.class` and `.class.name`. The JS reflexes render differently:
 *
 *   - `JSON.stringify(x)` for `x.inspect` — `:name` is `":name"` in Ruby and
 *     `"\":name\""` here, a Hash is `{"a" => 1}` in Ruby and `{"a":1}` here;
 *   - `x.constructor.name` / `x.constructor?.name` for `x.class` /
 *     `x.class.name` — `Number` where Ruby says `Integer`, and the bare class
 *     name where Ruby prints the module path;
 *   - `String(x)` for `x.to_s` — Ruby's `Array#to_s` IS `inspect`
 *     (`[1, 2]`), JS's is `1,2`.
 *
 * So each is flagged where it sits inside an argument of a `throw new` or
 * inside a method named `inspect` / `[Symbol.for("nodejs.util.inspect.custom")]`.
 * Anywhere else — a JSON encoder, a cache key — it is not a Ruby rendering and
 * is left alone. A message built into a local before the `throw` is not seen;
 * the rule reads the throw site only.
 *
 * Scoped to Rails-matched source: test files are not enrolled, and a file
 * carrying a file-level `@noRailsEquivalent` receipt has no Rails rendering to
 * mirror. Not autofixable: the remedy is ruby-compat's `rbInspect` /
 * `rbObjClass` / `rbBuiltinClassName`, or the value's own ported `inspect`,
 * and which one is a per-site reading of the Rails line.
 *
 * ENROLLMENT is per package, in the `files` list of the rule's block in
 * eslint.config.mjs. That set is ONLY-GROW: a package joins once its sites are
 * converged, and no package is ever removed to turn a red run green.
 */
import { hasFileLevelReceipt } from "./unbacked-internal-needs-receipt.mjs";

const INSPECT_CUSTOM = "nodejs.util.inspect.custom";

function propertyName(node) {
  if (!node) return undefined;
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal") return String(node.value);
  return undefined;
}

function jsRendering(node) {
  if (node.type === "CallExpression") {
    const callee = node.callee;
    if (callee.type === "Identifier" && callee.name === "String") return "String()";
    if (
      callee.type === "MemberExpression" &&
      !callee.computed &&
      callee.object.type === "Identifier" &&
      callee.object.name === "JSON" &&
      propertyName(callee.property) === "stringify"
    ) {
      return "JSON.stringify()";
    }
    return undefined;
  }
  if (
    node.type === "MemberExpression" &&
    !node.computed &&
    propertyName(node.property) === "name" &&
    node.object.type === "MemberExpression" &&
    !node.object.computed &&
    propertyName(node.object.property) === "constructor"
  ) {
    return ".constructor.name";
  }
  return undefined;
}

function isInspectCustomKey(key) {
  return (
    key.type === "CallExpression" &&
    key.callee.type === "MemberExpression" &&
    propertyName(key.callee.object) === "Symbol" &&
    propertyName(key.callee.property) === "for" &&
    key.arguments[0]?.type === "Literal" &&
    key.arguments[0].value === INSPECT_CUSTOM
  );
}

function isInspectMember(node) {
  if (node.type === "FunctionDeclaration") return node.id?.name === "inspect";
  if (
    node.type !== "MethodDefinition" &&
    node.type !== "Property" &&
    node.type !== "PropertyDefinition"
  ) {
    return false;
  }
  if (node.computed) return isInspectCustomKey(node.key);
  return propertyName(node.key) === "inspect";
}

function messageContext(node) {
  let child = node;
  for (let n = node.parent; n; child = n, n = n.parent) {
    if (
      n.type === "NewExpression" &&
      n.parent?.type === "ThrowStatement" &&
      n.arguments.includes(child)
    ) {
      return "throw";
    }
    if (isInspectMember(n)) return "inspect";
  }
  return undefined;
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Render values into Rails error messages and inspect bodies the way Ruby does, not with JSON.stringify / String() / constructor.name",
    },
    schema: [],
    messages: {
      jsRendering:
        "`{{what}}` inside {{where}} renders the JS way, not Ruby's. Port the Rails " +
        "line: `x.inspect` is ruby-compat's `rbInspect(x)` (or the value's own ported " +
        "`inspect`), `x.class` / `x.class.name` is ruby-compat's `rbObjClass(x)` / " +
        "`rbBuiltinClassName(x)`, and `x.to_s` on an Array is `inspect`.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    let exempt;
    const check = (node) => {
      const what = jsRendering(node);
      if (what === undefined) return;
      const where = messageContext(node);
      if (where === undefined) return;
      exempt ??= hasFileLevelReceipt(sourceCode);
      if (exempt) return;
      context.report({
        node,
        messageId: "jsRendering",
        data: { what, where: where === "throw" ? "a `throw new` argument" : "an `inspect` body" },
      });
    };
    return { CallExpression: check, MemberExpression: check };
  },
};

export default rule;
