import {
  ArgumentError,
  StringIO,
  classModule,
  include,
  numericAbs,
  numericDiv,
  numericModulo,
  numericMul,
  numericPlus,
  numericUminus,
  partition,
  rbInspect,
  rbIntegerTypeP,
  rbEqual,
  rbHash,
  rbObjClassname,
  rbSetClassPathString,
  strip,
  round,
  toF,
  toI,
  toS,
} from "@blazetrails/ruby-compat";
import { Time } from "@blazetrails/date";
import { EtOrbi, EoTime } from "@blazetrails/et-orbi";
import { Raabro, type ModuleMethods, type Input, type Tree } from "@blazetrails/raabro";
import { DAY_S, YEAR_S } from "./misc.js";
import { Fugit } from "./namespaces.js";

type DurationKey = "yea" | "mon" | "wee" | "day" | "hou" | "min" | "sec";

type DurationH = Partial<Record<DurationKey, number>>;

interface KeyAttributes {
  a: string;
  r: string;
  i: string;
  s: number;
  x?: number;
  I?: boolean;
  l: string;
}

export interface DurationOptions {
  iso?: unknown;
  plain?: unknown;
  stricter?: unknown;
  literal?: unknown;
  [key: string]: unknown;
}

export class Duration {
  declare static Parser: typeof Parser & ModuleMethods & Parser;
  declare static IsoParser: typeof IsoParser & ModuleMethods & IsoParser;

  declare original: unknown;
  declare h: DurationH;
  declare options: DurationOptions;

  constructor(s: unknown) {
    return Duration.parse(s) as this;
  }

  static parse(s: unknown, opts: DurationOptions = {}): Duration | null {
    if (s instanceof this) return s;

    const original = s;

    if (typeof s === "number" || s instanceof Number || typeof s === "bigint") s = `${toS(s)}s`;

    if (typeof s !== "string") return null;

    s = strip(s);

    const h =
      opts.iso != null && opts.iso !== false
        ? Duration.IsoParser.parse(
            opts.stricter != null && opts.stricter !== false
              ? (s as string)
              : (s as string).toUpperCase(),
          )
        : opts.plain != null && opts.plain !== false
          ? Duration.Parser.parse(s as string)
          : (Duration.Parser.parse(s as string) ??
            Duration.IsoParser.parse(
              opts.stricter != null && opts.stricter !== false
                ? (s as string)
                : (s as string).toUpperCase(),
            ));

    return h != null && h !== false
      ? (Object.create(this.prototype) as Duration).init(original, opts, h as DurationH)
      : null;
  }

  static doParse(s: unknown, opts: DurationOptions = {}): Duration {
    const d = this.parse(s, opts);
    if (d != null) return d;
    throw new ArgumentError(`not a duration ${rbInspect(s)}`);
  }

  static toPlainS(o: unknown): string {
    return this.doParse(o).deflate().toPlainS();
  }
  static toIsoS(o: unknown): string {
    return this.doParse(o).deflate().toIsoS();
  }
  static toLongS(o: unknown, opts: DurationOptions = {}): string {
    return this.doParse(o).deflate().toLongS(opts);
  }

  static commonRewriteDur(t: Tree): DurationH {
    return t.subgather(null).reduce((h: Record<string, number>, tt) => {
      let v: string | number = tt.string();
      v = v.includes(".") ? toF(v) : (toI(v) as number);
      const k = tt.name!.slice(1);
      h[k] = numericPlus(h[k] ?? 0, v) as number;
      return h;
    }, {});
  }

