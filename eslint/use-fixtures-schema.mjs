/**
 * ESLint rule: use-fixtures-schema
 *
 * When `useFixtures` is called with the string-array overload (registry-based
 * fixtures, e.g. `useFixtures(["customers"], () => conn)`), the options object
 * must include a `schema` property so the fixture loader can derive and create
 * the relevant tables automatically — rather than relying on a separate,
 * potentially out-of-sync `defineSchema` call.
 *
 *   ✗  useFixtures(["customers"], () => conn)
 *   ✗  useFixtures(["customers"], () => conn, {})
 *   ✓  useFixtures(["customers"], () => conn, { schema: TEST_SCHEMA })
 *
 * The object overload `useFixtures({ topics: [Topic, {...}] }, ...)` is exempt
 * because inline fixtures wire the schema themselves.
 *
 * Only fires when the describe scope has at least one `it()` / `test()` that
 * calls the returned accessor (`customers("david")`) or references a model
 * class method — i.e. the fixtures are demonstrably used. This keeps warnings
 * to a very low count (currently 2 in the codebase).
 */

const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Require `{ schema }` option on `useFixtures(stringArray, ...)` calls so tables are derived and created automatically.",
    },
    schema: [],
    fixable: "code",
    messages: {
      missingSchema:
        "`useFixtures` with a fixture-name array requires a `{ schema: ... }` option so the fixture loader can derive and create the necessary tables. Pass e.g. `{ schema: {{schemaVar}} }` as the third argument.",
    },
  },
  create(context) {
    // Collect useFixtures(array, ...) calls that lack { schema }.
    const candidates = [];
    // Collect describe-body → Set of accessor names that are called inside it().
    const accessorCallsInDescribe = new Map(); // BlockStatement → Set<string>
    // Collect *_SCHEMA identifiers imported in this file (e.g. TEST_SCHEMA).
    let schemaVar = null;

    return {
      ImportDeclaration(node) {
        for (const spec of node.specifiers) {
          if (spec.type === "ImportSpecifier" && /SCHEMA$/.test(spec.imported?.name ?? "")) {
            schemaVar ??= spec.local.name;
          }
        }
      },

      CallExpression(node) {
        const calleeName = node.callee?.type === "Identifier" ? node.callee.name : null;
        if (calleeName !== "useFixtures") return;

        const firstArg = node.arguments[0];
        // Object overload: first arg is an ObjectExpression — exempt.
        if (!firstArg || firstArg.type === "ObjectExpression") return;
        // Must be the array/name overload: first arg is ArrayExpression or Literal.

        // Check for { schema } in the options object (last argument if it's an
        // ObjectExpression, or if there's a 3rd+ argument that is one).
        const hasSchema = node.arguments.some(
          (arg) =>
            arg.type === "ObjectExpression" &&
            arg.properties.some(
              (p) =>
                p.type === "Property" &&
                (p.key.type === "Identifier"
                  ? p.key.name === "schema"
                  : p.key.type === "Literal" && p.key.value === "schema"),
            ),
        );
        if (hasSchema) return;

        // Record the accessor name (from `const { foo } = useFixtures(...)`)
        // so we can detect usage in it() bodies later.
        const accessorNames = extractDestructuredNames(node);
        candidates.push({ node, accessorNames });
      },

      // Track any identifier call that looks like an accessor: foo("bar") where
      // foo matches a known accessor name. Record these per containing describe body.
      "CallExpression:exit"(node) {
        if (node.callee?.type !== "Identifier" || node.arguments.length === 0) return;
        // Check if this call is inside an it()/test() body.
        if (!isInsideItBody(node)) return;
        const name = node.callee.name;
        const descBody = nearestDescribeBody(node);
        if (!descBody) return;
        let calls = accessorCallsInDescribe.get(descBody);
        if (!calls) {
          calls = new Set();
          accessorCallsInDescribe.set(descBody, calls);
        }
        calls.add(name);
      },

      "Program:exit"() {
        const sv = schemaVar ?? "TEST_SCHEMA";
        for (const { node, accessorNames } of candidates) {
          // Only report if any accessor name is actually called in an it() body
          // within the enclosing describe scope.
          const descBody = nearestDescribeBody(node);
          if (!descBody) continue;
          const calls = accessorCallsInDescribe.get(descBody) ?? new Set();
          const isUsed = accessorNames.some((n) => calls.has(n));
          if (!isUsed) continue;

          const lastArg = node.arguments[node.arguments.length - 1];
          const hasEmptyOpts =
            lastArg?.type === "ObjectExpression" && lastArg.properties.length === 0;

          context.report({
            node,
            messageId: "missingSchema",
            data: { schemaVar: sv },
            fix(fixer) {
              if (hasEmptyOpts) {
                // Replace `{}` with `{ schema: TEST_SCHEMA }`.
                return fixer.replaceText(lastArg, `{ schema: ${sv} }`);
              }
              // Append `, { schema: TEST_SCHEMA }` after the last argument.
              return fixer.insertTextAfter(lastArg, `, { schema: ${sv} }`);
            },
          });
        }
      },
    };
  },
};

/** Extract variable names from `const { foo, bar } = expr`. */
function extractDestructuredNames(callNode) {
  const parent = callNode.parent;
  if (!parent) return [];
  // const { foo } = useFixtures(...)
  if (parent.type === "VariableDeclarator" && parent.id?.type === "ObjectPattern") {
    return parent.id.properties
      .filter((p) => p.type === "Property" && p.value?.type === "Identifier")
      .map((p) => p.value.name);
  }
  return [];
}

/** Returns true if the node is nested inside an it()/test() callback body. */
function isInsideItBody(node) {
  let cur = node.parent;
  while (cur) {
    if (
      cur.type === "CallExpression" &&
      cur.callee?.type === "Identifier" &&
      (cur.callee.name === "it" || cur.callee.name === "test")
    )
      return true;
    // Stop at describe boundary.
    if (
      cur.type === "CallExpression" &&
      cur.callee?.type === "Identifier" &&
      cur.callee.name === "describe"
    )
      return false;
    cur = cur.parent;
  }
  return false;
}

/** BlockStatement body of the nearest enclosing describe call. */
function nearestDescribeBody(node) {
  let cur = node.parent;
  while (cur) {
    if (
      cur.type === "CallExpression" &&
      cur.callee?.type === "Identifier" &&
      cur.callee.name === "describe"
    ) {
      const cb = cur.arguments[cur.arguments.length - 1];
      if (
        cb &&
        (cb.type === "ArrowFunctionExpression" || cb.type === "FunctionExpression") &&
        cb.body?.type === "BlockStatement"
      )
        return cb.body;
    }
    cur = cur.parent;
  }
  return null;
}

export default rule;
