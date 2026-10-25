import { Raabro, type Input, type ModuleMethods, type Tree } from "@blazetrails/raabro";
import {
  ArgumentError,
  Hash,
  RuntimeError,
  classModule,
  deleteAt,
  flatten,
  include,
  isSymbol,
  rbEqual,
  rbFArray,
  rbInspect,
  sort,
  sortBy,
  stringToSym,
  toI,
  toS,
  uniq,
} from "@blazetrails/ruby-compat";
import { Cron, Parser as CronParser } from "./cron.js";
import { Duration } from "./duration.js";
import { Fugit } from "./namespaces.js";

export interface NatOptions {
  multi?: unknown;
  strict?: unknown;
  doParse?: unknown;
  _s?: string;
  [key: string]: unknown;
}

type SlotOpts = { weak?: unknown; strong?: unknown };

type Hm = [unknown[], unknown[]];

export class Nat {
  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;

  declare static Parser: typeof Parser & ModuleMethods & Parser;
  declare static Slot: typeof Slot;
  declare static SlotGroup: typeof SlotGroup;

  static MAX_INPUT_LENGTH = 256;

  static toString(): string {
    return "Fugit::Nat";
  }

  static parse(s: unknown, opts: NatOptions = {}): Cron | Cron[] | Duration | null {
    if (s instanceof Cron || s instanceof Duration) return s;

    if (typeof s !== "string") return null;

    s = s.trim();
    const str = s as string;

    if (str.length > Nat.MAX_INPUT_LENGTH) {
      if (opts.doParse != null && opts.doParse !== false) {
        throw new ArgumentError(
          "input too long for a nat string, " + `${str.length} > ${Nat.MAX_INPUT_LENGTH}`,
        );
      }

      return null;
    }

    const slots = Nat.Parser.parse(str) as SlotGroup | null;
    if (slots) {
      return slots.toCrons({ ...opts, _s: str });
    } else {
      return null;
    }
  }

  static doParse(s: unknown, opts: NatOptions = {}): Cron | Cron[] | Duration {
    const r = this.parse(s, { ...opts, doParse: true });
    if (r != null) return r;
    throw new ArgumentError(`could not parse a nat ${rbInspect(s)}`);
  }
}

const oneToNine = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const sixties = [
  "zero",
  ...oneToNine,
  ...[
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ],
  ...flatten(
    ["twenty", "thirty", "fourty", "fifty"].map((a) =>
      [null, ...oneToNine].map((b) => [a, b].filter((e) => e != null).join("-")),
    ),
  ),
] as string[];

const oh: Record<string, number | string> = {
  "1st": 1,
  "2nd": 2,
  "3rd": 3,
  "21st": 21,
  "22nd": 22,
  "23rd": 23,
  "31st": 31,
  last: "L",
};
for (let i = 4; i <= 30; i++) oh[`${i}th`] = i;
[
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth",
  "thirteenth",
  "fourteenth",
  "fifteenth",
  "sixteenth",
  "seventeenth",
  "eighteenth",
  "nineteenth",
  "twentieth",
  "twenty-first",
  "twenty-second",
  "twenty-third",
  "twenty-fourth",
  "twenty-fifth",
  "twenty-sixth",
  "twenty-seventh",
  "twenty-eighth",
  "twenty-ninth",
  "thirtieth",
  "thirty-first",
].forEach((e, i) => {
  oh[e] = i + 1;
});

export class Parser {
  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;

  static toString(): string {
    return "Fugit::Nat::Parser";
  }

  static NHOURS: Readonly<Record<string, number>> = Object.freeze({
    ...sixties.slice(0, 13).reduce((h: Record<string, number>, n, i) => {
      h[n] = i;
      return h;
    }, {}),
    midnight: 0,
    oh: 0,
    noon: 12,
  });
  static NMINUTES: Readonly<Record<string, number>> = Object.freeze({
    ...sixties.reduce((h: Record<string, number>, n, i) => {
      h[n] = i;
      return h;
    }, {}),
    "o'clock": 0,
    hundred: 0,
  });