  static KEYS: Readonly<Record<DurationKey, KeyAttributes>> = Object.freeze({
    yea: { a: "Y", r: "y", i: "Y", s: YEAR_S, x: 0, l: "year" },
    mon: { a: "M", r: "M", i: "M", s: 30 * DAY_S, x: 1, l: "month" },
    wee: { a: "W", r: "w", i: "W", s: 7 * DAY_S, I: true, l: "week" },
    day: { a: "D", r: "d", i: "D", s: DAY_S, I: true, l: "day" },
    hou: { a: "h", r: "h", i: "H", s: 3600, I: true, l: "hour" },
    min: { a: "m", r: "m", i: "M", s: 60, I: true, l: "minute" },
    sec: { a: "s", r: "s", i: "S", s: 1, I: true, l: "second" },
  });

  static INFLA_KEYS: [DurationKey, KeyAttributes][];
  static NON_INFLA_KEYS: [DurationKey, KeyAttributes][];

  static {
    [this.INFLA_KEYS, this.NON_INFLA_KEYS] = partition(
      Object.entries(this.KEYS) as [DurationKey, KeyAttributes][],
      ([_k, v]) => v.I,
    ).map((a) => Object.freeze(a)) as [DurationKey, KeyAttributes][][];
  }

  /** @internal */
  protected _toS(key: "a" | "r"): string {
    return (Object.entries(Duration.KEYS) as [DurationKey, KeyAttributes][])
      .reduce<[StringIO, string]>(
        ([s, sign], [k, a]) => {
          const v = this.h[k];
          if (v == null) return [s, sign];
          const sign1 = v < 0 ? "-" : "+";
          s.append(sign1 !== sign ? sign1 : "")
            .append(toS(numericAbs(v)))
            .append(a[key]);
          return [s, sign1];
        },
        [new StringIO(), "+"],
      )[0]
      .string();
  }

  toPlainS(): string {
    return this._toS("a");
  }
  toRufusS(): string {
    return this._toS("r");
  }

  toIsoS(): string {
    let t = false;

    const s = new StringIO();
    s.append("P");

    (Object.entries(Duration.KEYS) as [DurationKey, KeyAttributes][]).forEach(([k, a], i) => {
      const v = this.h[k];
      if (v == null) return;
      if (i > 3 && t === false) {
        t = true;
        s.append("T");
      }
      s.append(toS(v));
      s.append(a.i);
    });

    return s.string();
  }

  toLongS(opts: DurationOptions = {}): string {
    const s = new StringIO();
    const adn = [false, "no"].includes(opts.oxford as string) ? " and " : ", and ";

    const a = Object.entries(this.h) as [DurationKey, number][];
    let kv: [DurationKey, number] | undefined;
    while ((kv = a.shift())) {
      const [k, v] = kv;
      const aa = Duration.KEYS[k];
      s.append(toS(toI(v)));
      s.append(" ");
      s.append(aa.l);
      if (v > 1) s.append("s");
      if (a.length > 0) s.append(a.length === 1 ? adn : ", ");
    }

    return s.string();
  }

  toH(): DurationH {
    return this.h;
  }

  toRufusH(): Record<string, number> {
    return (Object.entries(Duration.KEYS) as [DurationKey, KeyAttributes][]).reduce(
      (h: Record<string, number>, [ks, kh]) => {
        const v = this.h[ks];
        if (v != null) h[kh.r] = v;
        return h;
      },
      {},
    );
  }

  toSec(): number {
    return (Object.entries(Duration.KEYS) as [DurationKey, KeyAttributes][]).reduce(
      (s: number, [k, a]) => {
        const v = this.h[k];
        if (v == null) return s;
        return numericPlus(s, numericMul(v, a.s)) as number;
      },
      0,
    );
  }

  inflate(): Duration {
    const params = (Object.entries(this.h) as [DurationKey, number][]).reduce(
      (h: DurationH, [k, v]) => {
        const a = Duration.KEYS[k];
        if (a.I) {
          h.sec = numericPlus(h.sec, numericMul(v, a.s)) as number;
        } else {
          h[k] = v;
        }
        return h;
      },
      { sec: 0 },
    );

    return (Object.create(Object.getPrototypeOf(this)) as Duration).init(this.original, {}, params);
  }

  static SECOND_ROUND = 9;

