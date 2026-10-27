import {
  ArgumentError,
  type Method,
  STDOUT,
  StringIO,
  classModule,
  extend,
  included,
  isSymbol,
  rbFArray,
  rbFSend,
  rbInspect,
  rbObjMethod,
  rbObjMethods,
  rbObjRespondTo,
  strip,
  stringSplit,
  toI,
  toS,
  toSym,
} from "@blazetrails/ruby-compat";

export type Parser = string;

export interface ParseOptions {
  debug?: unknown;
  rewrite?: boolean;
  all?: boolean;
  prune?: boolean;
  error?: boolean;
  [key: string]: unknown;
}

export class Raabro {
  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;

  static VERSION = "1.4.0";

  declare static _match: ModuleMethods["_match"];
  declare static str: ModuleMethods["str"];
  declare static rex: ModuleMethods["rex"];
  declare static _quantify: ModuleMethods["_quantify"];
  declare static _narrow: ModuleMethods["_narrow"];
  declare static _parse: ModuleMethods["_parse"];
  declare static seq: ModuleMethods["seq"];
  declare static alt: ModuleMethods["alt"];
  declare static altg: ModuleMethods["altg"];
  declare static rep: ModuleMethods["rep"];
  declare static ren: ModuleMethods["ren"];
  declare static rename: ModuleMethods["rename"];
  declare static nott: ModuleMethods["nott"];
  declare static all: ModuleMethods["all"];
  declare static eseq: ModuleMethods["eseq"];
  declare static jseq: ModuleMethods["jseq"];
  declare static last: ModuleMethods["last"];
  declare static methodAdded: ModuleMethods["methodAdded"];
  declare static parse: ModuleMethods["parse"];
  declare static reparseForError: ModuleMethods["reparseForError"];
  declare static rewrite_: ModuleMethods["rewrite_"];
  declare static rewrite: ModuleMethods["rewrite"];
  declare static makeIncludable: ModuleMethods["makeIncludable"];

  static toString(): string {
    return "Raabro";
  }

  static pp(
    tree: Tree,
    depth: number | Record<string, unknown> = 0,
    opts: Record<string, unknown> = {},
  ): void {
    if (!(tree instanceof Tree)) {
      throw new ArgumentError("tree is not an instance of Raabro::Tree");
    }

    if (typeof depth === "object") [depth, opts] = [0, depth];

    const [_rs, _dg, _gn, _yl, _bl, _lg] =
      (opts.colors != null && opts.colors !== false) ||
      (opts.colours != null && opts.colours !== false) ||
      STDOUT.isTty()
        ? [
            "\u001b[0;0m",
            "\u001b[1;30m",
            "\u001b[0;32m",
            "\u001b[1;33m",
            "\u001b[0;34m",
            "\u001b[0;37m",
          ]
        : ["", "", "", "", "", ""];

    const lc = tree.result === 1 ? _gn : _dg;
    let nc = tree.result === 1 ? _bl : _lg;
    if (tree.name == null) nc = lc;
    const sc = tree.result === 1 ? _yl : _dg;

    const str =
      tree.children.length === 0
        ? ` ${sc}${
            tree.string().length === 0
              ? `${_dg} >${rbInspect(tree.nonstring(14)).slice(1, -1)}<`
              : rbInspect(tree.string())
          }`
        : "";

    if (depth === 0) STDOUT.print(`${_dg}t---\n`);

    for (let i = 0; i < depth; i++) {
      const pipe = i % 3 === 0 ? ": " : "| ";
      STDOUT.print(i % 2 === 0 ? `${_dg}${pipe} ` : "  ");
    }

    STDOUT.print(`${lc}${tree.result}`);
    STDOUT.print(` ${nc}${rbInspect(tree.name)} ${lc}${tree.offset},${tree.length}`);
    STDOUT.print(str);
    STDOUT.print(`${_rs}\n`);

    for (const c of tree.children) this.pp(c, depth + 1, opts);

    if (depth === 0) {
      STDOUT.print(_dg);
      STDOUT.print(`input ln: ${tree.input.string.length}, tree ln: ${tree.length} `);
      STDOUT.print("---t\n");
      STDOUT.print(_rs);
    }
  }
}