  static WEEKDAYS = Object.freeze([...CronParser.WEEKDAYS, ...CronParser.WEEKDS]);

  static POINTS = Object.freeze(["minutes?", "mins?", "seconds?", "secs?", "hours?", "hou", "h"]);

  static INTERVALS = Object.freeze([
    "seconds?",
    "minutes?",
    "hours?",
    "days?",
    "months?",
    "sec",
    "min",
    "s",
    "m",
    "h",
    "d",
    "M",
  ]);

  static OMONTHDAYS: Readonly<Record<string, number | string>> = Object.freeze(oh);

  static OMONTHDAY_REX = Object.freeze(new RegExp(Object.keys(Parser.OMONTHDAYS).join("|"), "i"));
  static MONTHDAY_REX = Object.freeze(/3[0-1]|[0-2]?[0-9]/);
  static WEEKDAY_REX = Object.freeze(
    new RegExp(`(${Parser.WEEKDAYS.join("|")})(?=($|[-, \\t]))`, "i"),
  );
  static NAMED_M_REX = Object.freeze(new RegExp(Object.keys(Parser.NMINUTES).join("|"), "i"));
  static NAMED_H_REX = Object.freeze(new RegExp(Object.keys(Parser.NHOURS).join("|"), "i"));
  static POINT_REX = Object.freeze(new RegExp(`(${Parser.POINTS.join("|")})[ \\t]+`, "i"));
  static INTERVAL_REX = Object.freeze(new RegExp(`[ \\t]*(${Parser.INTERVALS.join("|")})`));