  deflate(options: { month?: unknown; year?: unknown } = {}): Duration {
    const id = this.inflate();
    const h = { ...id.h };
    let s: number = h.sec ?? 0;
    delete h.sec;

    let keys: [DurationKey, Pick<KeyAttributes, "s">][] = Duration.INFLA_KEYS;

    let mon = options.month;
    let yea = options.year;
    if ((mon != null && mon !== false) || (yea != null && yea !== false)) keys = [...keys];

    if (mon != null && mon !== false) {
      if (mon === true) mon = 30;
      if (Number.isInteger(mon)) mon = `${toS(mon)}d`;
      keys.unshift(["mon", { s: Duration.parse(mon)!.toSec() }]);
    }
    if (yea != null && yea !== false) {
      if (yea === true) yea = 365;
      if (Number.isInteger(yea)) yea = `${toS(yea)}d`;
      keys.unshift(["yea", { s: Duration.parse(yea)!.toSec() }]);
    }

    for (const [k, v] of keys.slice(0, -1)) {
      const vs = v.s;
      if (s < vs) continue;

      h[k] = numericPlus(h[k] ?? 0, numericDiv(toI(s), vs)) as number;
      s = numericModulo(s, vs) as number;
    }

    h.sec = rbIntegerTypeP(s) ? s : round(s, Duration.SECOND_ROUND);

    return (Object.create(Object.getPrototypeOf(this)) as Duration).init(this.original, {}, h);
  }

  opposite(): Duration {
    const params = (Object.entries(this.h) as [DurationKey, number][]).reduce(
      (h: DurationH, [k, v]) => {
        h[k] = numericUminus(v) as number;
        return h;
      },
      {},
    );

    return (Object.create(Object.getPrototypeOf(this)) as Duration).init(null, {}, params);
  }

  negate(): Duration {
    return this.opposite();
  }

  addNumeric(n: unknown): Duration {
    const h = { ...this.h };
    h.sec = numericPlus(h.sec ?? 0, toI(n)) as number;

    return (Object.create(Object.getPrototypeOf(this)) as Duration).init(null, {}, h);
  }

  addDuration(d: Duration): Duration {
    const params = (Object.entries(d.h) as [DurationKey, number][]).reduce(
      (h: DurationH, [k, v]) => {
        h[k] = numericPlus(h[k] ?? 0, v) as number;
        return h;
      },
      { ...this.h },
    );

    return (Object.create(Object.getPrototypeOf(this)) as Duration).init(null, {}, params);
  }

  addToTime(t: unknown): EoTime {
    t = EtOrbi.makeTime(t);
    let et = t as EoTime;

    for (const [k, a] of Duration.INFLA_KEYS) {
      const v = this.h[k];
      if (v == null) continue;

      et = et.plus(numericMul(v, a.s));
    }

    for (const [k, a] of Duration.NON_INFLA_KEYS) {
      const v = this.h[k];
      if (v == null) continue;
      const at = [et.year(), et.month(), et.day(), et.hour(), et.min(), et.sec()];

      at[a.x!] = numericPlus(at[a.x!], v) as number;

      if (at[1] > 12) {
        const [n, m] = [numericDiv(at[1], 12) as number, numericModulo(at[1], 12) as number];
        [at[0], at[1]] = [at[0] + n, m];
      } else if (at[1] < 1) {
        const [n, m] = [
          (numericDiv(-at[1], 12) as number) + 1,
          (numericModulo(11 + at[1], 12) as number) + 1,
        ];
        [at[0], at[1]] = [at[0] - n, m];
      }

      et = EtOrbi.makeTime(at, et.zone);
    }

    return et;
  }

