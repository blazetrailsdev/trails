/**
 * ESLint rule: constructor-creates-no-promise (RFC 0234 § Design 2)
 *
 * A constructor never creates a promise. Inside a `constructor` body it reports
 * a call or `new` whose type is thenable (dropped, voided, stored or chained),
 * any `.then` / `.catch` / `.finally`, and an `async` IIFE. Where Rails'
 * `initialize` does work that is async in JS, the class takes a `protected`
 * constructor and a `static async new`, so a class declaring `static async new`
 * beside a public constructor is reported too.
 *
 * ruby-compat's `new Thread(...)` owns its promise and is not reported; a
 * `value()` or `join()` read off it inside the constructor is.
 *
 * Hard rules: no node:* imports, no process.* references.
 */

const CHAINS = new Set(["then", "catch", "finally"]);

function isFunction(node) {
  return (
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionDeclaration"
  );
}

/** Whether `node`'s nearest enclosing function is a class constructor. */
function inConstructor(node) {
  let current = node.parent;
  while (current && !isFunction(current)) current = current.parent;
  return current?.parent?.type === "MethodDefinition" && current.parent.kind === "constructor";
}

function isThenable(type, checker) {
  const parts = type.isUnion() ? type.types : [type];
  return parts.some((part) => {
    const then = part.getProperty("then");
    if (then === undefined) return false;
    return checker.getTypeOfSymbol(then).getCallSignatures().length > 0;
  });
}

function isThread(node) {
  return node.callee.type === "Identifier" && node.callee.name === "Thread";
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow creating a promise in a constructor; async `initialize` work goes in an awaited `static async new`.",
    },
    schema: [],
    messages: {
      promise:
        "A constructor creates no promise. Move the async part of `initialize` into `static async new` behind a `protected` constructor (RFC 0234).",
      chain:
        "A constructor attaches no `.{{name}}`. Move the async part of `initialize` into `static async new` behind a `protected` constructor (RFC 0234).",
      asyncIife:
        "A constructor starts no `async` IIFE. Move the async part of `initialize` into `static async new` behind a `protected` constructor (RFC 0234).",
      publicConstructor:
        "A class declaring `static async new` keeps its constructor `protected` or `private`, so every caller writes `await Klass.new(...)` (RFC 0234).",
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    const checker = services.program.getTypeChecker();
    const thenable = (node) => isThenable(services.getTypeAtLocation(node), checker);
    return {
      CallExpression(node) {
        if (!inConstructor(node)) return;
        const { callee } = node;
        if (
          (callee.type === "ArrowFunctionExpression" || callee.type === "FunctionExpression") &&
          callee.async
        ) {
          context.report({ node, messageId: "asyncIife" });
        } else if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.property.type === "Identifier" &&
          CHAINS.has(callee.property.name)
        ) {
          context.report({ node, messageId: "chain", data: { name: callee.property.name } });
        } else if (thenable(node)) {
          context.report({ node, messageId: "promise" });
        }
      },
      NewExpression(node) {
        if (!inConstructor(node) || isThread(node)) return;
        if (thenable(node)) context.report({ node, messageId: "promise" });
      },
      ClassBody(node) {
        const staticNew = node.body.find(
          (member) =>
            member.type === "MethodDefinition" &&
            member.static &&
            member.key.type === "Identifier" &&
            member.key.name === "new" &&
            member.value.async,
        );
        if (staticNew === undefined) return;
        const ctor = node.body.find(
          (member) => member.type === "MethodDefinition" && member.kind === "constructor",
        );
        if (ctor?.accessibility === "protected" || ctor?.accessibility === "private") return;
        context.report({ node: ctor ?? staticNew, messageId: "publicConstructor" });
      },
    };
  },
};

export default rule;