  _every(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /[ \t]*every[ \t]+/i);
  }
  _from(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /[ \t]*from[ \t]+/i);
  }
  _at(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /[ \t]*at[ \t]+/i);
  }
  _on(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /[ \t]*on[ \t]+/i);
  }
  _to(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /[ \t]*to[ \t]+/i);
  }

  _and(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /[ \t]*and[ \t]+/i);
  }
  _andOrOr(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /[ \t]*(and|or)[ \t]+/i);
  }
  _inOrOn(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /(in|on)[ \t]+/i);
  }

  _andOrOrOrComma(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /[ \t]*(,[ \t]*)?((and|or)[ \t]+|,[ \t]*)/i);
  }

  _toOrDash(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /[ \t]*-[ \t]*|[ \t]+(to|through)[ \t]+/i);
  }

  _dayS(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /[ \t]*days?[ \t]+/i);
  }
  _the(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /[ \t]*the[ \t]+/i);
  }

  _space(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /[ \t]+/);
  }
  _sep(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /([ \t]+|[ \t]*,[ \t]*)/);
  }

  count(this: ModuleMethods, i: Input): Tree {
    return this.rex(":count", i, /\d+/);
  }

  omonthday(this: ModuleMethods, i: Input): Tree {
    return this.rex(":omonthday", i, Parser.OMONTHDAY_REX);
  }
  monthday(this: ModuleMethods, i: Input): Tree {
    return this.rex(":monthday", i, Parser.MONTHDAY_REX);
  }
  weekday(this: ModuleMethods, i: Input): Tree {
    return this.rex(":weekday", i, Parser.WEEKDAY_REX);
  }

  omonthdays(this: ModuleMethods, i: Input): Tree {
    return this.jseq(null, i, ":omonthday", ":_andOrOrOrComma");
  }
  monthdays(this: ModuleMethods, i: Input): Tree {
    return this.jseq(null, i, ":monthday", ":_andOrOrOrComma");
  }

  weekdays(this: ModuleMethods, i: Input): Tree {
    return this.jseq(":weekdays", i, ":weekday", ":_andOrOrOrComma");
  }

  onThe(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":_the", ":omonthdays");
  }

  _minute(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /[ \t]*minute[ \t]+/i);
  }

  _dmin(this: ModuleMethods, i: Input): Tree {
    return this.rex(":dmin", i, /[0-5]?[0-9]/);
  }
  andDmin(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":_andOrOrOrComma", ":_minute", "?", ":_dmin");
  }

  onMinutes(this: ModuleMethods, i: Input): Tree {
    return this.seq(":on_minutes", i, ":_minute", ":_dmin", ":andDmin", "*");
  }

  onThex(this: ModuleMethods, i: Input): Tree {
    return this.rex(":on_thex", i, /[ \t]*the[ \t]+(hour|minute)[ \t]*/i);
  }

  onThes(this: ModuleMethods, i: Input): Tree {
    return this.jseq(":on_thes", i, ":onThe", ":_andOrOrOrComma");
  }
  onDays(this: ModuleMethods, i: Input): Tree {
    return this.seq(":on_days", i, ":_dayS", ":monthdays");
  }
  onWeekdays(this: ModuleMethods, i: Input): Tree {
    return this.ren(":on_weekdays", i, ":weekdays");
  }

  onObject(this: ModuleMethods, i: Input): Tree {
    return this.alt(null, i, ":onDays", ":onWeekdays", ":onMinutes", ":onThes", ":onThex");
  }
  onObjects(this: ModuleMethods, i: Input): Tree {
    return this.jseq(null, i, ":onObject", ":_and");
  }

  on(this: ModuleMethods, i: Input): Tree {
    return this.seq(":on", i, ":_on", ":onObjects");
  }

  cityTz(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /[A-Z][a-zA-Z0-9+-]+(\/[A-Z][a-zA-Z0-9+\-_]+){0,2}/);
  }
  namedTz(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /Z|UTC/);
  }
  deltaTz(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /[-+]([01][0-9]|2[0-4])(:?(00|15|30|45))?/);
  }
  tz(this: ModuleMethods, i: Input): Tree {
    return this.alt(":tz", i, ":cityTz", ":namedTz", ":deltaTz");
  }
  tzone(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":_inOrOn", "?", ":tz");
  }

  ampm(this: ModuleMethods, i: Input): Tree {
    return this.rex(":ampm", i, /[ \t]*(am|pm|noon|midday|midnight)/i);
  }
  dark(this: ModuleMethods, i: Input): Tree {
    return this.rex(":dark", i, /[ \t]*dark/i);
  }

  digitalH(this: ModuleMethods, i: Input): Tree {
    return this.rex(":digital_h", i, /(2[0-4]|[0-1]?[0-9]):([0-5][0-9])/i);
  }
  digitalHour(this: ModuleMethods, i: Input): Tree {
    return this.seq(":digital_hour", i, ":digitalH", ":ampm", "?");
  }

  simpleH(this: ModuleMethods, i: Input): Tree {
    return this.rex(
      ":simple_h",
      i,
      new RegExp(
        Array.from({ length: 25 }, (_, k) => k)
          .reverse()
          .join("|"),
      ),
    );
  }
  simpleHour(this: ModuleMethods, i: Input): Tree {
    return this.seq(":simple_hour", i, ":simpleH", ":ampm", "?");
  }

  namedM(this: ModuleMethods, i: Input): Tree {
    return this.rex(":named_m", i, Parser.NAMED_M_REX);
  }
  namedMin(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":_space", ":namedM");
  }

  namedH(this: ModuleMethods, i: Input): Tree {
    return this.rex(":named_h", i, Parser.NAMED_H_REX);
  }
  namedHour(this: ModuleMethods, i: Input): Tree {
    return this.seq(":named_hour", i, ":namedH", ":dark", "?", ":namedMin", "?", ":ampm", "?");
  }

  _point(this: ModuleMethods, i: Input): Tree {
    return this.rex(":point", i, Parser.POINT_REX);
  }

  counts(this: ModuleMethods, i: Input): Tree {
    return this.jseq(null, i, ":count", ":_andOrOrOrComma");
  }

  atP(this: ModuleMethods, i: Input): Tree {
    return this.seq(":at_p", i, ":_point", ":counts");
  }
  atPoint(this: ModuleMethods, i: Input): Tree {
    return this.jseq(null, i, ":atP", ":_andOrOr");
  }

  atObject(this: ModuleMethods, i: Input): Tree {
    return this.alt(null, i, ":namedHour", ":digitalHour", ":simpleHour", ":atPoint");
  }
  atObjects(this: ModuleMethods, i: Input): Tree {
    return this.jseq(null, i, ":atObject", ":_andOrOrOrComma");
  }

  at(this: ModuleMethods, i: Input): Tree {
    return this.seq(":at", i, ":_at", "?", ":atObjects");
  }

  interval(this: ModuleMethods, i: Input): Tree {
    return this.rex(":interval", i, Parser.INTERVAL_REX);
  }

  everyInterval(this: ModuleMethods, i: Input): Tree {
    return this.seq(":every_interval", i, ":count", "?", ":interval");
  }

  everySingleInterval(this: ModuleMethods, i: Input): Tree {
    return this.rex(":every_single_interval", i, /(1[ \t]+)?(week|year)/);
  }

  toWeekday(this: ModuleMethods, i: Input): Tree {
    return this.seq(":to_weekday", i, ":weekday", ":_toOrDash", ":weekday");
  }

  weekdayRange(this: ModuleMethods, i: Input): Tree {
    return this.alt(null, i, ":toWeekday", ":weekdays");
  }

  toOmonthday(this: ModuleMethods, i: Input): Tree {
    return this.seq(
      ":to_omonthday",
      i,
      ":_the",
      "?",
      ":omonthday",
      ":_to",
      ":_the",
      "?",
      ":omonthday",
    );
  }

  toHour(this: ModuleMethods, i: Input): Tree {
    return this.seq(":to_hour", i, ":atObject", ":_to", ":atObject");
  }

  fromObject(this: ModuleMethods, i: Input): Tree {
    return this.alt(null, i, ":toWeekday", ":toOmonthday", ":toHour");
  }
  fromObjects(this: ModuleMethods, i: Input): Tree {
    return this.jseq(null, i, ":fromObject", ":_andOrOr");
  }
  from(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":_from", "?", ":fromObjects");
  }

  everyWeekday(this: ModuleMethods, i: Input): Tree {
    return this.jseq(null, i, ":weekdayRange", ":_andOrOr");
  }

  otm(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /[ \t]+of the month/);
  }

  everyOfTheMonth(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":omonthdays", ":otm");
  }

  everyNamed(this: ModuleMethods, i: Input): Tree {
    return this.rex(":every_named", i, /weekday/i);
  }

  everyObject(this: ModuleMethods, i: Input): Tree {
    return this.alt(
      null,
      i,
      ":everyWeekday",
      ":everyOfTheMonth",
      ":everyInterval",
      ":everyNamed",
      ":everySingleInterval",
    );
  }
  everyObjects(this: ModuleMethods, i: Input): Tree {
    return this.jseq(null, i, ":everyObject", ":_andOrOr");
  }

  every(this: ModuleMethods, i: Input): Tree {
    return this.seq(":every", i, ":_every", ":everyObjects");
  }

  natElt(this: ModuleMethods, i: Input): Tree {
    return this.alt(null, i, ":every", ":from", ":at", ":tzone", ":on");
  }
  nat(this: ModuleMethods, i: Input): Tree {
    return this.jseq(":nat", i, ":natElt", ":_sep");
  }

  slot(key: string, data0: unknown, data1: unknown = null, opts: unknown = null): Slot {
    return new Slot(key, data0, data1, opts);
  }

  _rewriteSubs(this: ModuleMethods, t: Tree, key: string | null = null): unknown[] {
    return t.subgather(key).map((ct) => this.rewrite(ct));
  }
  _rewriteSub(this: ModuleMethods, t: Tree, key: string | null = null): unknown {
    const st = t.sublookup(key);
    return st ? this.rewrite(st) : null;
  }

  rewriteDmin(t: Tree): string {
    return t.strinp();
  }

  rewriteOnMinutes(this: Parser, t: Tree): Slot {
    const mins = t.subgather(":dmin").map((e) => e.strinp());
    return this.slot(":hm", "*", mins.join(","), { strong: 1 });
  }

  rewriteOnThex(this: Parser, t: Tree): Slot {
    const s = t.string();
    if (/hour/i.test(s)) {
      return this.slot(":hm", 0, "*", { strong: 0 });
    } else {
      return this.slot(":hm", "*", "*", { strong: 1 });
    }
  }

  rewriteOnThes(this: Parser & ModuleMethods, t: Tree): unknown[] {
    return this._rewriteSubs(t, ":omonthday");
  }
  rewriteOnDays(this: Parser & ModuleMethods, t: Tree): unknown[] {
    return this._rewriteSubs(t, ":monthday");
  }

  rewriteOn(this: Parser & ModuleMethods, t: Tree): unknown[] {
    return this._rewriteSubs(t);
  }

  rewriteMonthday(this: Parser, t: Tree): Slot {
    return this.slot(":monthday", toI(t.string()));
  }

  rewriteOmonthday(this: Parser, t: Tree): Slot {
    return this.slot(":monthday", Parser.OMONTHDAYS[t.string().toLowerCase()] ?? null);
  }

  rewriteAtP(this: Parser, t: Tree): Slot {
    let pt = t.sublookup(":point")!.strinpd();
    pt = pt.startsWith("mon") ? "M" : pt.slice(0, 1);
    const pts = t.subgather(":count").map((e) => toI(e.string()));
    switch (pt) {
      case "m":
        return this.slot(":hm", "*", pts, { strong: 1 });
      case "s":
        return this.slot(":second", pts);
      default:
        return this.slot(stringToSym(pt), pts);
    }
  }

  rewriteEverySingleInterval(this: Parser, t: Tree): Slot | Slot[] {
    if (/year/i.test(t.string())) {
      return [this.slot(":month", 1, ":weak"), this.slot(":monthday", 1, ":weak")];
    } else {
      return this.slot(":weekday", 0, ":weak");
    }
  }

  rewriteEveryInterval(this: Parser, t: Tree): Slot | Record<string, never> {
    const ci = t.subgather(null).map((e) => e.string());
    let i = ci.pop()!.trim().slice(0, 3);
    const c = (ci.pop() ?? "1").trim();
    i = i === "M" || i.toLowerCase() === "mon" ? "M" : i.slice(0, 1).toLowerCase();
    const cc = c === "1" ? "*" : `*/${c}`;

    switch (i) {
      case "M":
        return this.slot(":month", cc);
      case "d":
        return this.slot(":monthday", cc, ":weak");
      case "h":
        return this.slot(":hm", cc, 0, { weak: 1 });
      case "m":
        return this.slot(":hm", "*", cc, { strong: 1 });
      case "s":
        return this.slot(":second", cc);
      default:
        return {};
    }
  }

  rewriteEveryNamed(this: Parser, t: Tree): Slot {
    const s = t.string();
    if (/weekday/i.test(s)) {
      return this.slot(":weekday", "1-5", ":weak");
    } else if (/week/i.test(s)) {
      return this.slot(":weekday", "0", ":weak");
    } else {
      throw new RuntimeError(`cannot rewrite ${rbInspect(s)}`);
    }
  }

  rewriteTz(this: Parser, t: Tree): Slot {
    return this.slot(":tz", t.string());
  }

  rewriteWeekday(t: Tree): number | null {
    const i = CronParser.WEEKDS.indexOf(t.string().slice(0, 3).toLowerCase());
    return i < 0 ? null : i;
  }

  rewriteWeekdays(this: Parser & ModuleMethods, t: Tree): Slot {
    return this.slot(":weekday", this._rewriteSubs(t, ":weekday"));
  }
  rewriteOnWeekdays(this: Parser & ModuleMethods, t: Tree): Slot {
    return this.rewriteWeekdays(t);
  }

  rewriteToWeekday(this: Parser & ModuleMethods, t: Tree): Slot {
    const [wd0, wd1] = this._rewriteSubs(t, ":weekday");
    return this.slot(":weekday", `${toS(wd0)}-${toS(wd1)}`);
  }

  rewriteToOmonthday(this: Parser & ModuleMethods, t: Tree): Slot {
    const [md0, md1] = (this._rewriteSubs(t, ":omonthday") as Slot[]).map((e) => e._data0);
    return this.slot(":monthday", `${toS(md0)}-${toS(md1)}`);
  }

  adjustH(h: number, _m: unknown, ap: string | null): number {
    if (ap === "midnight" && h === 12) {
      return 24;
    } else if (ap === "pm" && h < 12) {
      return h + 12;
    } else if (ap === "am" && h === 12) {
      return 0;
    } else {
      return h;
    }
  }

  rewriteDigitalHour(this: Parser, t: Tree): Slot {
    const [h0, m] = t
      .sublookup(":digital_h")!
      .strinpd()
      .split(":")
      .map((e) => toI(e) as number);
    const ap = t.sublookup(":ampm");
    const h = this.adjustH(h0, m, ap && ap.strinpd());

    return this.slot(":hm", h, m);
  }

  rewriteSimpleHour(this: Parser, t: Tree): Slot {
    const [hs, ap] = t.subgather(null).map((e) => e.strinpd());
    const h = this.adjustH(toI(hs) as number, 0, ap ?? null);

    return this.slot(":hm", h, 0);
  }

  rewriteNamedHour(this: Parser, t: Tree): Slot {
    const ht = t.sublookup(":named_h")!;
    const mt = t.sublookup(":named_m");
    const apt = t.sublookup(":ampm");

    const hs = ht.strinp();
    const ms: string | number = mt ? mt.strinp() : 0;
    let h = Parser.NHOURS[hs];
    const m = Parser.NMINUTES[ms] ?? ms;

    h = this.adjustH(h, m, apt && apt.strinpd());

    return this.slot(":hm", h, m);
  }

  rewriteToHour(this: Parser & ModuleMethods, t: Tree): Slot {
    const [ht0, ht1] = t.subgather(null);
    const [h0, h1] = [this.rewrite(ht0) as Slot, this.rewrite(ht1) as Slot];
    if (!rbEqual(h0.data1(), h1.data1())) {
      throw new ArgumentError(
        `cannot deal with ${ht0.strinp()} to ${ht1.strinp()}, minutes diverge`,
      );
    }
    return this.slot(":hm", `${toS(h0._data0)}-${toS(h1._data0)}`, 0, { strong: 0 });
  }

  rewriteAt(this: Parser & ModuleMethods, t: Tree): unknown[] {
    return this._rewriteSubs(t);
  }

  rewriteEvery(this: Parser & ModuleMethods, t: Tree): unknown {
    return this._rewriteSub(t);
  }

  rewriteNat(this: Parser & ModuleMethods, t: Tree): SlotGroup {
    return new SlotGroup(flatten(this._rewriteSubs(t)) as Slot[]);
  }

  static {
    include(this, Raabro);
    for (const name of Object.getOwnPropertyNames(this.prototype)) {
      if (name !== "constructor") (this as unknown as ModuleMethods).methodAdded(name);
    }
  }
}