export class Input {
  string: string;
  offset: number;
  readonly options: ParseOptions;

  static toString(): string {
    return "Raabro::Input";
  }

  constructor(string: string, offset: number | ParseOptions = 0, options: ParseOptions = {}) {
    this.string = string;
    this.offset = typeof offset === "object" && offset !== null ? 0 : offset;
    this.options = typeof offset === "object" && offset !== null ? offset : options;
  }

  match(strOrRegex: unknown): number | false {
    if (strOrRegex instanceof RegExp) {
      const m = this.string.slice(this.offset).match(strOrRegex);
      return m != null && m.index === 0 ? m[0].length : false;
    } else {
      const s = toS(strOrRegex);
      const l = s.length;
      return this.string.slice(this.offset, this.offset + l) === s ? l : false;
    }
  }

  tring(l = -1): string {
    return l < 0
      ? this.string.slice(this.offset, l === -1 ? undefined : l + 1)
      : this.string.slice(this.offset, this.offset + l);
  }

  at(i: number): string {
    return this.string.slice(i, i + 1);
  }
}

export class Tree {
  name: string | null;
  input: Input;
  result: number;
  offset: number;
  length: number;
  parter: string;
  children: Tree[];

  static toString(): string {
    return "Raabro::Tree";
  }

  constructor(name: string | null, parter: string, input: Input) {
    this.result = 0;
    this.name = name;
    this.parter = parter;
    this.input = input;
    this.offset = input.offset;
    this.length = 0;
    this.children = [];
  }

  c0(): Tree | undefined {
    return this.children[0];
  }
  c1(): Tree | undefined {
    return this.children[1];
  }
  c2(): Tree | undefined {
    return this.children[2];
  }
  c3(): Tree | undefined {
    return this.children[3];
  }
  c4(): Tree | undefined {
    return this.children[4];
  }
  clast(): Tree | undefined {
    return this.children.at(-1);
  }

  isEmpty(): boolean {
    return this.result === 1 && this.length === 0;
  }

  successfulChildren(): Tree[] {
    return this.children.filter((c) => c.result === 1);
  }

  pruneBang(): Tree[] {
    return (this.children = this.successfulChildren());
  }

  string(): string {
    return this.input.string.slice(this.offset, this.offset + this.length);
  }
  strinp(): string {
    return strip(this.string());
  }
  strim(): string {
    return this.strinp();
  }
  nonstring(l = 7): string {
    return this.input.string.slice(this.offset, this.offset + l);
  }

  stringd(): string {
    return this.string().toLowerCase();
  }
  strind(): string {
    return this.stringd();
  }
  stringpd(): string {
    return this.strinp().toLowerCase();
  }
  strinpd(): string {
    return this.stringpd();
  }

  symbol(): string {
    return toSym(this.strinp());
  }
  symbold(): string {
    return this.symbol().toLowerCase();
  }
  symbod(): string {
    return this.symbold();
  }

  lookup(name: string | null = null): Tree | null {
    name = name != null ? toS(name) : null;

    if (this.name != null && name == null) return this;
    if (toS(this.name) === name) return this;
    return this.sublookup(name);
  }

  sublookup(name: string | null = null): Tree | null {
    for (const c of this.children) {
      const n = c.lookup(name);
      if (n != null) return n;
    }

    return null;
  }

  gather(name: string | null = null, acc: Tree[] = []): Tree[] {
    name = name != null ? toS(name) : null;

    if ((this.name != null && name == null) || toS(this.name) === name) {
      acc.push(this);
    } else {
      this.subgather(name, acc);
    }

    return acc;
  }

  subgather(name: string | null = null, acc: Tree[] = []): Tree[] {
    for (const c of this.children) c.gather(name, acc);

    return acc;
  }

  toA(opts: unknown = {}): unknown[] {
    if (!(typeof opts === "object" && opts !== null && !Array.isArray(opts))) {
      opts = rbFArray(opts).reduce((h: Record<string, boolean>, e) => {
        h[toS(e)] = true;
        return h;
      }, {});
    }
    const o = opts as { leaves?: unknown; children?: unknown };

    const cn =
      o.leaves != null && o.leaves !== false && this.result === 1 && this.children.length === 0
        ? this.string()
        : o.children !== false
          ? this.children.map((e) => e.toA(opts))
          : this.children.length;

    return [this.name, this.result, this.offset, this.length, null, this.parter, cn];
  }

