/**
 * ESLint rule: no-floating-maybe-promise (RFC 0234 § Design 1)
 *
 * Reports a dropped or voided expression whose type has a thenable union
 * member that upstream `no-floating-promises` skips: upstream reports a type
 * only where a member is the built-in `Promise` (it leaves `checkThenables`
 * off), so `PromiseLike<void> | void` floats unreported. A type with a
 * built-in `Promise` member is upstream's finding and is not reported twice.
 * Like upstream with `ignoreVoid: false`, it reads an expression statement or
 * its `void` operand; the call is the only form the seeded sites take.
 *
 * Hard rules: no node:* imports, no process.* references.
 */

function constituents(type) {
  return type.isUnion() ? type.types : [type];
}

function isBuiltinPromise(program, type) {
  const symbol = type.getSymbol();
  if (symbol?.getName() !== "Promise") return false;
  return (symbol.getDeclarations() ?? []).some((decl) =>
    program.isSourceFileDefaultLibrary(decl.getSourceFile()),
  );
}

function isThenable(checker, type, tsNode) {
  const then = type.getProperty("then");
  if (then === undefined) return false;
  return checker.getTypeOfSymbolAtLocation(then, tsNode).getCallSignatures().length > 0;
}

export default {
  meta: {
    type: "problem",
    docs: { description: "Disallow a dropped or voided maybe-promise (`PromiseLike<T> | T`)." },
    schema: [],
    messages: {
      maybePromise:
        "This expression may be a thenable and is neither awaited nor returned (RFC 0234).",
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    const checker = services.program.getTypeChecker();
    return {
      ExpressionStatement(node) {
        let { expression } = node;
        if (expression.type === "UnaryExpression" && expression.operator === "void") {
          expression = expression.argument;
        }
        if (expression.type === "ChainExpression") expression = expression.expression;
        if (expression.type !== "CallExpression") return;
        const tsNode = services.esTreeNodeToTSNodeMap.get(expression);
        const parts = constituents(checker.getApparentType(checker.getTypeAtLocation(tsNode)));
        if (parts.some((part) => isBuiltinPromise(services.program, part))) return;
        if (parts.some((part) => isThenable(checker, part, tsNode))) {
          context.report({ node, messageId: "maybePromise" });
        }
      },
    };
  },
};
