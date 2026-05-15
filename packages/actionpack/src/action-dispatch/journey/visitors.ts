import type { Node } from "./nodes/node.js";
import { escapePath, escapeSegment } from "./router/utils.js";

// ==========================================================================
// Format — path-evaluation tree built by FormatBuilder
// ==========================================================================

type Escaper = (value: string) => string;
const ESCAPE_PATH: Escaper = (value) => escapePath(value);
const ESCAPE_SEGMENT: Escaper = (value) => escapeSegment(value);

export class Parameter {
  constructor(
    readonly name: string,
    readonly escaper: Escaper,
  ) {}

  /** Rails coerces with `.to_s` before escaping; mirror that here. */
  escape(value: unknown): string {
    return this.escaper(globalThis.String(value));
  }
}

export type FormatPart = string | Parameter | Format;

export class Format {
  private readonly _parts: FormatPart[];
  private readonly _children: number[];
  private readonly _parameters: number[];

  static requiredPath(symbol: string): Parameter {
    return new Parameter(symbol, ESCAPE_PATH);
  }

  static requiredSegment(symbol: string): Parameter {
    return new Parameter(symbol, ESCAPE_SEGMENT);
  }

  constructor(parts: FormatPart[]) {
    this._parts = parts;
    this._children = [];
    this._parameters = [];
    parts.forEach((p, i) => {
      if (p instanceof Format) this._children.push(i);
      else if (p instanceof Parameter) this._parameters.push(i);
    });
  }

  evaluate(hash: Record<string, unknown>): string {
    const parts: FormatPart[] = [...this._parts];

    for (const index of this._parameters) {
      const param = parts[index] as Parameter;
      // Guard against prototype pollution: only treat own properties as supplied
      // parameters. Without this, `toString`/`constructor` from Object.prototype
      // would satisfy a required-parameter check.
      const value = Object.hasOwn(hash, param.name) ? hash[param.name] : undefined;
      if (value == null) return "";
      parts[index] = param.escape(value);
    }

    for (const index of this._children) {
      parts[index] = (parts[index] as Format).evaluate(hash);
    }

    return parts.join("");
  }
}

// ==========================================================================
// Visitor base classes
// ==========================================================================

/**
 * Stateful tree-walking visitor. Subclasses override `visit_<TYPE>` (camelCase
 * `visit<TYPE>`) or the catch-alls `binary`/`nary`/`unary`/`terminal`.
 *
 * Rails uses a `DISPATCH_CACHE` populated by reflection; we use a static
 * dispatch table for the same effect with explicit registration.
 */
export class Visitor {
  accept(node: Node): unknown {
    return this.visit(node);
  }

  /** @internal */
  protected visit(node: Node): unknown {
    switch (node.type) {
      case "CAT":
        return this.visitCAT(node);
      case "OR":
        return this.visitOR(node);
      case "GROUP":
        return this.visitGROUP(node);
      case "STAR":
        return this.visitSTAR(node);
      case "LITERAL":
        return this.visitLITERAL(node);
      case "SYMBOL":
        return this.visitSYMBOL(node);
      case "SLASH":
        return this.visitSLASH(node);
      case "DOT":
        return this.visitDOT(node);
    }
  }

  /** @internal */
  protected binary(node: Node): unknown {
    this.visit((node as Node & { left: Node }).left);
    this.visit((node as Node & { right: Node }).right);
    return undefined;
  }

  /** @internal */
  protected nary(node: Node): unknown {
    for (const c of node.children()) this.visit(c);
    return undefined;
  }

  /** @internal */
  protected unary(node: Node): unknown {
    return this.visit((node as Node & { left: Node }).left);
  }

  /** @internal */
  protected terminal(_node: Node): unknown {
    return undefined;
  }

