import { NotImplementedError } from "@blazetrails/ruby-compat";

import { SyntaxError } from "./syntax-error.js";

const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";

export type NodeKind =
  | "root"
  | "element"
  | "attribute"
  | "text"
  | "comment"
  | "processing-instruction";

/** @noRailsEquivalent PERMANENT */
export interface Tree<N> {
  kind(node: N): NodeKind;
  parent(node: N): N | null;
  children(node: N): N[];
  attributes(node: N): N[];
  localName(node: N): string;
  qualifiedName(node: N): string;
  namespaceUri(node: N): string | null;
  stringValue(node: N): string;
  key(node: N): unknown;
}

export type Value<N> = N[] | string | number | boolean;

/** @noRailsEquivalent PERMANENT */
export interface FunctionContext<N> {
  tree: Tree<N>;
  node: N;
  position: number;
  size: number;
}

/** @noRailsEquivalent PERMANENT */
export type XPathFunction<N> = (context: FunctionContext<N>, args: Value<N>[]) => Value<N> | null;

/** @noRailsEquivalent PERMANENT */
export interface EvaluationContext<N> {
  tree: Tree<N>;
  node: N;
  namespaces: Map<string, string>;
  variables: Map<string, Value<N>>;
  lookupFunction(name: string, namespaceUri: string | null): XPathFunction<N> | undefined;
}

type Token =
  | { type: "op"; value: string }
  | { type: "name"; value: string }
  | { type: "literal"; value: string }
  | { type: "number"; value: number }
  | { type: "var"; value: string };

type Ast =
  | { type: "binary"; op: string; left: Ast; right: Ast }
  | { type: "negate"; operand: Ast }
  | { type: "literal"; value: string }
  | { type: "number"; value: number }
  | { type: "var"; name: string }
  | { type: "call"; name: string; args: Ast[] }
  | { type: "filter"; primary: Ast; predicates: Ast[] }
  | { type: "path"; absolute: boolean; filter: Ast | null; steps: Step[] };

interface Step {
  axis: string;
  test:
    | { type: "name"; prefix: string | null; local: string }
    | { type: "node"; kind: string; literal: string | null };
  predicates: Ast[];
}

const NODE_TYPES = ["comment", "text", "processing-instruction", "node"];
const AXES = [
  "ancestor",
  "ancestor-or-self",
  "attribute",
  "child",
  "descendant",
  "descendant-or-self",
  "following",
  "following-sibling",
  "namespace",
  "parent",
  "preceding",
  "preceding-sibling",
  "self",
];

