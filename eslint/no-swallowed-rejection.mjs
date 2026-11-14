/**
 * ESLint rule: no-swallowed-rejection (RFC 0234 § Design 1)
 *
 * Reports `.catch(fn)` and `.then(onFulfilled, fn)` where `fn` has an empty
 * body or only returns a literal (`() => {}`, `() => undefined`,
 * `() => null`), unless the chain is awaited or returned. An awaited
 * `await p.catch(() => null)` is Ruby's `rescue nil`; the same handler on an
 * unawaited promise silences the rejection and loses the ordering, whether the
 * call is a statement, a `void` operand or stored for later.
 *
 * Hard rules: no node:* imports, no process.* references.
 */

function isLiteralValue(node) {
  if (node.type === "Literal" || node.type === "TemplateLiteral") {
    return node.type === "Literal" || node.expressions.length === 0;
  }
  if (node.type === "Identifier") return node.name === "undefined";
  if (node.type === "UnaryExpression")
    return node.operator === "void" && isLiteralValue(node.argument);
  return false;
}

/** Whether `fn` is a handler that discards the rejection: empty, or only returning a literal. */
function isEmptyHandler(fn) {
  if (fn?.type !== "ArrowFunctionExpression" && fn?.type !== "FunctionExpression") return false;
  if (fn.body.type !== "BlockStatement") return isLiteralValue(fn.body);
  const { body } = fn.body;
  if (body.length === 0) return true;
  return (
    body.length === 1 &&
    body[0].type === "ReturnStatement" &&
    (body[0].argument === null || isLiteralValue(body[0].argument))
  );
}

function rejectionHandler(call) {
  const callee = call.callee;
  if (callee.type !== "MemberExpression" || callee.computed) return null;
  if (callee.property.name === "catch") return call.arguments[0];
  if (callee.property.name === "then") return call.arguments[1];
  return null;
}

const WRAPPERS = new Set([
  "ChainExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
]);

/** Whether the chain `call` belongs to is the operand of `await` or `return`. */
function isAwaitedOrReturned(call) {
  let node = call;
  for (;;) {
    const parent = node.parent;
    if (WRAPPERS.has(parent.type)) node = parent;
    else if (parent.type === "MemberExpression" && parent.object === node) node = parent.parent;
    else break;
    if (node.type !== "CallExpression" && !WRAPPERS.has(node.type)) return false;
  }
  const parent = node.parent;
  if (parent.type === "AwaitExpression" || parent.type === "ReturnStatement") return true;
  return parent.type === "ArrowFunctionExpression" && parent.body === node;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Ban an unawaited empty rejection handler (`p.catch(() => {})`) (RFC 0234)",
    },
    messages: {
      swallowed:
        "An empty rejection handler on an unawaited promise drops the error and the ordering. Await the chain (`await p.catch(() => null)` is Ruby's `rescue nil`), or await the promise itself (RFC 0234)",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isEmptyHandler(rejectionHandler(node))) return;
        if (isAwaitedOrReturned(node)) return;
        context.report({ node, messageId: "swallowed" });
      },
    };
  },
};