  /** @internal */
  protected visitCAT(n: Node): unknown {
    return this.binary(n);
  }
  /** @internal */
  protected visitOR(n: Node): unknown {
    return this.nary(n);
  }
  /** @internal */
  protected visitGROUP(n: Node): unknown {
    return this.unary(n);
  }
  /** @internal */
  protected visitSTAR(n: Node): unknown {
    return this.unary(n);
  }
  /** @internal */
  protected visitLITERAL(n: Node): unknown {
    return this.terminal(n);
  }
  /** @internal */
  protected visitSYMBOL(n: Node): unknown {
    return this.terminal(n);
  }
  /** @internal */
  protected visitSLASH(n: Node): unknown {
    return this.terminal(n);
  }
  /** @internal */
  protected visitDOT(n: Node): unknown {
    return this.terminal(n);
  }
}

/**
 * Seeded variant. Each visit takes and returns an accumulator.
 */
export class FunctionalVisitor<S = unknown> {
  accept(node: Node, seed: S): S {
    return this.visit(node, seed);
  }

  visit(node: Node, seed: S): S {
    switch (node.type) {
      case "CAT":
        return this.visitCAT(node, seed);
      case "OR":
        return this.visitOR(node, seed);
      case "GROUP":
        return this.visitGROUP(node, seed);
      case "STAR":
        return this.visitSTAR(node, seed);
      case "LITERAL":
        return this.visitLITERAL(node, seed);
      case "SYMBOL":
        return this.visitSYMBOL(node, seed);
      case "SLASH":
        return this.visitSLASH(node, seed);
      case "DOT":
        return this.visitDOT(node, seed);
    }
  }

  binary(node: Node, seed: S): S {
    const left = (node as Node & { left: Node }).left;
    const right = (node as Node & { right: Node }).right;
    return this.visit(right, this.visit(left, seed));
  }
  visitCAT(n: Node, seed: S): S {
    return this.binary(n, seed);
  }

  nary(node: Node, seed: S): S {
    let acc = seed;
    for (const c of node.children()) acc = this.visit(c, acc);
    return acc;
  }
  visitOR(n: Node, seed: S): S {
    return this.nary(n, seed);
  }

  unary(node: Node, seed: S): S {
    return this.visit((node as Node & { left: Node }).left, seed);
  }
  visitGROUP(n: Node, seed: S): S {
    return this.unary(n, seed);
  }
  visitSTAR(n: Node, seed: S): S {
    return this.unary(n, seed);
  }

  terminal(_node: Node, seed: S): S {
    return seed;
  }
  visitLITERAL(n: Node, seed: S): S {
    return this.terminal(n, seed);
  }
  visitSYMBOL(n: Node, seed: S): S {
    return this.terminal(n, seed);
  }
  visitSLASH(n: Node, seed: S): S {
    return this.terminal(n, seed);
  }
  visitDOT(n: Node, seed: S): S {
    return this.terminal(n, seed);
  }
}

// ==========================================================================
// Concrete visitors
// ==========================================================================

/**
 * Builds a Format tree (per-segment path-eval plan) from an AST.
 */
export class FormatBuilder extends Visitor {
  override accept(node: Node): Format {
    return new Format(super.accept(node) as FormatPart[]);
  }

  protected override terminal(node: Node): FormatPart[] {
    return [typeof node.left === "string" ? node.left : ""];
  }

  protected override binary(node: Node): FormatPart[] {
    return [
      ...(this.visit((node as Node & { left: Node }).left) as FormatPart[]),
      ...(this.visit((node as Node & { right: Node }).right) as FormatPart[]),
    ];
  }

  protected override visitGROUP(n: Node): FormatPart[] {
    return [new Format(this.unary(n) as FormatPart[])];
  }

  protected override visitSTAR(n: Node): FormatPart[] {
    const inner = (n as Node & { left: Node }).left;
    return [Format.requiredPath(inner.toSym())];
  }

  protected override visitSYMBOL(n: Node): FormatPart[] {
    const symbol = n.toSym();
    if (symbol === "controller") return [Format.requiredPath(symbol)];
    return [Format.requiredSegment(symbol)];
  }

