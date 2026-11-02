/**
 * Prefilters for the upstream `no-floating-promises` and `no-misused-promises`
 * rules, which take most of the lint job's rule time. Each wraps one upstream
 * listener and skips it only for a node it can show the rule would not report,
 * so the findings stay upstream's. The saving is that the checker never
 * resolves a call nothing else asks about: overload resolution and contextual
 * typing of the arguments are the bulk of both rules' cost.
 */
import ts from "typescript-5";

const NEVER_THENABLE =
  ts.TypeFlags.Void |
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Null |
  ts.TypeFlags.Never |
  ts.TypeFlags.BooleanLike |
  ts.TypeFlags.StringLike |
  ts.TypeFlags.NumberLike |
  ts.TypeFlags.BigIntLike |
  ts.TypeFlags.ESSymbolLike;

const NON_FUNCTION_ARGUMENT = new Set([
  "ArrayExpression",
  "Literal",
  "ObjectExpression",
  "TemplateLiteral",
]);
function isNeverThenable(type) {
  if (type.flags & NEVER_THENABLE) return true;
  return type.isUnion() && type.types.every(isNeverThenable);
}
function everySignatureReturns(signatures, predicate) {
  return signatures.length > 0 && signatures.every((sig) => predicate(sig.getReturnType()));
}

function callCannotFloat(node, services, checker) {
  const awaited = node.type === "AwaitExpression";
  const call = awaited ? node.argument : node;
  if (call.type !== "CallExpression") return false;
  const signatures = services.getTypeAtLocation(call.callee).getCallSignatures();
  return everySignatureReturns(signatures, (type) => {
    if (!awaited) return isNeverThenable(type);
    const result = checker.getAwaitedType(type);
    return result !== undefined && isNeverThenable(result);
  });
}

const prefiltered = new WeakSet();

function withListeners(rule, wrap) {
  if (prefiltered.has(rule)) return rule;
  const wrappedRule = {
    ...rule,
    create(context) {
      return wrap(rule.create(context), context);
    },
  };
  prefiltered.add(wrappedRule);
  return wrappedRule;
}

/** `ExpressionStatement` reports a Promise or an array of them, so an assignment or a call answering neither is skipped. */
export function prefilterNoFloatingPromises(rule) {
  return withListeners(rule, (listeners, context) => {
    const services = context.sourceCode.parserServices;
    const checker = services.program.getTypeChecker();
    const { ExpressionStatement: upstream } = listeners;
    return {
      ...listeners,
      ExpressionStatement(node) {
        const { expression } = node;
        if (expression.type === "AssignmentExpression") return;
        if (callCannotFloat(expression, services, checker)) return;
        upstream(node);
      },
    };
  });
}

function argumentMayReturnThenable(argument, services, checker) {
  if (NON_FUNCTION_ARGUMENT.has(argument.type)) return false;
  const type = checker.getApparentType(services.getTypeAtLocation(argument));
  const parts = type.isUnion() ? type.types : [type];
  return parts.some((part) => {
    const signatures = part.getCallSignatures();
    return signatures.length > 0 && !everySignatureReturns(signatures, isNeverThenable);
  });
}

/**
 * `checkArguments` reports an argument only if its own type returns a thenable,
 * and works out which parameters want a void callback first, walking every
 * signature of the callee. The argument test is far cheaper, so it goes first.
 */
export function prefilterNoMisusedPromises(rule) {
  return withListeners(rule, (listeners, context) => {
    const services = context.sourceCode.parserServices;
    const checker = services.program.getTypeChecker();
    const wrapped = { ...listeners };
    for (const key of ["CallExpression", "NewExpression"]) {
      const upstream = listeners[key];
      if (upstream === undefined) continue;
      wrapped[key] = (node) => {
        if (node.arguments.some((arg) => argumentMayReturnThenable(arg, services, checker))) {
          upstream(node);
        }
      };
    }
    return wrapped;
  });
}
