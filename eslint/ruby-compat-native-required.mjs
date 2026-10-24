/**
 * ESLint rule: ruby-compat-native-required (RFC 0194)
 *
 * A listed `@blazetrails/ruby-compat` helper called on an Array/tuple, a
 * `string`, a `number` or a plain object is reported: there the native form
 * is the same operation, and the owner ruled it required, not merely credited
 * (2026-10-19). `no-ruby-compat-reimplementation` polices the reverse, a local
 * copy of a helper.
 *
 * The receiver is argument 1, read through the type checker. The call is left
 * alone when any constituent of that type is `unknown` / `any`, a `Map`,
 * `Set`, `Hash`, `Range`, a class instance, or a type answering the helper's
 * dispatching member, because there the helper dispatches and the form does
 * not. With no type information the rule reports nothing.
 *
 * A row's `maxArgs` keeps a call passing more (a conflict or miss block) on
 * the helper, and `void` reports only a call whose value nothing reads, since
 * `delete` answers a boolean and a `for…of` answers nothing.
 *
 * The listed set is `ruby-compat-native-required.json`, only-grow: a
 * substitution sweep adds its helpers in the same PR. A site that must keep
 * the helper takes an `eslint-disable-next-line` naming the dispatching
 * receiver or the semantic difference; there is no exclude file.
 */
import { readFileSync } from "node:fs";
import ts from "typescript-5";

export const NATIVE_REQUIRED = JSON.parse(
  readFileSync(new URL("./ruby-compat-native-required.json", import.meta.url), "utf8"),
);

const DISPATCHING = new Set([
  "Map",
  "ReadonlyMap",
  "WeakMap",
  "Set",
  "ReadonlySet",
  "WeakSet",
  "Hash",
  "Range",
]);

function isRubyCompatSource(source) {
  return source === "@blazetrails/ruby-compat" || source.startsWith("@blazetrails/ruby-compat/");
}

/** "array" | "string" | "number" | "object" | "null", or undefined for a
 *  constituent the helper may dispatch on. */
function nativeKind(checker, program, type, member) {
  const f = type.flags;
  if (f & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter)) return undefined;
  if (f & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) return "null";
  if (f & ts.TypeFlags.StringLike) return "string";
  if (f & ts.TypeFlags.NumberLike) return "number";
  if (checker.isArrayType(type) || checker.isTupleType(type)) return "array";
  if (!(f & ts.TypeFlags.Object) || f & ts.TypeFlags.NonPrimitive) return undefined;
  if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) {
    return undefined;
  }
  if (type.getProperty(member) !== undefined) return undefined;
  const symbol = type.aliasSymbol === undefined ? type.getSymbol() : undefined;
  if (symbol !== undefined && DISPATCHING.has(symbol.getName())) return undefined;
  const anonymous = symbol === undefined || symbol.getName().startsWith("__");
  for (const decl of symbol?.getDeclarations() ?? []) {
    if (ts.isClassLike(decl)) return undefined;
    if (!anonymous && program.isSourceFileDefaultLibrary(decl.getSourceFile())) return undefined;
  }
  return "object";
}

function receiverIsNative(services, node, member) {
  const program = services.program;
  const checker = program.getTypeChecker();
  const tsNode = services.esTreeNodeToTSNodeMap.get(node);
  if (tsNode === undefined) return false;
  const type = checker.getTypeAtLocation(tsNode);
  const parts = type.isUnion() ? type.types : [type];
  console.error(
    "RCNR-DEBUG",
    ts.version,
    checker.typeToString(type),
    type.flags,
    ts.getObjectFlags(type),
    type.getSymbol()?.getName(),
    type.aliasSymbol?.getName(),
    (type.getSymbol()?.getDeclarations() ?? []).map(
      (d) =>
        d.getSourceFile().fileName + ":" + program.isSourceFileDefaultLibrary(d.getSourceFile()),
    ),
    parts.map((p) => nativeKind(checker, program, p, member)),
  );
  const kinds = parts.map((part) => nativeKind(checker, program, part, member));
  return kinds.every((k) => k !== undefined) && kinds.some((k) => k !== "null");
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require the native form where a listed ruby-compat helper is called on an Array, string, number or plain object.",
    },
    schema: [],
    messages: {
      nativeRequired:
        "`{{helper}}` on a native receiver is `{{native}}` (RFC 0194). Keep the helper only where it dispatches, with an eslint-disable-next-line naming why.",
    },
  },
  create(context) {
    const services = context.sourceCode?.parserServices ?? context.parserServices;
    if (!services?.program || !services.esTreeNodeToTSNodeMap) return {};
    const bound = new Map();
    return {
      ImportDeclaration(node) {
        if (!isRubyCompatSource(node.source.value)) return;
        for (const spec of node.specifiers) {
          if (spec.type !== "ImportSpecifier") continue;
          const imported =
            spec.imported.type === "Identifier" ? spec.imported.name : spec.imported.value;
          if (Object.hasOwn(NATIVE_REQUIRED, imported)) bound.set(spec.local.name, imported);
        }
      },
      CallExpression(node) {
        if (node.callee.type !== "Identifier") return;
        const helper = bound.get(node.callee.name);
        const receiver = node.arguments[0];
        if (helper === undefined || receiver === undefined || receiver.type === "SpreadElement") {
          return;
        }
        const entry = NATIVE_REQUIRED[helper];
        if (node.arguments.length > entry.maxArgs) return;
        if (entry.void === true && node.parent.type !== "ExpressionStatement") return;
        if (!receiverIsNative(services, receiver, entry.member)) return;
        context.report({
          node,
          messageId: "nativeRequired",
          data: { helper, native: entry.native },
        });
      },
    };
  },
};

export default rule;