  protected override visitOR(_n: Node): FormatPart[] {
    throw new Error("FormatBuilder does not support OR (alternation) nodes");
  }
}

/**
 * Walk every node, invoking `block` once per node (pre-order).
 */
export class Each extends FunctionalVisitor<(node: Node) => void> {
  static readonly INSTANCE = new Each();

  override visit(node: Node, block: (node: Node) => void): (node: Node) => void {
    block(node);
    return super.visit(node, block);
  }
}

/**
 * Serialize an AST back to its source string form.
 */
export class String extends FunctionalVisitor<string> {
  static readonly INSTANCE = new String();

  override binary(node: Node, seed: string): string {
    const left = (node as Node & { left: Node }).left;
    const right = (node as Node & { right: Node }).right;
    return this.visit(right, this.visit(left, seed));
  }

  override nary(node: Node, seed: string): string {
    const children = node.children();
    let acc = seed;
    children.forEach((c, i) => {
      acc = this.visit(c, acc);
      if (i < children.length - 1) acc += "|";
    });
    return acc;
  }

  override terminal(node: Node, seed: string): string {
    const left = node.left;
    return seed + (typeof left === "string" ? left : "");
  }

  override visitGROUP(node: Node, seed: string): string {
    return this.visit((node as Node & { left: Node }).left, seed + "(") + ")";
  }
}

/**
 * Render an AST as a Graphviz `dot` parse-tree diagram.
 */
type DotSeed = [nodes: string[], edges: string[]];

let __dotIdCounter = 1;
const __dotIds = new WeakMap<Node, number>();
function dotId(node: Node): number {
  let id = __dotIds.get(node);
  if (id === undefined) {
    id = __dotIdCounter++;
    __dotIds.set(node, id);
  }
  return id;
}

export class Dot extends FunctionalVisitor<DotSeed> {
  static readonly INSTANCE = new Dot();

  override accept(node: Node, seed: DotSeed = [[], []]): DotSeed {
    super.accept(node, seed);
    const [nodes, edges] = seed;
    return [nodes, edges];
  }

  /** Render an AST to a dot-graph string. */
  render(node: Node): string {
    const [nodes, edges] = this.accept(node);
    return `  digraph parse_tree {
    size="8,5"
    node [shape = none];
    edge [dir = none];
    ${nodes.join("\n")}
    ${edges.join("\n")}
  }
`;
  }

  override binary(node: Node, seed: DotSeed): DotSeed {
    for (const c of node.children()) {
      seed[1].push(`${dotId(node)} -> ${dotId(c)};`);
    }
    return super.binary(node, seed);
  }

  override nary(node: Node, seed: DotSeed): DotSeed {
    for (const c of node.children()) {
      seed[1].push(`${dotId(node)} -> ${dotId(c)};`);
    }
    return super.nary(node, seed);
  }

  override unary(node: Node, seed: DotSeed): DotSeed {
    seed[1].push(`${dotId(node)} -> ${dotId((node as Node & { left: Node }).left)};`);
    return super.unary(node, seed);
  }

  override visitGROUP(node: Node, seed: DotSeed): DotSeed {
    seed[0].push(`${dotId(node)} [label="()"];`);
    return super.visitGROUP(node, seed);
  }

  override visitCAT(node: Node, seed: DotSeed): DotSeed {
    seed[0].push(`${dotId(node)} [label="○"];`);
    return super.visitCAT(node, seed);
  }

  override visitSTAR(node: Node, seed: DotSeed): DotSeed {
    seed[0].push(`${dotId(node)} [label="*"];`);
    return super.visitSTAR(node, seed);
  }

  override visitOR(node: Node, seed: DotSeed): DotSeed {
    seed[0].push(`${dotId(node)} [label="|"];`);
    return super.visitOR(node, seed);
  }

  override terminal(node: Node, seed: DotSeed): DotSeed {
    const value = typeof node.left === "string" ? node.left : "";
    seed[0].push(`${dotId(node)} [label="${value}"];`);
    return seed;
  }
}