export class Slot {
  declare key: string;
  declare _data0: unknown;
  declare _data1: unknown;
  /** @internal */
  declare protected _opts: SlotOpts;
  /** @internal */
  declare protected _data0Memo: unknown[] | undefined;
  /** @internal */
  declare protected _data1Memo: unknown[] | undefined;

  static toString(): string {
    return "Fugit::Nat::Slot";
  }

  constructor(key: string, d0: unknown, d1: unknown = null, opts: unknown = null) {
    [d1, opts] = isSymbol(d1) ? [null, d1] : [d1, opts];
    [this.key, this._data0, this._data1] = [key, d0, d1];
    this._opts = ((isSymbol(opts) ? { [opts.slice(1)]: true } : opts) ?? {}) as SlotOpts;
  }
  data0(): unknown[] {
    return (this._data0Memo ||= rbFArray(this._data0));
  }
  data1(): unknown[] {
    return (this._data1Memo ||= rbFArray(this._data1));
  }
  weak(): unknown {
    return this._opts.weak;
  }
  strong(): unknown {
    return this._opts.strong;
  }
  isGraded(): unknown {
    const w = this.weak();
    return w != null && w !== false ? w : this.strong();
  }
  append(slot: Slot): this {
    [this._data0, this._data1] = [this.conflate(0, slot), this.conflate(1, slot)];
    for (const k of Object.keys(this._opts)) delete this._opts[k as keyof SlotOpts];
    return this;
  }
  inspect(): string {
    const a: unknown[] = [this.key, this._data0];
    if (this._data1 != null) a.push(this._data1);
    if (this._opts && Object.keys(this._opts).length > 0) a.push(this._opts);
    return `(slot ${a.map((e) => rbInspect(e)).join(" ")})`;
  }
  a(): [unknown[], unknown[]] {
    return [this.data0(), this.data1()];
  }
  /** @internal */
  protected toA(x: unknown): unknown[] {
    if (x === "*") return [];
    return rbFArray(x);
  }
  /** @internal */
  protected conflate(index: number, slot: Slot): unknown {
    const [a, b] = index === 0 ? [this._data0, slot._data0] : [this._data1, slot._data1];
    if (b == null) return a;
    if (a == null) return b;
    let ra: [number, number] | null | false;
    let rb: [number, number] | null | false;
    if ((ra = index === 0 && slot.strong() === 1 && this.hourRange())) {
      const [h0, h1] = [ra[0], ra[1] - 1];
      return h0 === h1 ? h0 : `${h0}-${h1}`;
    } else if ((rb = index === 0 && this.strong() === 1 && slot.hourRange())) {
      const [h0, h1] = [rb[0], rb[1] - 1];
      return h0 === h1 ? h0 : `${h0}-${h1}`;
    }
    if (this.strong() === index || this.strong() === true) return a;
    if (slot.strong() === index || slot.strong() === true) return b;
    if (slot.weak() === index || slot.weak() === true) return a;
    if (this.weak() === index || this.weak() === true) return b;
    if (a === "*" && b === "*") return ["*"];
    return [...this.toA(a), ...this.toA(b)];
  }
  /** @internal */
  protected hourRange(): [number, number] | null {
    const m =
      this.key === ":hm" &&
      rbEqual(this._data1, 0) &&
      (this._data0 as string).match(/^(\d+)-(\d+)$/);
    return m ? [toI(m[1]) as number, toI(m[2]) as number] : null;
  }
}

