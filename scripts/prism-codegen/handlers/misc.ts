/**
 * Handlers for the long tail that dominated the passthrough bucket in the first
 * coverage run: splats, `super`, compound-assignment operators, multi-assign
 * targets, `defined?`, regexes, and `alias`. Each is a small, self-contained
 * registration — the point of the registry is that adding these needed no
 * change to any dispatch site.
 */
import { rubyStr, type Emitter, type PrismNode } from "../types.js";
import type { Registry } from "../registry.js";
import { methodName } from "../naming.js";

export function registerMisc(r: Registry): void {
  r.on("SplatNode", (n, e) => "..." + e.emit((n.expression as PrismNode) ?? null));

  r.on("ForwardingSuperNode", () => "super(...arguments)");
  r.on("SuperNode", (n, e) => {
    const a = ((n.arguments_ as PrismNode)?.arguments_ as PrismNode[]) ?? [];
    return `super(${a.map((x) => e.emit(x)).join(", ")})`;
  });

  // Compound assignment: `x += 1`, `a.b -= 2`, `arr[i] *= 3`.
  r.on("LocalVariableOperatorWriteNode", (n, e) => {
    return `${n.name} ${op(n.binaryOperator)}= ${e.emit(n.value as PrismNode)}`;
  });
  r.on("InstanceVariableOperatorWriteNode", (n, e) => {
    return `this.${ivar(n.name)} ${op(n.binaryOperator)}= ${e.emit(n.value as PrismNode)}`;
  });
  r.on("CallOperatorWriteNode", (n, e) => {
    const recv = n.receiver ? e.emit(n.receiver as PrismNode) + "." : "";
    return `${recv}${methodName(String(n.readName))} ${op(n.binaryOperator)}= ${e.emit(n.value as PrismNode)}`;
  });
  r.on("IndexOperatorWriteNode", (n, e) => {
    const recv = e.emit(n.receiver as PrismNode);
    const idx = ((n.arguments_ as PrismNode)?.arguments_ as PrismNode[]) ?? [];
    return `${recv}[${idx.map((x) => e.emit(x)).join(", ")}] ${op(n.binaryOperator)}= ${e.emit(n.value as PrismNode)}`;
  });
  r.on("IndexOrWriteNode", (n, e) => {
    const recv = e.emit(n.receiver as PrismNode);
    const idx = ((n.arguments_ as PrismNode)?.arguments_ as PrismNode[]) ?? [];
    return `${recv}[${idx.map((x) => e.emit(x)).join(", ")}] ||= ${e.emit(n.value as PrismNode)}`;
  });

  // Multi-assign targets: `a, b = ...`.
  r.onMany(["LocalVariableTargetNode", "ConstantTargetNode"], (n) => String(n.name));
  r.on("InstanceVariableTargetNode", (n) => "this." + ivar(n.name));
  r.on(
    "CallTargetNode",
    (n, e) => `${e.emit(n.receiver as PrismNode)}.${methodName(String(n.name))}`,
  );
  r.on("IndexTargetNode", (n, e) => {
    const idx = ((n.arguments_ as PrismNode)?.arguments_ as PrismNode[]) ?? [];
    return `${e.emit(n.receiver as PrismNode)}[${idx.map((x) => e.emit(x)).join(", ")}]`;
  });
  r.on("MultiTargetNode", (n, e) => {
    const lefts = ((n.lefts as PrismNode[]) ?? []).map((l) => e.emit(l));
    return `[${lefts.join(", ")}]`;
  });

  r.on("DefinedNode", (n, e) => `(typeof (${e.emit(n.value as PrismNode)}) !== "undefined")`);

  r.on("RegularExpressionNode", (n) => {
    const body = rubyStr(n.unescaped).replace(/\//g, "\\/");
    return `/${body}/`;
  });

  // `alias new old` / `alias_method` — no direct JS statement; emit a legible
  // assignment marker the mixin layer would realize.
  r.on("AliasMethodNode", (n, e) => {
    const nn = symName(n.newName as PrismNode, e);
    const on = symName(n.oldName as PrismNode, e);
    return `/* alias */ const ${nn} = ${on}`;
  });
}

function op(binaryOperator: unknown): string {
  const s = String(binaryOperator ?? "+");
  return s === "==" ? "=" : s;
}

function ivar(name: unknown): string {
  return String(name).replace(/^@+/, "");
}

function symName(node: PrismNode, e: Emitter): string {
  if (node && node.constructor.name === "SymbolNode") return methodName(rubyStr(node.unescaped));
  return e.emit(node);
}
