import { Ast } from "../ast.js";
import { Cat, Group } from "../nodes/node.js";
import type { Dot, Literal, Node, Or, Slash, Star } from "../nodes/node.js";
import { FormatBuilder, Format, Visitor } from "../visitors.js";

type Matchers = Record<string, RegExp | RegExp[]>;

function escapeRegex(s: string): string {
  // Mirrors Ruby `Regexp.escape`: does NOT escape `/` (`/` has no special
  // meaning in a regex source string; it's only delimiter-significant in
  // JS regex literals, not in the `RegExp` constructor).
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Escape characters that would be significant inside a `[…]` character class.
 * Distinct from `escapeRegex` because the metacharacter set is different
 * (e.g. `.` and `+` are literals inside a class, but `]` and `-` are not).
 */
function escapeCharClass(s: string): string {
  return s.replace(/[\]\\^-]/g, "\\$&");
}

function regexUnion(re: RegExp | RegExp[]): string {
  const arr = Array.isArray(re) ? re : [re];
  return arr.map((r) => r.source).join("|");
}

/**
 * Collect the union of regex flags across a list of requirement regexes.
 * Rails' `Regexp.union` produces inline flag scopes (`(?i-mx:…)`); JS lacks
 * inline flag groups, so we apply the combined flag set at the outer
 * `RegExp` level.
 *
 * - `g`/`y` are filtered: they change matching semantics in ways that
 *   would break Pattern's anchored regex.
 * - `m` is filtered for the outer Pattern regex (`outer: true`, default):
 *   it changes `^`/`$` to match line boundaries, which would break our
 *   `^…$` anchoring (Rails' `\A…\Z` is unaffected by `/m`). Pass
 *   `outer: false` only when building a non-anchored regex from the
 *   same sources (e.g. the offset-computation `(?:src)|` regex), where
 *   preserving the requirement's `m` semantics is safe.
 * - `u` and `v` are mutually exclusive. If any source uses `v`, `v` wins
 *   (it's the superset); otherwise `u` is preserved so Unicode property
 *   escapes (`\p{…}`) remain valid.
 * - `i`/`s`/`d` are passed through.
 */
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

/**
 * Union flags only across matchers actually referenced by a list of names.
 * Avoids leaking flags from extra `requirements` entries (e.g. `{ ignored: /x/i }`)
 * onto the compiled Pattern regex when the AST never references `:ignored`.
 */
function combinedFlagsUsed(
  matchers: Record<string, RegExp | RegExp[]>,
  names: readonly string[],
): string {
  const values: Array<RegExp | RegExp[]> = [];
  for (const n of names) if (Object.hasOwn(matchers, n)) values.push(matchers[n]!);
  return combinedFlagsFor(values);
}

// =========================================================================
// AnchoredRegexp visitor — builds the `\A...\Z` regex source for a Pattern.
// =========================================================================

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
    if (!Object.hasOwn(this._matchers, name)) return this._separatorRe;
    return `(${regexUnion(this._matchers[name]!)})`;
  }

  protected override visitGROUP(node: Node): string {
    return `(?:${this.visit((node as Group).left as Node) as string})?`;
  }

  protected override visitLITERAL(node: Node): string {
    return escapeRegex((node as Literal).left as string);
  }

  protected override visitDOT(node: Node): string {
    return escapeRegex((node as Dot).left as string);
  }

  protected override visitSLASH(node: Node): string {
    return (node as Slash).left as string;
  }

  protected override visitSTAR(node: Node): string {
    const inner = (node as Star).left as Node;
    const name = inner.toSym();
    if (!Object.hasOwn(this._matchers, name)) return "(.+)";
    return `(${regexUnion(this._matchers[name]!)})`;
  }

  protected override visitOR(node: Node): string {
    const children = (node as Or).children().map((c) => this.visit(c) as string);
    return `(?:${children.join("|")})`;
  }
}

// =========================================================================
// UnanchoredRegexp — like AnchoredRegexp but with `(?:\b|$|/)` suffix.
// =========================================================================

export class UnanchoredRegexp extends AnchoredRegexp {
  override accept(node: Node): RegExp {
    const path = this.visit(node) as string;
    const flags = combinedFlagsUsed(this._matchers, this._names);
    if (path === "/") return new RegExp(`^/`, flags);
    // Rails uses `(?:\b|\Z|/)` — `\Z` is "end of string or before trailing
    // newline"; in JS `$` (in default mode) is end-of-string. `\b` is the
    // same word-boundary semantic.
    return new RegExp(`^${path}(?:\\b|$|/)`, flags);
  }
}

