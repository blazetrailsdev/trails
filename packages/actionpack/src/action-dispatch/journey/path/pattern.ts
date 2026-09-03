import { hasKey, regexpEscape, transformValues } from "@blazetrails/ruby-compat";
import { Ast } from "../ast.js";
import { Cat, Group } from "../nodes/node.js";
import type { Dot, Literal, Node, Or, Slash, Star } from "../nodes/node.js";
import { FormatBuilder, Format, Visitor } from "../visitors.js";

type Matchers = Record<string, RegExp | RegExp[]>;

function escapeCharClass(s: string): string {
  return s.replace(/[\]\\^-]/g, "\\$&");
}

function regexUnion(re: RegExp | RegExp[]): string {
  const arr = Array.isArray(re) ? re : [re];
  return arr.map((r) => r.source).join("|");
}

function combinedFlagsFor(
  values: ReadonlyArray<RegExp | RegExp[]>,
  opts: { outer?: boolean } = {},
): string {
  const outer = opts.outer ?? true;
  const seen = new Set<string>();
  for (const v of values) {
    const arr = Array.isArray(v) ? v : [v];
    for (const r of arr) for (const f of r.flags) seen.add(f);
  }
  const out: string[] = [];
  for (const f of "isd") if (seen.has(f)) out.push(f);
  if (!outer && seen.has("m")) out.push("m");
  if (seen.has("v")) out.push("v");
  else if (seen.has("u")) out.push("u");
  return out.join("");
}

function combinedFlagsUsed(
  matchers: Record<string, RegExp | RegExp[]>,
  names: readonly string[],
): string {
  const values: Array<RegExp | RegExp[]> = [];
  for (const n of names) if (Object.hasOwn(matchers, n)) values.push(matchers[n]);
  return combinedFlagsFor(values);
}

export class AnchoredRegexp extends Visitor {
  protected readonly _separator: string;
  protected readonly _matchers: Matchers;
  protected readonly _names: readonly string[];
  private readonly _separatorRe: string;

  constructor(separator: string, matchers: Matchers, names: readonly string[] = []) {
    super();
    this._separator = separator;
    this._matchers = matchers;
    this._names = names;
    this._separatorRe = `([^${escapeCharClass(separator)}]+)`;
  }

  override accept(node: Node): RegExp {
    return new RegExp(`^${this.visit(node)}$`, combinedFlagsUsed(this._matchers, this._names));
  }

  protected override visitCAT(node: Node): string {
    const cat = node as Cat;
    return `${this.visit(cat.left as Node) as string}${this.visit(cat.right) as string}`;
  }

  protected override visitSYMBOL(node: Node): string {
    const name = node.toSym();
    if (!hasKey(this._matchers, name)) return this._separatorRe;
    return `(${regexUnion(this._matchers[name])})`;
  }

  protected override visitGROUP(node: Node): string {
    return `(?:${this.visit((node as Group).left as Node) as string})?`;
  }

  protected override visitLITERAL(node: Node): string {
    return regexpEscape((node as Literal).left as string);
  }

  protected override visitDOT(node: Node): string {
    return regexpEscape((node as Dot).left as string);
  }

  protected override visitSLASH(node: Node): string {
    return (node as Slash).left as string;
  }

  protected override visitSTAR(node: Node): string {
    const inner = (node as Star).left;
    const name = inner.toSym();
    if (!Object.hasOwn(this._matchers, name)) return "(.+)";
    return `(${regexUnion(this._matchers[name])})`;
  }

  protected override visitOR(node: Node): string {
    const children = (node as Or).children().map((c) => this.visit(c) as string);
    return `(?:${children.join("|")})`;
  }
}

export class UnanchoredRegexp extends AnchoredRegexp {
  override accept(node: Node): RegExp {
    const path = this.visit(node) as string;
    const flags = combinedFlagsUsed(this._matchers, this._names);
    if (path === "/") return new RegExp(`^/`, flags);
    return new RegExp(`^${path}(?:\\b|$|/)`, flags);
  }
}

export class MatchData {
  readonly names: readonly string[];
  private readonly _offsets: readonly number[];
  private readonly _match: RegExpMatchArray;
  private readonly _input: string;

  constructor(
    names: readonly string[],
    offsets: readonly number[],
    match: RegExpMatchArray,
    input: string,
  ) {
    this.names = names;
    this._offsets = offsets;
    this._match = match;
    this._input = input;
  }

  get captures(): readonly (string | undefined)[] {
    return Array.from({ length: this.length - 1 }, (_, i) => this.at(i + 1));
  }

  get namedCaptures(): Record<string, string | undefined> {
    const caps = this.captures;
    const out: Record<string, string | undefined> = {};
    this.names.forEach((n, i) => {
      out[n] = caps[i];
    });
    return out;
  }

  at(x: number): string | undefined {
    if (x === 0) return this._match[0];
    if (x < 0 || x >= this.length) return undefined;
    const idx = this._offsets[x - 1] + x;
    return this._match[idx];
  }

  get length(): number {
    return this._offsets.length;
  }

  postMatch(): string {
    const matched = this._match[0] ?? "";
    const start = (this._match.index ?? 0) + matched.length;
    return this._input.slice(start);
  }

  toString(): string {
    return this._match[0] ?? "";
  }
}

export class Pattern {
  ast: Ast | null;
  readonly spec: Node;
  readonly requirements: Matchers;
  readonly anchored: boolean;
  readonly names: readonly string[];