  add(a: unknown): Duration | EoTime {
    if (typeof a === "number" || a instanceof Number || typeof a === "bigint") {
      return this.addNumeric(a);
    } else if (a instanceof Duration) {
      return this.addDuration(a);
    } else if (typeof a === "string") {
      return this.addDuration(Duration.parse(a)!);
    } else if (a instanceof Time || a instanceof EoTime) {
      return this.addToTime(a);
    } else {
      throw new ArgumentError(`cannot add ${rbObjClassname(a)} instance to a Fugit::Duration`);
    }
  }
  plus(a: unknown): Duration | EoTime {
    return this.add(a);
  }

  subtract(a: unknown): Duration | EoTime {
    if (typeof a === "number" || a instanceof Number || typeof a === "bigint") {
      return this.addNumeric(numericUminus(a));
    } else if (a instanceof Duration) {
      return this.addDuration(a.negate());
    } else if (typeof a === "string") {
      return this.addDuration(Duration.parse(a)!.negate());
    } else if (a instanceof Time || a instanceof EoTime) {
      return this.opposite().addToTime(a);
    } else {
      throw new ArgumentError(`cannot subtract ${rbObjClassname(a)} instance to a Fugit::Duration`);
    }
  }
  minus(a: unknown): Duration | EoTime {
    return this.subtract(a);
  }

  equals(o: unknown): boolean {
    return o instanceof Duration && rbEqual(o.h, this.h);
  }
  eql(o: unknown): boolean {
    return this.equals(o);
  }

  hash(): number {
    return rbHash(this.h);
  }

  nextTime(from: unknown = EoTime.now()): Duration | EoTime {
    return this.add(from);
  }

  dropSeconds(): Duration {
    const h = { ...this.h };
    delete h.sec;
    if (Object.keys(h).length === 0) h.min = 0;

    return (Object.create(Object.getPrototypeOf(this)) as Duration).init(
      null,
      { literal: true },
      h,
    );
  }

  /** @internal */
  protected init(original: unknown, options: DurationOptions, h: DurationH): this {
    this.original = original;
    this.options = options;

    if (options.literal != null && options.literal !== false) {
      this.h = h;
    } else {
      this.h = Object.fromEntries(Object.entries(h).filter(([_k, v]) => !rbEqual(v, 0)));
      if (Object.keys(this.h).length === 0) this.h.sec = 0;
    }

    return this;
  }
}

export class Parser {
  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;

  sep(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /([ \t,]+|and)*/i);
  }

  yea(this: ModuleMethods, i: Input): Tree {
    return this.rex(":yea", i, /(\d+\.\d*|(\d*\.)?\d+) *y(ears?)?/i);
  }
  mon(this: ModuleMethods, i: Input): Tree {
    return this.rex(":mon", i, /(\d+\.\d*|(\d*\.)?\d+) *(M|months?)/);
  }
  wee(this: ModuleMethods, i: Input): Tree {
    return this.rex(":wee", i, /(\d+\.\d*|(\d*\.)?\d+) *w(eeks?)?/i);
  }
  day(this: ModuleMethods, i: Input): Tree {
    return this.rex(":day", i, /(\d+\.\d*|(\d*\.)?\d+) *d(ays?)?/i);
  }
  hou(this: ModuleMethods, i: Input): Tree {
    return this.rex(":hou", i, /(\d+\.\d*|(\d*\.)?\d+) *h(ours?)?/i);
  }
  min(this: ModuleMethods, i: Input): Tree {
    return this.rex(":min", i, /(\d+\.\d*|(\d*\.)?\d+) *m(in(ute)?s?)?/);
  }

  sec(this: ModuleMethods, i: Input): Tree {
    return this.rex(":sec", i, /(\d+\.\d*|(\d*\.)?\d+) *s(ec(ond)?)?s?/i);
  }
  sek(this: ModuleMethods, i: Input): Tree {
    return this.rex(":sec", i, /(\d+\.\d*|\.\d+|\d+)$/);
  }

  elt(this: ModuleMethods, i: Input): Tree {
    return this.alt(null, i, ":yea", ":mon", ":wee", ":day", ":hou", ":min", ":sec", ":sek");
  }
  sign(this: ModuleMethods, i: Input): Tree {
    return this.rex(":sign", i, /[-+]?/);
  }

  sdur(this: ModuleMethods, i: Input): Tree {
    return this.seq(":sdur", i, ":sign", "?", ":elt", "+");
  }

  dur(this: ModuleMethods, i: Input): Tree {
    return this.jseq(":dur", i, ":sdur", ":sep");
  }

  merge(h0: Record<string, number>, h1: Record<string, number>): Record<string, number> {
    const sign = h1.sign ?? 1;
    delete h1.sign;

    return Object.entries(h1).reduce(
      (h, [k, v]) => ({ ...h, [k]: numericPlus(h[k] ?? 0, numericMul(sign, v)) as number }),
      h0,
    );
  }

  rewriteSdur(t: Tree): Record<string, number> {
    const h = Duration.commonRewriteDur(t) as Record<string, number>;

    const signt = t.sublookup(":sign");
    const sign = signt != null && signt.string() === "-" ? -1 : 1;

    return { ...h, sign };
  }

  rewriteDur(this: ModuleMethods & Parser, t: Tree): Record<string, number> {
    return t.children.reduce(
      (h: Record<string, number>, ct) =>
        this.merge(h, ct.name != null ? (this.rewrite(ct) as Record<string, number>) : {}),
      {},
    );
  }

  static {
    include(this, Raabro);
    for (const name of Object.getOwnPropertyNames(this.prototype)) {
      if (name !== "constructor") (this as unknown as ModuleMethods).methodAdded(name);
    }
  }
}