  toString(depth = 0, io: StringIO = new StringIO()): string | null {
    if (depth > 0) io.print("\n");
    io.print("  ".repeat(depth));
    io.print(`${this.result} ${rbInspect(this.name)} ${this.offset},${this.length}`);
    io.print(this.result === 1 && this.children.length === 0 ? " " + rbInspect(this.string()) : "");

    for (const c of this.children) c.toString(depth + 1, io);

    return depth === 0 ? io.string() : null;
  }

  oddChildren(): Tree[] {
    const cs: Tree[] = [];
    this.children.forEach((c, i) => {
      if (i % 2 === 1) cs.push(c);
    });
    return cs;
  }

  evenChildren(): Tree[] {
    const cs: Tree[] = [];
    this.children.forEach((c, i) => {
      if (i % 2 === 0) cs.push(c);
    });
    return cs;
  }

  extractError(): [number, number, number, string, string] {
    const [errTree, stack] = (this.lookupError() ?? this.lookupAllError())!;

    const [line, column] = this.lineAndColumn(errTree.offset);

    let errMessage: string;
    if (stack != null) {
      const path = stack
        .filter((x) => x != null)
        .reverse()
        .slice(0, 3)
        .reverse()
        .map((x) => rbInspect(x))
        .join("/");
      errMessage = `parsing failed .../${path}`;
    } else {
      errMessage = "parsing failed, not all input was consumed";
    }
    const visual = this.visual(line, column);

    return [line, column, errTree.offset, errMessage, visual];
  }

  lookupError(stack: (string | null)[] = []): [Tree, (string | null)[]] | null {
    if (this.result !== 0) return null;
    if (this.children.length === 0) return [this, stack];
    for (const c of this.children) {
      const es = c.lookupError([...stack, this.name]);
      if (es != null) return es;
    }
    return null;
  }

  lookupAllError(): [Tree, (string | null)[] | null] | null {
    for (const c of this.children) if (c.result === 0) return [c, null];
    for (const c of [...this.children].reverse()) {
      const es = c.lookupAllError();
      if (es != null) return es;
    }
    return null;
  }

  lineAndColumn(offset: number): [number, number] {
    let line = 1;
    let column = 0;

    for (let off = 0; off <= offset; off++) {
      column += 1;
      if (!(this.input.at(off) === "\n")) continue;

      line += 1;
      column = 0;
    }

    return [line, column];
  }

  visual(line: number, column: number): string {
    return stringSplit(this.input.string, "\n")[line - 1] + "\n" + " ".repeat(column - 1) + "^---";
  }
}

export class ModuleMethods {
  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;

  declare private _last: string | null | undefined;

  static toString(): string {
    return "Raabro::ModuleMethods";
  }

  _match(name: string | null, input: Input, parter: string, regexOrString: unknown): Tree {
    const r = new Tree(name, parter, input);

    const l = input.match(regexOrString);
    if (l !== false) {
      r.result = 1;
      r.length = l;
      input.offset += l;
    }

    return r;
  }

  str(name: string | null, input: Input, string: string): Tree {
    return this._match(name, input, ":str", string);
  }

  rex(name: string | null, input: Input, regexOrString: RegExp | string): Tree {
    return this._match(name, input, ":rex", new RegExp(regexOrString));
  }

  _quantify(parser: unknown): [number, number] | string | null {
    if (isSymbol(parser) && rbObjRespondTo(this, toS(parser))) return null;

    switch (parser) {
      case "?":
      case ":q":
      case ":qmark":
        return [0, 1];
      case "*":
      case ":s":
      case ":star":
        return [0, 0];
      case "+":
      case ":p":
      case ":plus":
        return [1, 0];
      case "!":
        return ":bang";
      default:
        return null;
    }
  }

  _narrow(parser: Parser): Method {
    if (this._quantify(parser) != null) {
      throw new ArgumentError(`lone quantifier ${toS(parser)}`);
    }

    return rbObjMethod(this, toSym(parser));
  }