  private readonly _separators: string;
  private _optionalNames: readonly string[] | null = null;
  private _requiredNames: readonly string[] | null = null;
  private _re: RegExp | null = null;
  private _offsets: readonly number[] | null = null;
  private _requirementsAnchoredCache?: Record<string, RegExp>;

  constructor(ast: Ast, requirements: Matchers, separators: string, anchored: boolean) {
    const normalizedTree = normalizeLeadingOptionalSpec(ast.root);
    if (normalizedTree !== ast.root) {
      ast = new Ast(normalizedTree, true);
    }
    this.ast = ast;
    this.spec = ast.root;
    this.requirements = requirements;
    this._separators = separators;
    this.anchored = anchored;
    this.names = ast.names;
    const flat: Record<string, RegExp> = {};
    for (const [k, v] of Object.entries(requirements)) {
      if (v instanceof RegExp) flat[k] = v;
    }
    if (Object.keys(flat).length > 0) ast.requirements = flat;
  }

  buildFormatter(): Format {
    return new FormatBuilder().accept(this.spec);
  }

  eagerLoadBang(): void {
    void this.requiredNames;
    void this._computeOffsets();
    void this.toRegexp();
    this.ast = null;
  }

  isRequirementsAnchored(): boolean {
    if (!this.ast) return true;
    const terminals = this.ast.terminals;
    for (let i = 1; i < terminals.length; i++) {
      const s = terminals[i];
      if (s.type === "DOT" || s.type === "SLASH") continue;
      const back = terminals[i - 1];
      const fwd = terminals[i + 1];
      if (s.isSymbol() && Array.isArray(this.requirements[s.toSym()])) return false;
      if (back.isLiteral()) return false;
      if (fwd && fwd.isLiteral()) return false;
    }
    return true;
  }

  get requiredNames(): readonly string[] {
    if (this._requiredNames) return this._requiredNames;
    const opt = new Set(this.optionalNames);
    this._requiredNames = this.names.filter((n) => !opt.has(n));
    return this._requiredNames;
  }

  get optionalNames(): readonly string[] {
    if (this._optionalNames) return this._optionalNames;
    const groups: Group[] = [];
    for (const n of this.spec) if (n.isGroup()) groups.push(n as Group);
    const names: string[] = [];
    for (const g of groups) {
      for (const child of g.left as Node) {
        if (child.isSymbol() && !names.includes(child.name)) {
          names.push(child.name);
        }
      }
    }
    this._optionalNames = names;
    return names;
  }

  match(other: string): MatchData | undefined {
    const re = this.toRegexp();
    const m = other.match(re);
    if (!m) return undefined;
    return new MatchData(this.names, this._computeOffsets(), m, other);
  }

  isMatch(other: string): boolean {
    return this.toRegexp().test(other);
  }

  get source(): string {
    return this.toRegexp().source;
  }

  toRegexp(): RegExp {
    if (this._re) return this._re;
    const Klass = this.anchored ? AnchoredRegexp : UnanchoredRegexp;
    this._re = new Klass(this._separators, this.requirements, this.names).accept(this.spec);
    return this._re;
  }

  get requirementsForMissingKeysCheck(): Record<string, RegExp> {
    if (this._requirementsAnchoredCache) return this._requirementsAnchoredCache;
    this._requirementsAnchoredCache = transformValues(
      this.requirements,
      (regex) => new RegExp(`^(?:${regexUnion(regex)})$`, combinedFlagsFor([regex])),
    );
    return this._requirementsAnchoredCache;
  }

  /** @internal */
  private get regexpVisitor(): typeof AnchoredRegexp {
    return this.anchored ? AnchoredRegexp : UnanchoredRegexp;
  }

  /** @internal */
  private get offsets(): readonly number[] {
    return this._computeOffsets();
  }

  /** @internal */
  private _computeOffsets(): readonly number[] {
    if (this._offsets) return this._offsets;
    const offsets: number[] = [0];
    for (const n of this.spec) {
      if (!n.isSymbol()) continue;
      const name = n.toSym();
      if (hasKey(this.requirements, name)) {
        const reqs = this.requirements[name];
        const src = regexUnion(reqs);
        const re = new RegExp(`(?:${src})|`, combinedFlagsFor([reqs], { outer: false }));
        const m = re.exec("");
        const groupCount = m ? m.length - 1 : 0;
        offsets.push(groupCount + offsets[offsets.length - 1]);
      } else {
        offsets.push(offsets[offsets.length - 1]);
      }
    }
    this._offsets = offsets;
    return offsets;
  }
}

/** @internal */
function normalizeLeadingOptionalSpec(spec: Node): Node {
  const parts = flattenCat(spec);
  if (parts.length < 2 || parts[0].type !== "SLASH") return spec;
  const second = parts[1];
  if (!second.isGroup()) return spec;
  const innerParts = flattenCat((second as Group).left as Node);
  if (innerParts.length < 2 || innerParts[0].type !== "SLASH") return spec;
  const allOptional = parts.slice(1).every((p) => p.isGroup());
  const newParts = allOptional
    ? [parts[0], new Group(buildCat(innerParts.slice(1))), ...parts.slice(2)]
    : parts.slice(1);
  return buildCat(newParts);
}

/** @internal */
function flattenCat(node: Node): Node[] {
  const out: Node[] = [];
  const walk = (n: Node): void => {
    if (n.isCat()) {
      walk((n as Cat).left as Node);
      walk((n as Cat).right);
    } else {
      out.push(n);
    }
  };
  walk(node);
  return out;
}

/** @internal */
function buildCat(parts: readonly Node[]): Node {
  return parts.slice(1).reduce((acc, n) => new Cat(acc, n), parts[0]);
}