export class SlotGroup {
  /** @internal */
  declare protected _slots: Record<string, Slot>;
  /** @internal */
  declare protected _hms: Slot[];

  static toString(): string {
    return "Fugit::Nat::SlotGroup";
  }

  constructor(slots: Slot[]) {
    this._slots = {};
    this._hms = [];

    for (const s of slots) {
      let hs: Slot | undefined;
      if (s.key === ":hm") {
        this._hms.push(s);
      } else if ((hs = this._slots[s.key])) {
        hs.append(s);
      } else {
        this._slots[s.key] = s;
      }
    }

    if (this._slots[":monthday"] || this._slots[":weekday"]) {
      if (this._hms.length === 0) this._hms.push(this.makeSlot(":hm", 0, 0));
    } else if (this._slots[":month"]) {
      if (this._hms.length === 0) this._hms.push(this.makeSlot(":hm", 0, 0));
      this._slots[":monthday"] ||= this.makeSlot(":monthday", 1);
    }
  }

  toCrons(opts: NatOptions): Cron | Cron[] | null {
    const multi = Object.hasOwn(opts, "multi") ? opts.multi : false;

    const hms = this.determineHms();

    if (multi === ":fail" && hms.length > 1) {
      throw new ArgumentError(
        `multiple crons in ${rbInspect(opts._s)} - ${rbInspect(this._slots)}`,
      );
    } else if (multi === true) {
      return hms.map((hm) => this.parseCron(hm, opts)) as Cron[];
    } else {
      return this.parseCron(hms[0], opts);
    }
  }