  _parse(parser: Parser, input: Input): Tree {
    return this._narrow(parser).call(input) as Tree;
  }

  seq(name: string | null, input: Input, ...parsers: Parser[]): Tree {
    const r = new Tree(name, ":seq", input);

    const start = input.offset;
    let c: Tree | null = null;

    while (true) {
      const pa = parsers.shift();
      if (pa == null) break;

      let q;
      if (parsers[0] === "!") {
        parsers.shift();
        c = this.nott(null, input, pa);
        r.children.push(c);
      } else if ((q = this._quantify(parsers[0])) != null) {
        parsers.shift();
        c = this.rep(null, input, pa, ...(rbFArray(q) as [number, number?]));
        r.children.push(...c.children);
      } else {
        c = this._parse(pa, input);
        r.children.push(c);
      }

      if (c.result !== 1) break;
    }

    if (c != null && c.result === 1) {
      r.result = 1;
      r.length = input.offset - start;
    } else {
      input.offset = start;
    }

    return r;
  }

  alt(name: string | null, input: Input, ...parsers: (Parser | boolean)[]): Tree {
    const greedy =
      parsers.at(-1) === true || parsers.at(-1) === false ? (parsers.pop() as boolean) : false;

    const r = new Tree(name, greedy ? ":altg" : ":alt", input);

    const start = input.offset;
    let c: Tree | null = null;

    for (const pa of parsers as Parser[]) {
      const cc = this._parse(pa, input);
      r.children.push(cc);

      input.offset = start;

      if (greedy) {
        if (cc.result === 1 && cc.length >= (c != null ? c.length : -1)) {
          if (c != null) c.result = 0;
          c = cc;
        } else {
          cc.result = 0;
        }
      } else {
        c = cc;
        if (c.result === 1) break;
      }
    }

    if (c != null && c.result === 1) {
      r.result = 1;
      r.length = c.length;
      input.offset = start + r.length;
    }

    if (input.options.prune != null && input.options.prune !== false) r.pruneBang();

    return r;
  }

  altg(name: string | null, input: Input, ...parsers: Parser[]): Tree {
    return this.alt(name, input, ...parsers, true);
  }

  rep(
    name: string | null,
    input: Input,
    parser: Parser,
    min: number | null,
    max: number | null = 0,
  ): Tree {
    if (min == null || min < 0) min = 0;
    if (max == null || max < 1) max = null;

    const r = new Tree(name, ":rep", input);
    const start = input.offset;
    let count = 0;

    while (true) {
      const c = this._parse(parser, input);
      r.children.push(c);
      if (c.result !== 1) break;
      count += 1;
      if (c.length < 1) break;
      if (max != null && count === max) break;
    }

    if (count >= min && (max == null || count <= max)) {
      r.result = 1;
      r.length = input.offset - start;
    } else {
      input.offset = start;
    }

    if (input.options.prune != null && input.options.prune !== false) r.pruneBang();

    return r;
  }

  ren(name: string | null, input: Input, parser: Parser): Tree {
    const r = this._parse(parser, input);
    r.name = name;

    return r;
  }

  rename(name: string | null, input: Input, parser: Parser): Tree {
    return this.ren(name, input, parser);
  }

  nott(name: string | null, input: Input, parser: Parser): Tree {
    const start = input.offset;

    const r = new Tree(name, ":nott", input);
    const c = this._parse(parser, input);
    r.children.push(c);

    r.length = 0;
    r.result = c.result === 1 ? 0 : 1;

    input.offset = start;

    return r;
  }

  all(name: string | null, input: Input, parser: Parser): Tree {
    const start = input.offset;
    const length = input.string.length - input.offset;

    const r = new Tree(name, ":all", input);
    const c = this._parse(parser, input);
    r.children.push(c);

    if (c.length < length) {
      input.offset = start;
    } else {
      r.result = 1;
      r.length = c.length;
    }

    return r;
  }

