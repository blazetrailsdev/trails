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
 * Only fires when the describe scope has at least one `it()` / `test()` (including
 * `it.skip`, `it.skipIf(cond)(...)`, etc.) that calls the returned accessor
 * (e.g. `customers("david")`). Accessor calls are attributed to ALL enclosing
 * describe bodies so nested-describe usage is detected correctly.
 *
 * Autofix inserts `{ schema: <importedSchemaVar> }` only when a *_SCHEMA import
 * is found in the file; otherwise reports without a fix to avoid inserting an
 * undefined identifier.
 */

/** Recursively resolve the root base name: it / it.skip / it.skipIf(x)(...) → "it". */
function rootCalleeName(callee) {
  if (callee?.type === "Identifier") return callee.name;
  if (callee?.type === "MemberExpression") return callee.object?.name ?? null;
  if (callee?.type === "CallExpression") return rootCalleeName(callee.callee);
  return null;
}

/** All enclosing describe BlockStatement bodies from innermost to outermost. */
function allEnclosingDescribeBodies(node) {
  const bodies = [];
  let cur = node.parent;
  while (cur) {
    if (cur.type === "CallExpression" && rootCalleeName(cur.callee) === "describe") {
      const cb = cur.arguments[cur.arguments.length - 1];
      if (cb && (cb.type === "ArrowFunctionExpression" || cb.type === "FunctionExpression")) {
        if (cb.body?.type === "BlockStatement") bodies.push(cb.body);
      }
    }
    cur = cur.parent;
  }
  return bodies;
}

/** Returns true if the node is nested inside an it()/test() callback body. */
function isInsideItBody(node) {
  let cur = node.parent;
  while (cur) {
    const name = cur.type === "CallExpression" ? rootCalleeName(cur.callee) : null;
    if (name === "it" || name === "test") return true;
    if (name === "describe") return false;
    cur = cur.parent;
  }
  return false;
}

/** Extract variable names from `const { foo, bar } = expr`. */
function extractDestructuredNames(callNode) {
  const parent = callNode.parent;
  if (!parent) return [];
  if (parent.type === "VariableDeclarator" && parent.id?.type === "ObjectPattern") {
    return parent.id.properties
      .filter((p) => p.type === "Property" && p.value?.type === "Identifier")
      .map((p) => p.value.name);
  }
  return [];
}

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
      missingSchemaWithFix:
        "`useFixtures` with a fixture-name array requires `{ schema: {{schemaVar}} }`. Add it as the third argument.",
      missingSchemaNoFix:
        "`useFixtures` with a fixture-name array requires a `{ schema: <schemaVar> }` option. Import a *_SCHEMA constant and pass it.",
    },
  },
  create(context) {
    const candidates = [];
    // Maps each describe BlockStatement to the set of accessor names called in it() bodies within it.
    const accessorCallsInDescribe = new Map();
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
        if (!firstArg || firstArg.type === "ObjectExpression") return;

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

        candidates.push({ node, accessorNames: extractDestructuredNames(node) });
      },

      "CallExpression:exit"(node) {
        // Track accessor calls inside it()/test() bodies, attributed to ALL
        // enclosing describe bodies so nested-describe usage is captured.
        if (node.callee?.type !== "Identifier" || node.arguments.length === 0) return;
        if (!isInsideItBody(node)) return;
        const name = node.callee.name;
        for (const body of allEnclosingDescribeBodies(node)) {
          let calls = accessorCallsInDescribe.get(body);
          if (!calls) {
            calls = new Set();
            accessorCallsInDescribe.set(body, calls);
          }
          calls.add(name);
        }
      },

      "Program:exit"() {
        for (const { node, accessorNames } of candidates) {
          const descBodies = allEnclosingDescribeBodies(node);
          if (descBodies.length === 0) continue;

          // Check whether any accessor is called inside any enclosing describe.
          const isUsed = descBodies.some((body) => {
            const calls = accessorCallsInDescribe.get(body) ?? new Set();
            return accessorNames.some((n) => calls.has(n));
          });
          if (!isUsed) continue;

          const lastArg = node.arguments[node.arguments.length - 1];
          const hasEmptyOpts =
            lastArg?.type === "ObjectExpression" && lastArg.properties.length === 0;

          if (schemaVar) {
            const sv = schemaVar;
            context.report({
              node,
              messageId: "missingSchemaWithFix",
              data: { schemaVar: sv },
              fix(fixer) {
                if (hasEmptyOpts) return fixer.replaceText(lastArg, `{ schema: ${sv} }`);
                return fixer.insertTextAfter(lastArg, `, { schema: ${sv} }`);
              },
            });
          } else {
            context.report({ node, messageId: "missingSchemaNoFix" });
          }
        }
      },
    };
  },
};

export default rule;
