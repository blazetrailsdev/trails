/**
 * Literal-value handlers: strings, symbols, numbers, booleans, nil, arrays,
 * hashes, ranges. Symbols become plain strings (the closest JS analogue the
 * repo uses for Ruby symbol keys/args).
 */
import { rubyStr, type PrismNode } from "../types.js";
import type { Registry } from "../registry.js";

export function registerLiterals(r: Registry): void {
  r.on("StringNode", (n) => JSON.stringify(rubyStr(n.unescaped)));
  r.on("SymbolNode", (n) => JSON.stringify(rubyStr(n.unescaped)));
  r.on("IntegerNode", (n) => String(n.value));
  r.on("FloatNode", (n) => String(n.value));
  r.on("RationalNode", (n) => String(n.numerator ?? n.value ?? 0));
  r.on("TrueNode", () => "true");
  r.on("FalseNode", () => "false");
  r.onMany(["NilNode"], () => "null");

  r.on("InterpolatedStringNode", (n, e) => {
    const parts = (n.parts as PrismNode[]) ?? [];
    const chunks = parts.map((p) => {
      if (p.constructor.name === "StringNode") return escapeTemplate(rubyStr(p.unescaped));
      if (p.constructor.name === "EmbeddedStatementsNode") {
        return "${" + e.emit((p.statements as PrismNode) ?? null).replace(/;$/, "") + "}";
      }
      return "${" + e.emit(p) + "}";
    });
    return "`" + chunks.join("") + "`";
  });

  r.on("EmbeddedStatementsNode", (n, e) => e.emit((n.statements as PrismNode) ?? null));

  r.on("ArrayNode", (n, e) => {
    const els = ((n.elements as PrismNode[]) ?? []).map((el) => e.emit(el));
    return "[" + els.join(", ") + "]";
  });

  r.onMany(["HashNode", "KeywordHashNode"], (n, e) => {
    const els = ((n.elements as PrismNode[]) ?? []).map((el) => e.emit(el));
    return "{ " + els.join(", ") + " }";
  });

  r.on("AssocNode", (n, e) => {
    const key = keyName(n.key as PrismNode, e);
    return `${key}: ${e.emit((n.value as PrismNode) ?? null)}`;
  });

  r.on("AssocSplatNode", (n, e) => "..." + e.emit((n.value as PrismNode) ?? null));

  r.on("RangeNode", (n, e) => {
    // No JS range literal; emit a legible marker call the repo could shim.
    const lo = e.emit((n.left as PrismNode) ?? null);
    const hi = e.emit((n.right as PrismNode) ?? null);
    return `range(${lo}, ${hi})`;
  });
}

/** A hash key: a bare symbol becomes an identifier key when it's a valid one. */
function keyName(key: PrismNode, e: import("../types.js").Emitter): string {
  if (key && key.constructor.name === "SymbolNode") {
    const s = rubyStr(key.unescaped);
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s) ? s : JSON.stringify(s);
  }
  return "[" + e.emit(key) + "]";
}

function escapeTemplate(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}