  eseq(
    name: string | null,
    input: Input,
    startpa: Parser | null,
    eltpa: Parser,
    seppa: Parser | null = null,
    endpa: Parser | null = null,
  ): Tree {
    let jseq = false;

    if (seppa == null && endpa == null) {
      jseq = true;
      seppa = eltpa;
      eltpa = startpa!;
      startpa = null;
    }

    const start = input.offset;
    const r = new Tree(name, jseq ? ":jseq" : ":eseq", input);
    r.result = 1;
    let c: Tree;

    if (startpa != null) {
      c = this._parse(startpa, input);
      r.children.push(c);
      if (c.result !== 1) r.result = 0;
    }

    if (r.result === 1) {
      let onElt = false;
      let count = 0;
      let emptyStack = 0;

      while (true) {
        onElt = !onElt;

        const cr = this._parse(onElt ? eltpa : seppa!, input);

        emptyStack = cr.isEmpty() ? emptyStack + 1 : 0;
        if (emptyStack > 1) cr.result = 0;

        r.children.push(cr);

        if (cr.result !== 1) {
          if (onElt && count > 0) {
            const lsep = r.children.at(-2)!;
            lsep.result = 0;
            input.offset = lsep.offset;
          }
          break;
        }

        count += 1;
      }

      if (jseq && count < 1) r.result = 0;
    }

    if (r.result === 1 && endpa != null) {
      c = this._parse(endpa, input);
      r.children.push(c);
      if (c.result !== 1) r.result = 0;
    }

    if (r.result === 1) {
      r.length = input.offset - start;
    } else {
      input.offset = start;
    }

    if (input.options.prune != null && input.options.prune !== false) r.pruneBang();

    return r;
  }

  jseq(
    name: string | null,
    input: Input,
    startpa: Parser | null,
    eltpa: Parser,
    seppa: Parser | null = null,
    endpa: Parser | null = null,
  ): Tree {
    return this.eseq(name, input, startpa, eltpa, seppa, endpa);
  }

  get last(): string | null {
    return this._last ?? null;
  }

  set last(value: string | null) {
    this._last = value;
  }

  methodAdded(name: string): void {
    const m = rbObjMethod(this, name);
    if (!(m.arity() === 1)) return;
    if (!(m.parameters()[0][1] === ":i" || m.parameters()[0][1] === ":input")) return;

    this.last = toSym(name);
  }

  parse(input: string, opts: ParseOptions = {}): unknown {
    const d = toI(opts.debug) as number;
    if (d > 0) opts.rewrite = false;
    if (d > 1) opts["all"] = false;
    if (d > 2) opts.prune = false;

    if (!("prune" in opts)) opts.prune = true;

    const root = rbObjRespondTo(this, "root") ? ":root" : this.last!;

    let t =
      opts["all"] === false
        ? this._parse(root, new Input(input, opts))
        : this.all(null, new Input(input, opts), root);

    if (opts.error != null && opts.error !== false && t.result !== 1) {
      return this.reparseForError(input, opts, t);
    }
    if (opts.prune !== false && t.result !== 1) return null;

    if (t.parter === ":all") t = t.children[0];

    if (opts.rewrite !== false) return this.rewrite(t);

    return t;
  }

  reparseForError(input: string, opts: ParseOptions, t: Tree): unknown {
    t =
      opts.prune === false
        ? t
        : (this.parse(input, { ...opts, error: false, rewrite: false, prune: false }) as Tree);

    return t.extractError();
  }

  rewrite_(tree: Tree): unknown {
    const t = tree.lookup(null);

    return t != null ? this.rewrite(t) : null;
  }

  rewrite(tree: Tree | 0): unknown {
    if (tree === 0) return !!rbObjMethods(this).find((m) => toS(m).startsWith("rewrite_"));

    return rbFSend(
      this,
      `rewrite_${toS(tree.name)}`.replace(/_([A-Za-z\d])/g, (_, ch: string) => ch.toUpperCase()),
      tree,
    );
  }

  makeIncludable(): void {
    (this as { [included]?: (target: object) => void })[included] = function (target: object) {
      (function (this: object) {
        extend(this, ModuleMethods);
        extend(this, this as typeof ModuleMethods);
      }).call(target);
    };
  }
}
extend(Raabro, ModuleMethods);

Raabro.makeIncludable();

import "./class-paths.generated.js";