  /** @internal */
  protected makeSlot(key: string, data0: unknown, data1: unknown = null): Slot {
    return new Slot(key, data0, data1);
  }

  /** @internal */
  protected determineHms(): Hm[] {
    if (this._hms.length === 0) return [[["*"], ["*"]]];

    const hms = [...this._hms];
    let ig: number | false | undefined;
    while (
      (ig =
        hms.length > 1 &&
        hms.findIndex((hm) => {
          const g = hm.isGraded();
          return g != null && g !== false;
        })) !== false &&
      ig !== -1
    ) {
      const sg = hms[ig];
      const so = deleteAt(hms, ig === 0 ? 1 : ig - 1)!;
      sg.append(so);
    }

    const byMinute = hms
      .map((e) => e.a())
      .reduce((r, hm) => {
        for (const m of hm[1]) {
          if (!r.has(m)) r.set(m, []);
          r.get(m)!.push(...hm[0]);
        }
        return r;
      }, new Hash<unknown, unknown[]>());
    const byHours = [...byMinute].reduce((r, [m, hs]) => {
      const k = sort(hs);
      if (!r.has(k)) r.set(k, []);
      r.get(k)!.push(m);
      return r;
    }, new Hash<unknown[], unknown[]>());
    return byHours.toA() as Hm[];
  }