function invalid(): never {
  throw new SyntaxError("ERROR: Invalid expression");
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  const nameChar = /[\w.\-·À-￿]/u;
  const nameStart = /[A-Za-z_À-￿]/u;
  let i = 0;
  const precedingAllowsOperator = () => {
    const prev = tokens.at(-1);
    if (prev === undefined) return false;
    if (prev.type === "op") return [")", "]", ".", ".."].includes(prev.value);
    return true;
  };
  while (i < expression.length) {
    const c = expression[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const two = expression.slice(i, i + 2);
    if (["//", "::", "..", "!=", "<=", ">="].includes(two)) {
      tokens.push({ type: "op", value: two });
      i += 2;
      continue;
    }
    if (c === "." && /\d/.test(expression[i + 1] ?? "")) {
      const m = /^\.\d+/.exec(expression.slice(i))!;
      tokens.push({ type: "number", value: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if ("()[]@,|+=<>/.".includes(c)) {
      tokens.push({ type: "op", value: c });
      i++;
      continue;
    }
    if (c === "-") {
      tokens.push({ type: "op", value: c });
      i++;
      continue;
    }
    if (c === "*") {
      tokens.push(
        precedingAllowsOperator() ? { type: "op", value: "*" } : { type: "name", value: "*" },
      );
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = expression.indexOf(c, i + 1);
      if (end === -1) invalid();
      tokens.push({ type: "literal", value: expression.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (/\d/.test(c)) {
      const m = /^\d+(\.\d*)?/.exec(expression.slice(i))!;
      tokens.push({ type: "number", value: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === "$") {
      let j = i + 1;
      while (j < expression.length && (nameChar.test(expression[j]) || expression[j] === ":")) j++;
      tokens.push({ type: "var", value: expression.slice(i + 1, j) });
      i = j;
      continue;
    }
    if (nameStart.test(c)) {
      let j = i;
      while (j < expression.length && nameChar.test(expression[j])) j++;
      if (expression[j] === ":" && expression[j + 1] !== ":") {
        if (expression[j + 1] === "*") {
          j += 2;
        } else if (nameStart.test(expression[j + 1] ?? "")) {
          j++;
          while (j < expression.length && nameChar.test(expression[j])) j++;
        }
      }
      const name = expression.slice(i, j);
      if (precedingAllowsOperator() && ["and", "or", "mod", "div"].includes(name)) {
        tokens.push({ type: "op", value: name });
      } else {
        tokens.push({ type: "name", value: name });
      }
      i = j;
      continue;
    }
    invalid();
  }
  return tokens;
}

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): Ast {
    const ast = this.orExpr();
    if (this.pos < this.tokens.length) invalid();
    return ast;
  }

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.pos + offset];
  }

  private isOp(value: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t !== undefined && t.type === "op" && t.value === value;
  }

  private expectOp(value: string): void {
    if (!this.isOp(value)) invalid();
    this.pos++;
  }

  private binary(next: () => Ast, ops: string[]): Ast {
    let left = next();
    for (;;) {
      const t = this.peek();
      if (t?.type !== "op" || !ops.includes(t.value)) return left;
      this.pos++;
      left = { type: "binary", op: t.value, left, right: next() };
    }
  }

  private orExpr(): Ast {
    return this.binary(() => this.andExpr(), ["or"]);
  }

  private andExpr(): Ast {
    return this.binary(() => this.equalityExpr(), ["and"]);
  }

  private equalityExpr(): Ast {
    return this.binary(() => this.relationalExpr(), ["=", "!="]);
  }

  private relationalExpr(): Ast {
    return this.binary(() => this.additiveExpr(), ["<", ">", "<=", ">="]);
  }

  private additiveExpr(): Ast {
    return this.binary(() => this.multiplicativeExpr(), ["+", "-"]);
  }

  private multiplicativeExpr(): Ast {
    return this.binary(() => this.unaryExpr(), ["*", "div", "mod"]);
  }

  private unaryExpr(): Ast {
    if (this.isOp("-")) {
      this.pos++;
      return { type: "negate", operand: this.unaryExpr() };
    }
    return this.binary(() => this.pathExpr(), ["|"]);
  }

  private startsFilter(): boolean {
    const t = this.peek();
    if (t === undefined) return false;
    if (t.type === "literal" || t.type === "number" || t.type === "var") return true;
    if (t.type === "op") return t.value === "(";
    return (
      this.isOp("(", 1) &&
      !NODE_TYPES.includes(t.value) &&
      !(this.isOp("::", 1) && AXES.includes(t.value))
    );
  }

  private pathExpr(): Ast {
    if (this.startsFilter()) {
      const primary = this.primaryExpr();
      const predicates = this.predicates();
      const filter: Ast = predicates.length ? { type: "filter", primary, predicates } : primary;
      if (this.isOp("/") || this.isOp("//")) {
        const steps: Step[] = [];
        this.continuePath(steps);
        return { type: "path", absolute: false, filter, steps };
      }
      return filter;
    }
    const steps: Step[] = [];
    let absolute = false;
    if (this.isOp("/")) {
      this.pos++;
      absolute = true;
      if (!this.startsStep()) return { type: "path", absolute, filter: null, steps };
    } else if (this.isOp("//")) {
      this.pos++;
      absolute = true;
      steps.push(descendantOrSelfStep());
    }
    steps.push(this.step());
    this.continuePath(steps);
    return { type: "path", absolute, filter: null, steps };
  }

  private continuePath(steps: Step[]): void {
    for (;;) {
      if (this.isOp("/")) {
        this.pos++;
      } else if (this.isOp("//")) {
        this.pos++;
        steps.push(descendantOrSelfStep());
      } else {
        return;
      }
      steps.push(this.step());
    }
  }

  private startsStep(): boolean {
    const t = this.peek();
    if (t === undefined) return false;
    if (t.type === "name") return true;
    return t.type === "op" && [".", "..", "@"].includes(t.value);
  }

  private step(): Step {
    if (this.isOp(".")) {
      this.pos++;
      return { axis: "self", test: { type: "node", kind: "node", literal: null }, predicates: [] };
    }
    if (this.isOp("..")) {
      this.pos++;
      return {
        axis: "parent",
        test: { type: "node", kind: "node", literal: null },
        predicates: [],
      };
    }
    let axis = "child";
    if (this.isOp("@")) {
      this.pos++;
      axis = "attribute";
    } else {
      const t = this.peek();
      if (t?.type === "name" && this.isOp("::", 1)) {
        if (!AXES.includes(t.value)) invalid();
        axis = t.value;
        this.pos += 2;
      }
    }
    const t = this.peek();
    if (t?.type !== "name") invalid();
    this.pos++;
    let test: Step["test"];
    if (NODE_TYPES.includes(t.value) && this.isOp("(")) {
      this.pos++;
      let literal: string | null = null;
      const lit = this.peek();
      if (t.value === "processing-instruction" && lit?.type === "literal") {
        literal = lit.value;
        this.pos++;
      }
      this.expectOp(")");
      test = { type: "node", kind: t.value, literal };
    } else {
      const colon = t.value.indexOf(":");
      test =
        colon === -1
          ? { type: "name", prefix: null, local: t.value }
          : { type: "name", prefix: t.value.slice(0, colon), local: t.value.slice(colon + 1) };
    }
    return { axis, test, predicates: this.predicates() };
  }

  private predicates(): Ast[] {
    const predicates: Ast[] = [];
    while (this.isOp("[")) {
      this.pos++;
      predicates.push(this.orExpr());
      this.expectOp("]");
    }
    return predicates;
  }

  private primaryExpr(): Ast {
    const t = this.peek()!;
    this.pos++;
    if (t.type === "literal") return { type: "literal", value: t.value };
    if (t.type === "number") return { type: "number", value: t.value };
    if (t.type === "var") return { type: "var", name: t.value };
    if (t.type === "op") {
      const expr = this.orExpr();
      this.expectOp(")");
      return expr;
    }
    this.expectOp("(");
    const args: Ast[] = [];
    if (!this.isOp(")")) {
      args.push(this.orExpr());
      while (this.isOp(",")) {
        this.pos++;
        args.push(this.orExpr());
      }
    }
    this.expectOp(")");
    return { type: "call", name: t.value, args };
  }
}

function descendantOrSelfStep(): Step {
  return {
    axis: "descendant-or-self",
    test: { type: "node", kind: "node", literal: null },
    predicates: [],
  };
}

function stringToNumber(s: string): number {
  return /^\s*-?(\d+(\.\d*)?|\.\d+)\s*$/.test(s) ? Number(s) : NaN;
}

function numberToString(n: number): string {
  if (Number.isNaN(n)) return "NaN";
  if (n === Infinity) return "Infinity";
  if (n === -Infinity) return "-Infinity";
  if (Object.is(n, -0)) return "0";
  if (Number.isInteger(n)) return n.toFixed(0);
  return String(n);
}

class Evaluator<N> {
  private orderIndex: Map<unknown, number> | null = null;

  constructor(private readonly ctx: EvaluationContext<N>) {}

  get tree(): Tree<N> {
    return this.ctx.tree;
  }

  toStr(value: Value<N>): string {
    if (Array.isArray(value)) {
      return value.length === 0 ? "" : this.tree.stringValue(this.sorted(value)[0]);
    }
    if (typeof value === "number") return numberToString(value);
    if (typeof value === "boolean") return value ? "true" : "false";
    return value;
  }

  toNum(value: Value<N>): number {
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    return stringToNumber(this.toStr(value));
  }

  toBool(value: Value<N>): boolean {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
    if (typeof value === "string") return value.length > 0;
    return value;
  }

  private root(node: N): N {
    let n = node;
    for (let p = this.tree.parent(n); p !== null; p = this.tree.parent(n)) n = p;
    return n;
  }

  private order(node: N): number {
    if (this.orderIndex === null) {
      this.orderIndex = new Map();
      let i = 0;
      const visit = (n: N) => {
        this.orderIndex!.set(this.tree.key(n), i++);
        for (const a of this.tree.attributes(n)) this.orderIndex!.set(this.tree.key(a), i++);
        for (const c of this.tree.children(n)) visit(c);
      };
      visit(this.root(this.ctx.node));
    }
    return this.orderIndex.get(this.tree.key(node)) ?? Number.MAX_SAFE_INTEGER;
  }

  sorted(nodes: N[]): N[] {
    const seen = new Set<unknown>();
    const unique = nodes.filter((n) => {
      const key = this.tree.key(n);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return unique.sort((a, b) => this.order(a) - this.order(b));
  }

  evaluate(ast: Ast, node: N, position: number, size: number): Value<N> {
    switch (ast.type) {
      case "literal":
        return ast.value;
      case "number":
        return ast.value;
      case "var": {
        const value = this.ctx.variables.get(ast.name);
        if (value === undefined) throw new SyntaxError("ERROR: Undefined variable");
        return value;
      }
      case "negate":
        return -this.toNum(this.evaluate(ast.operand, node, position, size));
      case "binary":
        return this.binary(ast, node, position, size);
      case "call":
        return this.call(ast, node, position, size);
      case "filter": {
        const value = this.evaluate(ast.primary, node, position, size);
        if (!Array.isArray(value)) invalid();
        return ast.predicates.reduce((set, p) => this.filter(set, p), this.sorted(value));
      }
      case "path":
        return this.path(ast, node, position, size);
    }
  }

  private binary(
    ast: Extract<Ast, { type: "binary" }>,
    node: N,
    position: number,
    size: number,
  ): Value<N> {
    if (ast.op === "or") {
      return (
        this.toBool(this.evaluate(ast.left, node, position, size)) ||
        this.toBool(this.evaluate(ast.right, node, position, size))
      );
    }
    if (ast.op === "and") {
      return (
        this.toBool(this.evaluate(ast.left, node, position, size)) &&
        this.toBool(this.evaluate(ast.right, node, position, size))
      );
    }
    const left = this.evaluate(ast.left, node, position, size);
    const right = this.evaluate(ast.right, node, position, size);
    switch (ast.op) {
      case "|":
        if (!Array.isArray(left) || !Array.isArray(right)) invalid();
        return this.sorted([...left, ...right]);
      case "+":
        return this.toNum(left) + this.toNum(right);
      case "-":
        return this.toNum(left) - this.toNum(right);
      case "*":
        return this.toNum(left) * this.toNum(right);
      case "div":
        return this.toNum(left) / this.toNum(right);
      case "mod":
        return this.toNum(left) % this.toNum(right);
      default:
        return this.compare(ast.op, left, right);
    }
  }

  private compare(op: string, left: Value<N>, right: Value<N>): boolean {
    if (typeof left === "boolean" || typeof right === "boolean") {
      return this.compareAtoms(op, this.toBool(left), this.toBool(right));
    }
    if (Array.isArray(left) || Array.isArray(right)) {
      if (Array.isArray(left) && Array.isArray(right)) {
        const rights = right.map((n) => this.tree.stringValue(n));
        return left.some((l) =>
          rights.some((r) => this.compareAtoms(op, this.tree.stringValue(l), r)),
        );
      }
      if (Array.isArray(left)) {
        return left.some((l) => this.compareAtoms(op, this.atomFor(l, right), right));
      }
      return (right as N[]).some((r) =>
        this.compareAtoms(op, left as string | number | boolean, this.atomFor(r, left)),
      );
    }
    return this.compareAtoms(op, left, right);
  }

  private atomFor(node: N, other: Value<N>): string | number | boolean {
    const s = this.tree.stringValue(node);
    return typeof other === "number" ? stringToNumber(s) : s;
  }

  private compareAtoms(op: string, a: Value<N>, b: Value<N>): boolean {
    if (op === "=" || op === "!=") {
      let eq: boolean;
      if (typeof a === "boolean" || typeof b === "boolean") eq = this.toBool(a) === this.toBool(b);
      else if (typeof a === "number" || typeof b === "number") eq = this.toNum(a) === this.toNum(b);
      else eq = this.toStr(a) === this.toStr(b);
      return op === "=" ? eq : !eq;
    }
    const x = this.toNum(a);
    const y = this.toNum(b);
    if (op === "<") return x < y;
    if (op === ">") return x > y;
    if (op === "<=") return x <= y;
    return x >= y;
  }

  private path(
    ast: Extract<Ast, { type: "path" }>,
    node: N,
    position: number,
    size: number,
  ): Value<N> {
    let set: N[];
    if (ast.filter !== null) {
      const value = this.evaluate(ast.filter, node, position, size);
      if (!Array.isArray(value)) invalid();
      set = value;
    } else {
      set = [ast.absolute ? this.root(node) : node];
    }
    for (const step of ast.steps) {
      const next: N[] = [];
      for (const n of set) {
        let selected = this.axis(step.axis, n).filter((c) => this.matches(step, c));
        for (const p of step.predicates) selected = this.filter(selected, p);
        next.push(...selected);
      }
      set = this.sorted(next);
    }
    return set;
  }

  private filter(nodes: N[], predicate: Ast): N[] {
    return nodes.filter((n, i) => {
      const value = this.evaluate(predicate, n, i + 1, nodes.length);
      return typeof value === "number" ? value === i + 1 : this.toBool(value);
    });
  }

  private axis(axis: string, node: N): N[] {
    const t = this.tree;
    const descendants = (n: N): N[] => this.descendants(n);
    const ancestors = (n: N): N[] => {
      const result: N[] = [];
      for (let p = t.parent(n); p !== null; p = t.parent(p)) result.push(p);
      return result;
    };
    const siblings = (n: N): [N[], N[]] => {
      const parent = t.parent(n);
      if (parent === null || t.kind(n) === "attribute") return [[], []];
      const all = t.children(parent);
      const key = t.key(n);
      const i = all.findIndex((c) => t.key(c) === key);
      return [all.slice(0, i), all.slice(i + 1)];
    };
    switch (axis) {
      case "child":
        return t.children(node);
      case "descendant":
        return descendants(node);
      case "descendant-or-self":
        return [node, ...descendants(node)];
      case "self":
        return [node];
      case "parent": {
        const p = t.parent(node);
        return p === null ? [] : [p];
      }
      case "ancestor":
        return ancestors(node);
      case "ancestor-or-self":
        return [node, ...ancestors(node)];
      case "attribute":
        return t.attributes(node);
      case "following-sibling":
        return siblings(node)[1];
      case "preceding-sibling":
        return siblings(node)[0].reverse();
      case "following": {
        const result: N[] = [];
        for (let n: N | null = node; n !== null; n = t.parent(n)) {
          for (const s of siblings(n)[1]) result.push(s, ...descendants(s));
        }
        return this.sorted(result);
      }
      case "preceding": {
        const result: N[] = [];
        for (let n: N | null = node; n !== null; n = t.parent(n)) {
          for (const s of siblings(n)[0]) result.push(s, ...descendants(s));
        }
        return this.sorted(result).reverse();
      }
      default:
        throw new NotImplementedError(`the ${axis} axis is not supported`);
    }
  }

  descendants(node: N): N[] {
    const result: N[] = [];
    const stack = [...this.tree.children(node)].reverse();
    while (stack.length > 0) {
      const n = stack.pop()!;
      result.push(n);
      const children = this.tree.children(n);
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
    }
    return result;
  }

  rootOf(node: N): N {
    return this.root(node);
  }

  private matches(step: Step, node: N): boolean {
    const t = this.tree;
    const kind = t.kind(node);
    const test = step.test;
    if (test.type === "node") {
      if (test.kind === "node") return true;
      if (test.kind === "text") return kind === "text";
      if (test.kind === "comment") return kind === "comment";
      return (
        kind === "processing-instruction" &&
        (test.literal === null || t.localName(node) === test.literal)
      );
    }
    const principal = step.axis === "attribute" ? "attribute" : "element";
    if (kind !== principal) return false;
    let uri: string | null = null;
    if (test.prefix !== null) {
      const resolved = this.ctx.namespaces.get(test.prefix);
      if (resolved === undefined) throw new SyntaxError("ERROR: Undefined namespace prefix");
      uri = resolved;
    }
    if (test.local === "*") return test.prefix === null || t.namespaceUri(node) === uri;
    return t.localName(node) === test.local && t.namespaceUri(node) === uri;
  }

  private call(
    ast: Extract<Ast, { type: "call" }>,
    node: N,
    position: number,
    size: number,
  ): Value<N> {
    const colon = ast.name.indexOf(":");
    let uri: string | null = null;
    let local = ast.name;
    if (colon !== -1) {
      const prefix = ast.name.slice(0, colon);
      local = ast.name.slice(colon + 1);
      const resolved = this.ctx.namespaces.get(prefix);
      if (resolved === undefined) throw new SyntaxError("ERROR: Undefined namespace prefix");
      uri = resolved;
    }
    const args = ast.args.map((a) => this.evaluate(a, node, position, size));
    const core = uri === null ? CORE_FUNCTIONS[local] : undefined;
    if (core !== undefined) {
      return (core as unknown as CoreFunction<N>).call(this, { node, position, size }, args);
    }
    const fn = this.ctx.lookupFunction(local, uri);
    if (fn === undefined) throw new SyntaxError(`ERROR: Unregistered function: ${ast.name}`);
    const result = fn({ tree: this.tree, node, position, size }, args);
    if (result === null) throw new SyntaxError("ERROR: Stack usage error");
    return result;
  }

  localName(nodes: Value<N>, context: N): string {
    const list = this.contextList(nodes, context);
    if (list.length === 0) return "";
    const n = list[0];
    const kind = this.tree.kind(n);
    return kind === "element" || kind === "attribute" || kind === "processing-instruction"
      ? this.tree.localName(n)
      : "";
  }

  contextList(nodes: Value<N> | undefined, context: N): N[] {
    if (nodes === undefined) return [context];
    if (!Array.isArray(nodes)) throw new SyntaxError("ERROR: Invalid type");
    return this.sorted(nodes);
  }
}

type CoreFunction<N = never> = (
  this: Evaluator<N>,
  context: { node: N; position: number; size: number },
  args: Value<N>[],
) => Value<N>;

const CORE_FUNCTIONS: Record<string, CoreFunction<unknown>> = {
  last(context) {
    return context.size;
  },
  position(context) {
    return context.position;
  },
  count(_context, [nodes]) {
    if (!Array.isArray(nodes)) throw new SyntaxError("ERROR: Invalid type");
    return nodes.length;
  },
  "local-name"(context, [nodes]) {
    return this.localName(nodes, context.node);
  },
  name(context, [nodes]) {
    const list = this.contextList(nodes, context.node);
    if (list.length === 0) return "";
    const kind = this.tree.kind(list[0]);
    return kind === "element" || kind === "attribute" || kind === "processing-instruction"
      ? this.tree.qualifiedName(list[0])
      : "";
  },
  "namespace-uri"(context, [nodes]) {
    const list = this.contextList(nodes, context.node);
    return list.length === 0 ? "" : (this.tree.namespaceUri(list[0]) ?? "");
  },
  string(context, [value]) {
    return this.toStr(value ?? [context.node]);
  },
  concat(_context, args) {
    if (args.length < 2) throw new SyntaxError("ERROR: Invalid number of arguments");
    return args.map((a) => this.toStr(a)).join("");
  },
  "starts-with"(_context, [a, b]) {
    return this.toStr(a).startsWith(this.toStr(b));
  },
  contains(_context, [a, b]) {
    return this.toStr(a).includes(this.toStr(b));
  },
  "substring-before"(_context, [a, b]) {
    const s = this.toStr(a);
    const i = s.indexOf(this.toStr(b));
    return i === -1 ? "" : s.slice(0, i);
  },
  "substring-after"(_context, [a, b]) {
    const s = this.toStr(a);
    const needle = this.toStr(b);
    const i = s.indexOf(needle);
    return i === -1 ? "" : s.slice(i + needle.length);
  },
  substring(_context, [a, b, c]) {
    const chars = [...this.toStr(a)];
    const start = Math.round(this.toNum(b));
    const end = c === undefined ? Infinity : start + Math.round(this.toNum(c));
    return chars.filter((_, i) => i + 1 >= start && i + 1 < end).join("");
  },
  "string-length"(context, [a]) {
    return [...this.toStr(a ?? [context.node])].length;
  },
  "normalize-space"(context, [a]) {
    return this.toStr(a ?? [context.node])
      .replace(/[ \t\r\n]+/g, " ")
      .replace(/^ | $/g, "");
  },
  translate(_context, [a, b, c]) {
    const from = [...this.toStr(b)];
    const to = [...this.toStr(c)];
    return [...this.toStr(a)]
      .map((ch) => {
        const i = from.indexOf(ch);
        return i === -1 ? ch : (to[i] ?? "");
      })
      .join("");
  },
  boolean(_context, [a]) {
    return this.toBool(a);
  },
  not(_context, [a]) {
    return !this.toBool(a);
  },
  true() {
    return true;
  },
  false() {
    return false;
  },
  number(context, [a]) {
    return this.toNum(a ?? [context.node]);
  },
  sum(_context, [nodes]) {
    if (!Array.isArray(nodes)) throw new SyntaxError("ERROR: Invalid type");
    return nodes.reduce<number>((total, n) => total + stringToNumber(this.tree.stringValue(n)), 0);
  },
  floor(_context, [a]) {
    return Math.floor(this.toNum(a));
  },
  ceiling(_context, [a]) {
    return Math.ceil(this.toNum(a));
  },
  id(context, [a]) {
    const tokens = (
      Array.isArray(a) ? a.map((n) => this.tree.stringValue(n)).join(" ") : this.toStr(a)
    )
      .split(/[ \t\r\n]+/)
      .filter((token) => token.length > 0);
    return this.descendants(this.rootOf(context.node)).filter(
      (n) =>
        this.tree.kind(n) === "element" &&
        this.tree
          .attributes(n)
          .some(
            (attr) =>
              this.tree.localName(attr) === "id" &&
              [null, XML_NAMESPACE].includes(this.tree.namespaceUri(attr)) &&
              tokens.includes(this.tree.stringValue(attr)),
          ),
    );
  },
  lang(context, [a]) {
    const lang = this.toStr(a).toLowerCase();
    for (let n: unknown = context.node; n !== null; n = this.tree.parent(n)) {
      const attr = this.tree
        .attributes(n)
        .find(
          (x) => this.tree.localName(x) === "lang" && this.tree.namespaceUri(x) === XML_NAMESPACE,
        );
      if (attr !== undefined) {
        const value = this.tree.stringValue(attr).toLowerCase();
        return value === lang || value.startsWith(`${lang}-`);
      }
    }
    return false;
  },
  round(_context, [a]) {
    const n = this.toNum(a);
    return Number.isFinite(n) ? Math.floor(n + 0.5) : n;
  },
};

/** @noRailsEquivalent PERMANENT */
export function evaluate<N>(expression: string, context: EvaluationContext<N>): Value<N> {
  const ast = new Parser(tokenize(expression)).parse();
  const evaluator = new Evaluator(context);
  const value = evaluator.evaluate(ast, context.node, 1, 1);
  return Array.isArray(value) ? evaluator.sorted(value) : value;
}

/** @noRailsEquivalent PERMANENT */
export function toXPathString<N>(tree: Tree<N>, value: Value<N>): string {
  if (Array.isArray(value)) return value.length === 0 ? "" : tree.stringValue(value[0]);
  if (typeof value === "number") return numberToString(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return value;
}
