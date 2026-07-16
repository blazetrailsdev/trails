/**
 * Structural handlers: program, statements, module, class, and method
 * definitions. Modules flatten to a `// module X` comment plus their unwrapped
 * body (the file is the namespace); module-level `def`s become exported
 * functions (the repo's mixin-as-function runtime shape, TS types dropped),
 * while `def`s inside a `class` become method syntax.
 */
import type { Emitter, PrismNode } from "../types.js";
import type { Registry } from "../registry.js";
import { methodName } from "../naming.js";

export function registerStructure(r: Registry): void {
  r.on("ProgramNode", (n, e) => e.emitBody((n.statements as PrismNode) ?? null));

  r.on("StatementsNode", (n, e) => e.emitBody(n));

  r.on("ModuleNode", (n, e) => {
    const name = constName(n.constantPath as PrismNode, n.name, e);
    const body = e.emitBody((n.body as PrismNode) ?? null);
    return `// module ${name}\n${body}`;
  });

  r.on("ClassNode", (n, e) => {
    const name = constName(n.constantPath as PrismNode, n.name, e);
    const sup = n.superclass ? ` extends ${e.emit(n.superclass as PrismNode)}` : "";
    const prev = e.inClass;
    e.inClass = true;
    const body = e.emitBody((n.body as PrismNode) ?? null);
    e.inClass = prev;
    return `export class ${name}${sup} {\n${e.indent(body)}\n}`;
  });

  r.on("SingletonClassNode", (n, e) => {
    // `class << self` — static block. Emit body with a marker.
    const body = e.emitBody((n.body as PrismNode) ?? null);
    return `// class << self (static members)\n${body}`;
  });

  r.on("DefNode", (n, e) => emitDef(n, e));
}

function emitDef(n: PrismNode, e: Emitter): string {
  const isStatic = n.receiver != null && (n.receiver as PrismNode).constructor.name === "SelfNode";
  const name = n.name === "initialize" ? "constructor" : methodName(String(n.name));
  const params = emitParams(n.parameters as PrismNode | undefined, e);
  const body = e.emitBody((n.body as PrismNode) ?? null);
  const block = body ? `{\n${e.indent(body)}\n}` : `{}`;

  if (e.inClass) {
    const prefix = isStatic ? "static " : "";
    return `${prefix}${name}(${params}) ${block}`;
  }
  // Module-level: exported free function (mixin runtime shape).
  return `export function ${name}(${params}) ${block}`;
}

/**
 * Render a Ruby parameter list to JS: positionals, optionals-with-defaults,
 * `*rest` → `...rest`, keyword args collapsed to a destructured `{ ... }`
 * object param, and a trailing `&block` kept as a plain `block` param.
 */
function emitParams(params: PrismNode | undefined, e: Emitter): string {
  if (!params) return "";
  const out: string[] = [];
  for (const p of (params.requireds as PrismNode[]) ?? []) out.push(String(p.name ?? e.emit(p)));
  for (const p of (params.optionals as PrismNode[]) ?? []) {
    out.push(`${p.name} = ${e.emit((p.value as PrismNode) ?? null)}`);
  }
  if (params.rest) {
    const rn = (params.rest as PrismNode).name;
    out.push("..." + (rn ? String(rn) : "rest"));
  }
  const kw = (params.keywords as PrismNode[]) ?? [];
  if (kw.length || params.keywordRest) {
    const keys = kw.map((k) => {
      const kn = String(k.name).replace(/:$/, "");
      return k.value ? `${kn} = ${e.emit(k.value as PrismNode)}` : kn;
    });
    if (params.keywordRest) keys.push("...opts");
    out.push(`{ ${keys.join(", ")} }`);
  }
  if (params.block) {
    const bn = (params.block as PrismNode).name;
    out.push(bn ? String(bn) : "block");
  }
  return out.join(", ");
}

function constName(path: PrismNode | undefined, name: unknown, e: Emitter): string {
  if (path && path.constructor.name === "ConstantPathNode") return e.emit(path);
  return String(name ?? (path ? e.emit(path) : "Anon"));
}