export class IsoParser {
  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;

  p(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /P/);
  }
  t(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /T/);
  }

  yea(this: ModuleMethods, i: Input): Tree {
    return this.rex(":yea", i, /-?\d+Y/);
  }
  mon(this: ModuleMethods, i: Input): Tree {
    return this.rex(":mon", i, /-?\d+M/);
  }
  wee(this: ModuleMethods, i: Input): Tree {
    return this.rex(":wee", i, /-?\d+W/);
  }
  day(this: ModuleMethods, i: Input): Tree {
    return this.rex(":day", i, /-?\d+D/);
  }
  hou(this: ModuleMethods, i: Input): Tree {
    return this.rex(":hou", i, /-?\d+H/);
  }
  min(this: ModuleMethods, i: Input): Tree {
    return this.rex(":min", i, /-?\d+M/);
  }
  sec(this: ModuleMethods, i: Input): Tree {
    return this.rex(":sec", i, /-?(\d*\.)?\d+S/);
  }

  delt(this: ModuleMethods, i: Input): Tree {
    return this.alt(null, i, ":yea", ":mon", ":wee", ":day");
  }
  telt(this: ModuleMethods, i: Input): Tree {
    return this.alt(null, i, ":hou", ":min", ":sec");
  }

  date(this: ModuleMethods, i: Input): Tree {
    return this.rep(null, i, ":delt", 1);
  }
  time(this: ModuleMethods, i: Input): Tree {
    return this.rep(null, i, ":telt", 1);
  }
  tTime(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":t", ":time");
  }

  dur(this: ModuleMethods, i: Input): Tree {
    return this.seq(":dur", i, ":p", ":date", "?", ":tTime", "?");
  }

  rewriteDur(t: Tree): DurationH {
    return Duration.commonRewriteDur(t);
  }

  static {
    include(this, Raabro);
    for (const name of Object.getOwnPropertyNames(this.prototype)) {
      if (name !== "constructor") (this as unknown as ModuleMethods).methodAdded(name);
    }
  }
}

Duration.Parser = Parser as typeof Duration.Parser;
Duration.IsoParser = IsoParser as typeof Duration.IsoParser;
Fugit.Duration = Duration;
rbSetClassPathString(Duration, Fugit, "Duration");
rbSetClassPathString(Parser, Duration, "Parser");
rbSetClassPathString(IsoParser, Duration, "IsoParser");