// =========================================================================
// MatchData — wraps a RegExp match with offset-aware indexed access.
// =========================================================================

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

  /** Captures, 1-indexed in Rails — here returned as a 0-indexed array. */
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

  /**
   * Rails `match[i]` — adjusts by offset before indexing into the underlying match.
   *
   * `at(0)` returns the full match (Rails `match[0]`); positive indices apply
   * the per-symbol offset adjustment. Negative indices return undefined.
   */
  at(x: number): string | undefined {
    if (x === 0) return this._match[0];
    if (x < 0 || x >= this.length) return undefined;
    const idx = this._offsets[x - 1]! + x;
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

// =========================================================================
// Pattern — the main class.
// =========================================================================

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
    // Apply the leading-optional normalization at the Ast level so that
    // downstream consumers reading `path.ast.tree` (e.g. the GTG builder
    // in `journey/routes.ts`) see the same tree as the regex/formatter.
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
    // Mirror Rails `ast.requirements = …`: push single-RegExp requirements
    // onto each symbol (and `*name` star) node's `.regexp` so the GTG sees
    // the user's char-class (e.g. `:filename` with `/(.+)/` matches dotted
    // segments). Skip array-form (regex union) requirements — those are
    // pattern-level only.
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
      const s = terminals[i]!;
      if (s.type === "DOT" || s.type === "SLASH") continue;
      const back = terminals[i - 1]!;
      const fwd = terminals[i + 1];
      // Rails consults the SymbolNode's regexp after `ast.requirements=`
      // wires it in; trails-side Pattern stores requirements separately,
      // so consult the requirements map directly.
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
    const out: Record<string, RegExp> = {};
    for (const [k, v] of Object.entries(this.requirements)) {
      // Wrap the union in `(?:…)` so the anchors bind around the whole
      // alternation: `^a|b$` parses as `(^a)|(b$)`, which isn't what we
      // want for a missing-keys equality check.
      out[k] = new RegExp(`^(?:${regexUnion(v)})$`, combinedFlagsFor([v]));
    }
    this._requirementsAnchoredCache = out;
    return out;
  }

  /** @internal */
  private _computeOffsets(): readonly number[] {
    if (this._offsets) return this._offsets;
    const offsets: number[] = [0];
    for (const n of this.spec) {
      if (!n.isSymbol()) continue;
      const name = n.toSym();
      if (Object.hasOwn(this.requirements, name)) {
        const reqs = this.requirements[name]!;
        const src = regexUnion(reqs);
        const re = new RegExp(`(?:${src})|`, combinedFlagsFor([reqs], { outer: false }));
        const m = re.exec("");
        const groupCount = m ? m.length - 1 : 0;
        offsets.push(groupCount + offsets[offsets.length - 1]!);
      } else {
        offsets.push(offsets[offsets.length - 1]!);
      }
    }
    this._offsets = offsets;
    return offsets;
  }
}

/**
 * Normalize a spec whose first top-level node is a SLASH followed by a
 * GROUP whose first descendant is also a SLASH. Mirrors Rails'
 * `Mapper.normalize_path` — when a route is written as `(/:locale)/foo`
 * and a caller has already prefixed `/`, the naive concatenation produces
 * `^/(?:/(...))?/foo$` which matches neither `/foo` nor `/en/foo`. Two
 * shapes need handling, both replicating the Mapper `gsub!`/restore pair:
 *
 *   1. Mixed (some non-optional top-level node, e.g. `/(/:locale)/foo`):
 *      drop the duplicate top-level SLASH entirely so the optional group's
 *      own SLASH provides the separator when the group fires.
 *
 *   2. All-optional (every top-level non-Slash is a Group, e.g.
 *      `/(/:a)(/:b)`): keep the top-level SLASH (so `/` matches the
 *      root-style empty case) and drop the leading SLASH inside the FIRST
 *      group only (so `/en` matches with the leading `/` serving as the
 *      separator for the first capture).
 *
 * Centralizing this in Pattern means any caller building a Pattern from a
 * journey-normalized path string gets the right regex, without having to
 * re-implement the Mapper-level workaround.
 *
 * @internal
 */
function normalizeLeadingOptionalSpec(spec: Node): Node {
  const parts = flattenCat(spec);
  if (parts.length < 2 || parts[0]!.type !== "SLASH") return spec;
  const second = parts[1]!;
  if (!second.isGroup()) return spec;
  // The second top-level node must be a Group whose body starts with a
  // SLASH terminal — otherwise there's no slash-doubling to undo.
  const innerParts = flattenCat((second as Group).left as Node);
  if (innerParts.length < 2 || innerParts[0]!.type !== "SLASH") return spec;
  const allOptional = parts.slice(1).every((p) => p.isGroup());
  const newParts = allOptional
    ? [parts[0]!, new Group(buildCat(innerParts.slice(1))), ...parts.slice(2)]
    : parts.slice(1);
  return buildCat(newParts);
}

/** @internal Flatten a right-leaning Cat chain into an array of nodes. */
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

/** @internal Rebuild a right-leaning Cat chain from a non-empty node list. */
function buildCat(parts: readonly Node[]): Node {
  return parts.slice(1).reduce((acc, n) => new Cat(acc, n), parts[0]!);
}
