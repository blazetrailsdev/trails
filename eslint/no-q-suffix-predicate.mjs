/**
 * ESLint rule: no-q-suffix-predicate
 *
 * A Ruby `?` predicate ports as `isX` (`hasX` only where
 * `HAS_PREDICATE_ALIASES` in scripts/parity/conventions.ts says so) — the
 * spellings `rubyMethodToTs` produces and `parity:api` pairs on. trails once
 * encoded the `?` as a trailing `Q` instead (`connected_to?` → `connectedToQ`),
 * and RFC 0153 renamed every one away and stopped crediting the spelling in
 * `parity:api:extra` and the naming taxonomy. This rule keeps the class closed:
 * a declared name ending in a lowercase letter or digit followed by `Q` is that
 * retired encoding, since no Rails name ends in a capital `Q`.
 *
 * Flags class members, interface members, object-literal keys, function
 * declarations and module-scope variables. Locals inside a body are left alone.
 */

const Q_SUFFIX = /[a-z0-9]Q$/;

function keyName(key, computed) {
  if (computed || !key) return null;
  if (key.type === "Identifier") return key.name;
  if (key.type === "Literal" && typeof key.value === "string") return key.value;
  return null;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow the retired `Q`-suffix spelling of a Ruby `?` predicate",
    },
    schema: [],
    messages: {
      qSuffix:
        "`{{name}}` uses the retired `Q` encoding of a Ruby `?` predicate; spell it `{{suggestion}}` (docs/ruby-ts-conventions.md).",
    },
  },
  create(context) {
    function check(node, name) {
      if (typeof name !== "string" || !Q_SUFFIX.test(name)) return;
      const stem = name.slice(0, -1);
      const bare = stem.replace(/^_/, "");
      const suggestion = `is${bare[0].toUpperCase()}${bare.slice(1)}`;
      context.report({ node, messageId: "qSuffix", data: { name, suggestion } });
    }

    function checkKey(node) {
      check(node.key, keyName(node.key, node.computed));
    }

    return {
      MethodDefinition: checkKey,
      PropertyDefinition: checkKey,
      TSAbstractMethodDefinition: checkKey,
      TSAbstractPropertyDefinition: checkKey,
      TSMethodSignature: checkKey,
      TSPropertySignature: checkKey,
      Property(node) {
        if (node.parent?.type === "ObjectExpression") checkKey(node);
      },
      FunctionDeclaration(node) {
        if (node.id) check(node.id, node.id.name);
      },
      VariableDeclarator(node) {
        const scope = context.sourceCode.getScope(node);
        if (scope.type !== "module" && scope.type !== "global") return;
        if (node.id.type === "Identifier") check(node.id, node.id.name);
      },
    };
  },
};

export default rule;
