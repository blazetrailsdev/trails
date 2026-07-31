/**
 * Literal-value handlers: strings, symbols, numbers, booleans, nil, arrays,
 * hashes, ranges. Symbols become plain strings (the closest JS analogue the
 * repo uses for Ruby symbol keys/args).
 */
import ts from "typescript";
import { rubyStr, type Emitter, type PrismNode } from "../types.js";
import type { Registry } from "../registry.js";

const f = ts.factory;
const isValidIdent = (s: string) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s);

export function registerLiterals(r: Registry): void {
  r.on("StringNode", (n) => f.createStringLiteral(rubyStr(n.unescaped)));
  r.on("SymbolNode", (n) => f.createStringLiteral(rubyStr(n.unescaped)));
  r.on("IntegerNode", (n) => f.createNumericLiteral(Number(n.value)));
  r.on("FloatNode", (n) => f.createNumericLiteral(Number(n.value)));
  r.on("RationalNode", (n) => f.createNumericLiteral(Number(n.numerator ?? n.value ?? 0)));
  r.on("TrueNode", () => f.createTrue());
  r.on("FalseNode", () => f.createFalse());
  r.on("NilNode", () => f.createNull());

  r.on("InterpolatedStringNode", (n, e) => template((n.parts as PrismNode[]) ?? [], e));

  r.on("EmbeddedStatementsNode", (n, e) => {
    const body = (n.statements as PrismNode | null)?.compactChildNodes?.() ?? [];
    if (body.length !== 1) return null;
    return e.expr(body[0]);
  });

  r.on("ArrayNode", (n, e) =>
    f.createArrayLiteralExpression(((n.elements as PrismNode[]) ?? []).map((el) => e.expr(el))),
  );

  r.onMany(["HashNode", "KeywordHashNode"], (n, e) => {
    const props: ts.ObjectLiteralElementLike[] = [];
    for (const el of (n.elements as PrismNode[]) ?? []) {
      const k = el.constructor.name;
      if (k === "AssocNode") {
        props.push(
          f.createPropertyAssignment(
            keyName(el.key as PrismNode, e),
            e.expr(el.value as PrismNode),
          ),
        );
      } else if (k === "AssocSplatNode") {
        props.push(f.createSpreadAssignment(e.expr(el.value as PrismNode)));
      } else {
        return null; // unknown pair shape — decline the whole hash
      }
    }
    return f.createObjectLiteralExpression(props, false);
  });

  // `lo..hi` — no JS range literal; a legible `range(lo, hi)` helper call the
  // repo could shim (same status as `caseEq` — a decided, documented marker).
  r.on("RangeNode", (n, e) =>
    f.createCallExpression(f.createIdentifier("range"), undefined, [
      e.expr((n.left as PrismNode) ?? null),
      e.expr((n.right as PrismNode) ?? null),
    ]),
  );
}

/** A hash key: a bare symbol becomes an identifier key when it's a valid one. */
function keyName(key: PrismNode, e: Emitter): ts.PropertyName {
  if (key && key.constructor.name === "SymbolNode") {
    const s = rubyStr(key.unescaped);
    return isValidIdent(s) ? f.createIdentifier(s) : f.createStringLiteral(s);
  }
  return f.createComputedPropertyName(e.expr(key));
}

function template(parts: PrismNode[], e: Emitter): ts.Expression {
  // Fold parts into a template literal: strings are quasis, embedded
  // statements are ${...} spans (consecutive strings merge into one quasi).
  let head = "";
  const spans: { expr: ts.Expression; lit: string }[] = [];
  for (const p of parts) {
    if (p.constructor.name === "StringNode") {
      const text = rubyStr(p.unescaped);
      if (spans.length) spans[spans.length - 1].lit += text;
      else head += text;
    } else {
      spans.push({ expr: e.expr(p), lit: "" });
    }
  }
  if (!spans.length) return f.createStringLiteral(head);
  // The printer emits synthesized template text VERBATIM (no escaping), so the
  // raw text must be provided explicitly with backslash/backtick/`${` escaped —
  // otherwise a Ruby string containing them prints as unparseable output.
  return f.createTemplateExpression(
    f.createTemplateHead(head, rawTemplateText(head)),
    spans.map((s, i) =>
      f.createTemplateSpan(
        s.expr,
        i === spans.length - 1
          ? f.createTemplateTail(s.lit, rawTemplateText(s.lit))
          : f.createTemplateMiddle(s.lit, rawTemplateText(s.lit)),
      ),
    ),
  );
}

function rawTemplateText(cooked: string): string {
  return cooked
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${")
    .replace(/\r/g, "\\r");
}
