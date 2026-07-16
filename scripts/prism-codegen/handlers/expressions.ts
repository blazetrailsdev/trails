/**
 * Expression handlers: calls (incl. operator-method calls), variable / ivar /
 * cvar / global / constant reads and writes, self, and the boolean/assignment
 * operators Ruby models as their own node kinds.
 */
import type { Emitter, PrismNode } from "../types.js";
import type { Registry } from "../registry.js";
import { methodName } from "../naming.js";

/** Ruby operator methods that render as JS infix binary operators. */
const INFIX: Record<string, string> = {
  "+": "+",
  "-": "-",
  "*": "*",
  "/": "/",
  "%": "%",
  "**": "**",
  "==": "===",
  "===": "===",
  "!=": "!==",
  "<": "<",
  ">": ">",
  "<=": "<=",
  ">=": ">=",
  "<=>": "<=>",
  "&": "&",
  "|": "|",
  "^": "^",
  ">>": ">>",
};

export function registerExpressions(r: Registry): void {
  r.on("CallNode", (n, e) => emitCall(n, e));

  r.on("SelfNode", () => "this");
  r.on("LocalVariableReadNode", (n) => String(n.name));
  r.on("ConstantReadNode", (n) => String(n.name));
  r.on("InstanceVariableReadNode", (n) => "this." + ivar(n.name));
  r.on("ClassVariableReadNode", (n) => "this.constructor." + ivar(n.name));
  r.on("GlobalVariableReadNode", (n) => "globalThis." + ivar(n.name));
  r.on("ConstantPathNode", (n, e) => {
    const parent = n.parent ? e.emit(n.parent as PrismNode) + "." : "";
    return parent + String(n.name);
  });

  r.on("LocalVariableWriteNode", (n, e) => `${n.name} = ${e.emit(n.value as PrismNode)}`);
  r.on(
    "InstanceVariableWriteNode",
    (n, e) => `this.${ivar(n.name)} = ${e.emit(n.value as PrismNode)}`,
  );
  r.on(
    "ClassVariableWriteNode",
    (n, e) => `this.constructor.${ivar(n.name)} = ${e.emit(n.value as PrismNode)}`,
  );
  r.on("ConstantWriteNode", (n, e) => `const ${n.name} = ${e.emit(n.value as PrismNode)}`);
  r.on(
    "GlobalVariableWriteNode",
    (n, e) => `globalThis.${ivar(n.name)} = ${e.emit(n.value as PrismNode)}`,
  );
  r.on("MultiWriteNode", (n, e) => {
    const lhs = ((n.lefts as PrismNode[]) ?? []).map((l) => e.emit(l));
    return `[${lhs.join(", ")}] = ${e.emit(n.value as PrismNode)}`;
  });

  // Or/And-write operators map cleanly onto JS logical-assignment.
  r.on("LocalVariableOrWriteNode", (n, e) => `${n.name} ||= ${e.emit(n.value as PrismNode)}`);
  r.on("LocalVariableAndWriteNode", (n, e) => `${n.name} &&= ${e.emit(n.value as PrismNode)}`);
  r.on(
    "InstanceVariableOrWriteNode",
    (n, e) => `this.${ivar(n.name)} ||= ${e.emit(n.value as PrismNode)}`,
  );
  r.on(
    "InstanceVariableAndWriteNode",
    (n, e) => `this.${ivar(n.name)} &&= ${e.emit(n.value as PrismNode)}`,
  );

  r.on("AndNode", (n, e) => `${e.emit(n.left as PrismNode)} && ${e.emit(n.right as PrismNode)}`);
  r.on("OrNode", (n, e) => `${e.emit(n.left as PrismNode)} || ${e.emit(n.right as PrismNode)}`);

  r.on(
    "ParenthesesNode",
    (n, e) => `(${e.emitBody((n.body as PrismNode) ?? null).replace(/;$/, "")})`,
  );
}

function ivar(name: unknown): string {
  return String(name).replace(/^@+/, "").replace(/^\$/, "");
}

function args(node: PrismNode | undefined, e: Emitter): string[] {
  if (!node) return [];
  const list = (node.arguments_ as PrismNode[]) ?? [];
  return list.map((a) => e.emit(a));
}

function emitCall(n: PrismNode, e: Emitter): string {
  const name = String(n.name);
  const argv = args(n.arguments_ as PrismNode | undefined, e);
  const recv = n.receiver ? e.emit(n.receiver as PrismNode) : undefined;

  // Index read/write: a[b] / a[b] = c
  if (name === "[]") return `${recv}[${argv.join(", ")}]`;
  if (name === "[]=") return `${recv}[${argv.slice(0, -1).join(", ")}] = ${argv[argv.length - 1]}`;

  // Unary operators.
  if (name === "!") return `!${recv}`;
  if (name === "-@") return `-${recv}`;
  if (name === "+@") return `+${recv}`;

  // Binary operator methods.
  if (recv !== undefined && INFIX[name] && argv.length === 1) {
    return `${recv} ${INFIX[name]} ${argv[0]}`;
  }

  // Block: append as a trailing arrow function.
  const block = n.block ? blockToArrow(n.block as PrismNode, e) : undefined;
  const callArgs = block ? [...argv, block] : argv;

  const method = methodName(name);
  const target = recv !== undefined ? `${recv}.${method}` : method;
  // A bare identifier with no args, no receiver, no parens is a local/attr read.
  if (recv === undefined && callArgs.length === 0 && !n.block && !hasParens(n)) return method;
  // Await calls to methods the trails port declares async — but only inside an
  // async body, so we never emit a bare `await` in a sync function.
  const awaitKw = e.inAsyncMethod && e.asyncMethods.has(method) ? "await " : "";
  return `${awaitKw}${target}(${callArgs.join(", ")})`;
}

function hasParens(n: PrismNode): boolean {
  return n.openingLoc != null;
}

function blockToArrow(block: PrismNode, e: Emitter): string {
  if (block.constructor.name === "BlockArgumentNode") {
    return e.emit((block.expression as PrismNode) ?? null);
  }
  const params = block.parameters as PrismNode | undefined;
  const names = blockParamNames(params, e);
  const body = e.emitBody((block.body as PrismNode) ?? null);
  const arrow = `(${names.join(", ")}) => `;
  if (!body.includes("\n") && body.length < 60) return arrow + `${body.replace(/;$/, "")}`;
  return arrow + `{\n${e.indent(body)}\n}`;
}

function blockParamNames(params: PrismNode | undefined, e: Emitter): string[] {
  if (!params) return [];
  const inner = (params.parameters as PrismNode) ?? params;
  const reqs = (inner.requireds as PrismNode[]) ?? [];
  return reqs.map((p) => (p.name ? String(p.name) : e.emit(p)));
}