  /** @internal */
  protected parseCron(hm: Hm, opts: NatOptions): Cron | null {
    const a: unknown[][] = [
      this.slot(":second", "0"),
      hm[1],
      hm[0],
      this.slot(":monthday", "*"),
      this.slot(":month", "*"),
      this.slot(":weekday", "*"),
    ];
    const tz = this._slots[":tz"];
    if (tz) a.push(tz.data0());
    if (rbEqual(a[0], ["0"])) a.shift();

    const lettersLast = (x: unknown): number =>
      typeof x === "number" || x instanceof Number ? (x as number) : 999_999;

    const s = a
      .map((e) =>
        sortBy(uniq(e), lettersLast)
          .map((x) => toS(x))
          .join(","),
      )
      .join(" ");

    const c = Cron.parse(s);

    if (opts.strict != null && opts.strict !== false) {
      return this.restrict(a, c);
    } else {
      return c;
    }
  }

  /** @internal */
  protected restrict(a: unknown[][], cron: Cron | null): Cron | null {
    const a10 = a[1] != null ? a[1][0] : null;
    const m = (a10 != null && a10 !== false ? (a10 as string) : "").match(/^(\d+|\*)\/(\d+)$/);
    if (m) {
      const sla = toI(m[1]) as number;
      if (![1, 2, 3, 4, 5, 6, 8, 12].includes(sla)) return null;
    }

    return cron;
  }

  /** @internal */
  protected slot(key: string, dflt: unknown): unknown[] {
    const s = this._slots[key];
    return s ? s.data0() : [dflt];
  }
}

Nat.Parser = Parser as typeof Nat.Parser;
Nat.Slot = Slot;
Nat.SlotGroup = SlotGroup;
Fugit.Nat = Nat;
