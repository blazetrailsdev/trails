import { EtOrbi, EoTime } from "@blazetrails/et-orbi";
import { Raabro, type Input, type ModuleMethods, type Tree } from "@blazetrails/raabro";
import {
  ArgumentError,
  Enumerable,
  Range,
  RuntimeError,
  classModule,
  eachCons,
  fixMod,
  first,
  flatten,
  hashAref,
  include,
  isAny,
  isSymbol,
  max,
  min,
  product,
  rbCmpint,
  rbEqual,
  rbHash,
  rbInspect,
  rbModDefineMethod,
  rbObjDup,
  rbSetClassPathString,
  sort,
  strip,
  toF,
  toI,
  toS,
  uniq,
} from "@blazetrails/ruby-compat";
import { TZInfo, type Timezone } from "@blazetrails/tzinfo";
import { Duration } from "./duration.js";
import { DAY_S, YEAR_S } from "./misc.js";
import { Fugit } from "./namespaces.js";

export type CronWeekday = [number] | [number, number] | [number, [number, number]];

type CronElt = [
  number | null,
  number | null,
  number | null,
  number | null,
  [number, number] | null,
];

export interface CronHash {
  sec?: CronElt[];
  min?: CronElt[];
  hou?: CronElt[];
  dom?: CronElt[];
  mon?: CronElt[];
  dow?: CronElt[];
  tz?: [string, Timezone | null];
  "&"?: boolean;
}

export class Cron {
  declare static Parser: typeof Parser & ModuleMethods & Parser;

  static SPECIALS: Readonly<Record<string, string>> = Object.freeze({
    "@reboot": ":reboot",
    "@yearly": "0 0 1 1 *",
    "@annually": "0 0 1 1 *",
    "@monthly": "0 0 1 * *",
    "@weekly": "0 0 * * 0",
    "@daily": "0 0 * * *",
    "@midnight": "0 0 * * *",
    "@noon": "0 12 * * *",
    "@hourly": "0 * * * *",
  });
  static MAXDAYS: readonly (number | null)[] = Object.freeze([
    null,
    31,
    29,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ]);

  declare original: string;
  declare zone: string | null;

  declare seconds: number[] | null;
  declare minutes: number[] | null;
  declare hours: number[] | null;
  declare monthdays: number[] | null;
  declare months: number[] | null;
  declare weekdays: CronWeekday[] | null;
  declare timezone: Timezone | null;

  /** @internal */
  declare protected _cronS: string | null;
  /** @internal */
  declare protected _dayAnd: boolean | undefined;

  constructor(original: unknown) {
    return Cron.parse(original) as this;
  }

  static parse(s: unknown): Cron | null {
    if (s instanceof this) return s;

    s = hashAref(this.SPECIALS, s) ?? s;

    if (typeof s !== "string" || isSymbol(s as unknown)) return null;

    const h = Cron.Parser.parse(strip(s)) as CronHash | null;

    return (Object.create(this.prototype) as Cron).init(s, h);
  }

  static doParse(s: unknown): Cron {
    const c = this.parse(s);
    if (c != null) return c;
    throw new ArgumentError(`invalid cron string ${this.trunc(s)}`);
  }

  /** @internal */
  protected static trunc(s: unknown): string {
    if (typeof s === "string") {
      const r = s.length > 28 ? `${s.slice(0, 28)}... len ${s.length}` : s;
      return rbInspect(r);
    } else {
      const r = rbInspect(s);
      return r.length > 35 ? `${(s as string).slice(0, 35)}...` : r;
    }
  }

  toCronS(): string {
    return (this._cronS ??= [
      rbEqual(this.seconds, [0]) ? null : (this.seconds ?? ["*"]).join(","),
      (this.minutes ?? ["*"]).join(","),
      (this.hours ?? ["*"]).join(","),
      (this.monthdays ?? ["*"]).join(","),
      (this.months ?? ["*"]).join(","),
      this.weekdaysToCronS(),
      this.timezone ? this.timezone.name : null,
    ]
      .filter((e) => e != null)
      .join(" "));
  }

  isMonthMatch(nt: TimeCursor | EoTime): boolean {
    return !this.months || this.months.includes(nt.month());
  }
  isHourMatch(nt: TimeCursor | EoTime): boolean {
    return !this.hours || this.hours.includes(nt.hour());
  }
  isMinMatch(nt: TimeCursor | EoTime): boolean {
    return !this.minutes || this.minutes.includes(nt.min());
  }
  isSecMatch(nt: TimeCursor | EoTime): boolean {
    return !this.seconds || this.seconds.includes(nt.sec());
  }

  isWeekdayHashMatch(nt: TimeCursor | EoTime, hsh: number): boolean {
    const [phsh, nhsh] = nt.wdayInMonth();

    if (hsh > 0) {
      return hsh === phsh;
    } else {
      return hsh === nhsh;
    }
  }

  isWeekdayModuloMatch(nt: TimeCursor | EoTime, mod: [number, number]): boolean {
    return fixMod(nt.rweek(), mod[0]) === fixMod(mod[1], mod[0]);
  }

  isWeekdayMatch(nt: TimeCursor | EoTime): boolean {
    if (this.weekdays == null) return true;

    const [wd, hom] = this.weekdays.find(([d]) => d === nt.wday()) ?? [];

    if (wd == null) return false;
    if (hom == null) return true;

    if (Array.isArray(hom)) {
      return this.isWeekdayModuloMatch(nt, hom);
    } else {
      return this.isWeekdayHashMatch(nt, hom);
    }
  }

  isMonthdayMatch(nt: TimeCursor | EoTime): boolean {
    if (this.monthdays == null) return true;

    const last =
      new TimeCursor(this, nt)
        .incMonth()
        .time()
        .minus(24 * 3600)
        .day() + 1;

    return this.monthdays.map((d) => (d < 1 ? last + d : d)).includes(nt.day());
  }

  isDayMatch(nt: TimeCursor | EoTime): boolean {
    if (this.weekdays && this.monthdays) {
      if (this._dayAnd) return this.isWeekdayMatch(nt) && this.isMonthdayMatch(nt);

      return this.isWeekdayMatch(nt) || this.isMonthdayMatch(nt);
    }

    if (!this.isWeekdayMatch(nt)) return false;
    if (!this.isMonthdayMatch(nt)) return false;

    return true;
  }

  isMatch(t: unknown): boolean {
    t = Fugit.doParseAt(t).translate(this.timezone);

    return (
      this.isMonthMatch(t as EoTime) &&
      this.isDayMatch(t as EoTime) &&
      this.isHourMatch(t as EoTime) &&
      this.isMinMatch(t as EoTime) &&
      this.isSecMatch(t as EoTime)
    );
  }

  static MAX_ITERATION_COUNT = 2048;

  nextTime(from: unknown = EoTime.now()): EoTime {
    let efrom = EtOrbi.makeTime(from);
    let sfrom = efrom.strftime("%F|%T");
    let ifrom = efrom.toI();

    let i = 0;
    const t = new TimeCursor(this, efrom.translate(this.timezone));

    let zfrom = t.time().strftime("%z|%Z");

    for (;;) {
      if ((i += 1) > Cron.MAX_ITERATION_COUNT) {
        throw new RuntimeError(
          `too many loops for ${rbInspect(this.original)} #next_time, breaking, ` +
            "cron expression most likely invalid (Feb 30th like?), " +
            "please fill an issue at https://git.io/fjJC9",
        );
      }

      if (ifrom === t.toI()) {
        t.inc(1);
        continue;
      }
      if (!this.isMonthMatch(t)) {
        t.incMonth();
        continue;
      }
      if (!this.isDayMatch(t)) {
        t.incDay();
        continue;
      }
      if (!this.isHourMatch(t)) {
        t.incHour();
        continue;
      }
      if (!this.isMinMatch(t)) {
        t.incMin();
        continue;
      }
      if (!this.isSecMatch(t)) {
        t.incSec();
        continue;
      }

      const tt = t.time();
      const st = tt.strftime("%F|%T");
      const zt = tt.strftime("%z|%Z");
      if (st === sfrom && zt !== zfrom) {
        [efrom, sfrom, zfrom, ifrom] = [tt, st, zt, t.toI()];
        continue;
      }

      break;
    }

    return t.time().translate(efrom.zone);
  }

  previousTime(from: unknown = EoTime.now()): EoTime {
    const efrom = EtOrbi.makeTime(from);

    let i = 0;
    const t = new TimeCursor(this, efrom.minus(1).translate(this.timezone));

    for (;;) {
      if ((i += 1) > Cron.MAX_ITERATION_COUNT) {
        throw new RuntimeError(
          `too many loops for ${rbInspect(this.original)} #previous_time, breaking, ` +
            "cron expression most likely invalid (Feb 30th like?), " +
            "please fill an issue at https://git.io/fjJCQ",
        );
      }

      if (!this.isMonthMatch(t)) {
        t.decMonth();
        continue;
      }
      if (!this.isDayMatch(t)) {
        t.decDay();
        continue;
      }
      if (!this.isHourMatch(t)) {
        t.decHour();
        continue;
      }
      if (!this.isMinMatch(t)) {
        t.decMin();
        continue;
      }
      if (!this.isSecMatch(t)) {
        t.decSec();
        continue;
      }
      break;
    }

    return t.time().translate(efrom.zone);
  }

  next(from: unknown = EoTime.now()): CronIterator {
    return new CronIterator(this, ":nextTime", from);
  }

  prev(from: unknown = EoTime.now()): CronIterator {
    return new CronIterator(this, ":previousTime", from);
  }

  within(timeRange: unknown, timeEnd: unknown = null): EoTime[] {
    const [sta, ned] =
      timeRange instanceof Range
        ? [timeRange.begin, timeRange.end]
        : [EtOrbi.makeTime(timeRange), EtOrbi.makeTime(timeEnd)];

    return new CronIterator(this, ":nextTime", sta).takeWhile(
      (eot: EoTime) => rbCmpint(eot.toT().compare(ned), eot.toT(), ned) < 0,
    );
  }

  bruteFrequency(year = 2017): Frequency {
    return (Cron.FREQUENCY_CACHE[`${this.toCronS()}|${year}`] ??= (() => {
      const deltas: number[] = [];

      let t = EtOrbi.makeTime(`${year}-01-01`).minus(1);
      let t0: EoTime | null = null;
      let t1: EoTime;

      for (;;) {
        t1 = this.nextTime(t);
        if (t0) deltas.push(toI(t1.minus(t)) as number);
        t0 ??= t1;
        if (deltas.length > 0 && t1.year() > year) break;
        if (t1.year() - t0.year() > 7) break;
        t = t1;
      }

      return new Frequency(deltas, t1.minus(t0));
    })());
  }

  static SLOTS: readonly (readonly ["seconds" | "minutes" | "hours" | "days", number, number])[] =
    Object.freeze([
      ["seconds", 1, 60],
      ["minutes", 60, 60],
      ["hours", 3600, 24],
      ["days", DAY_S, 365],
    ] as const);

  roughFrequency(): number {
    const slots = Cron.SLOTS.map(
      ([k, v0, v1]) => [k, v0, v1, k === "days" ? this.roughDays() : this[k]] as const,
    );

    for (const [_k, v0, _, a] of slots) {
      if (rbEqual(a, [0])) continue;
      if (a != null) break;
      if (a == null) return v0;
    }

    for (const [_k, v0, v1, a] of slots) {
      if (!(a && a.length > 1)) continue;
      return (
        min(
          eachCons([...a, a[0] + v1], 2)
            .map(([a0, a1]) => a1 - a0)
            .filter((d) => d > 0),
        )! * v0
      );
    }

    for (const [_k, v0, v1, a] of [...slots].reverse()) {
      if (a && a.length === 1) return v0 * v1;
    }

    return 1;
  }

  toA(): [
    number[] | null,
    number[] | null,
    number[] | null,
    number[] | null,
    number[] | null,
    CronWeekday[] | null,
  ] {
    return [this.seconds, this.minutes, this.hours, this.monthdays, this.months, this.weekdays];
  }

  toH(): {
    seconds: number[] | null;
    minutes: number[] | null;
    hours: number[] | null;
    monthdays: number[] | null;
    months: number[] | null;
    weekdays: CronWeekday[] | null;
  } {
    return {
      seconds: this.seconds,
      minutes: this.minutes,
      hours: this.hours,
      monthdays: this.monthdays,
      months: this.months,
      weekdays: this.weekdays,
    };
  }

  equals(o: unknown): boolean {
    return o instanceof Cron && rbEqual(o.toA(), this.toA());
  }
  eql(o: unknown): boolean {
    return this.equals(o);
  }

  hash(): number {
    return rbHash(this.toA());
  }

  /** @internal */
  protected compactMonthDays(): boolean {
    if (this.months == null || this.monthdays == null) return true;

    const [ms, ds] = this.months.reduce<[number[], number[]]>(
      (a, m) => {
        for (const d of this.monthdays!) {
          if (d > Cron.MAXDAYS[m]!) continue;
          a[0].push(m);
          a[1].push(d);
        }
        return a;
      },
      [[], []],
    );
    this.months = uniq(ms);
    this.monthdays = uniq(ds);

    return isAny(this.months) && isAny(this.monthdays);
  }

  /** @internal */
  protected roughDays(): number[] | null {
    if (this.weekdays == null && this.monthdays == null) return null;

    const months = this.months ?? new Range(1, 12).toA();

    const monthdays = product(months, this.monthdays ?? []).map(([m, d]) => {
      if (d < 0) d = 31 + d;
      return (m - 1) * 30 + d;
    });

    let weekdays = flatten(
      (this.weekdays ?? []).map(([d, w]) =>
        w != null ? d + ((w as number) - 1) * 7 : new Range(0, 3).toA().map((ww) => d + ww * 7),
      ),
    ) as number[];
    weekdays = product(months, weekdays).map(([m, d]) => (m - 1) * 30 + d);

    return sort([...monthdays, ...weekdays]);
  }

  static FREQUENCY_CACHE: Record<string, Frequency> = {};

  /** @internal */
  protected init(original: string, h: CronHash | null): this | null {
    if (!h) return null;

    this.original = original;
    this._cronS = null;
    this._dayAnd = h["&"];

    const valid =
      this.determineSeconds(h.sec) &&
      this.determineMinutes(h.min) &&
      this.determineHours(h.hou) &&
      this.determineMonthdays(h.dom) &&
      this.determineMonths(h.mon) &&
      this.determineWeekdays(h.dow!) &&
      this.determineTimezone(h.tz);

    if (!valid) return null;
    if (!this.compactMonthDays()) return null;

    return this;
  }

  /** @internal */
  protected expand(min: number, max: number, r: CronElt): number | (number | null)[] | null {
    let [sta, edn, sla] = r;

    if (sla != null && edn == null) edn = max;

    if (sta == null && edn == null && sla == null) return null;
    if (sta != null && edn == null) return sta;

    if (sla == null) sla = 1;
    if (sta == null) sta = min;
    if (edn == null || (edn < 0 && sta > 0)) edn = max;

    return this.range(min, max, sta, edn, sla);
  }

  /** @internal */
  protected range(
    min: number,
    max: number,
    sta: number,
    edn: number,
    sla: number,
  ): (number | null)[] {
    if (sta === min && edn === max && sla === 1) return [null];

    if ((sta < 0 && edn > 0) || (edn < 0 && sta > 0)) {
      throw new ArgumentError(
        "both start and end must be negative in " + rbInspect({ min, max, sta, edn, sla }),
      );
    }

    const a: number[] = [];

    const [omin, omax] = [min, max];
    if (sta < 0) [min, max] = [-max, -1];

    let cur = sta;

    for (;;) {
      a.push(cur);
      if (cur === edn) break;

      cur += 1;
      if (cur > max) {
        cur = min;
        if (edn > max) edn = edn - max - 1;
      }

      if (a.length > 2 * omax) {
        throw new RuntimeError(
          "too many loops for " +
            rbInspect({ min: omin, max: omax, sta, edn, sla }) +
            " #range, breaking, " +
            "please fill an issue at https://git.io/fjJC9",
        );
      }
    }

    return uniq(
      a
        .map((e, i) => [e, i] as const)
        .filter(([_e, i]) => i % sla === 0)
        .map(([e]) => e),
    );
  }

  /** @internal */
  protected doDetermine(
    key: string,
    arr: CronElt[] | undefined,
    min: number,
    max: number,
  ): number[] | null | false {
    let nul = false;

    const r: number[] = [];
    for (const e of flatten(arr!.map((v) => [this.expand(min, max, v)])) as (
      | number
      | null
      | false
    )[]) {
      if (e === false) return false;
      nul = nul || e == null;
      r.push(key === ":hours" && e === 24 ? 0 : e!);
    }

    if (nul) return null;
    return sort(uniq(r));
  }

  /** @internal */
  protected determineSeconds(arr: CronElt[] | undefined): boolean {
    return (
      (this.seconds = this.doDetermine(":seconds", arr ?? [[0, null, null, null, null]], 0, 59) as
        | number[]
        | null) !== (false as unknown)
    );
  }

  /** @internal */
  protected determineMinutes(arr: CronElt[] | undefined): boolean {
    return (
      (this.minutes = this.doDetermine(":minutes", arr, 0, 59) as number[] | null) !==
      (false as unknown)
    );
  }

  /** @internal */
  protected determineHours(arr: CronElt[] | undefined): boolean {
    return (
      (this.hours = this.doDetermine(":hours", arr, 0, 23) as number[] | null) !==
      (false as unknown)
    );
  }

  /** @internal */
  protected determineMonthdays(arr: CronElt[] | undefined): boolean {
    return (
      (this.monthdays = this.doDetermine(":monthdays", arr, 1, 31) as number[] | null) !==
      (false as unknown)
    );
  }

  /** @internal */
  protected determineMonths(arr: CronElt[] | undefined): boolean {
    return (
      (this.months = this.doDetermine(":months", arr, 1, 12) as number[] | null) !==
      (false as unknown)
    );
  }

  /** @internal */
  protected determineWeekdays(arr: CronElt[]): boolean {
    let weekdays: CronWeekday[] = [];

    for (const elt of arr) {
      const [a, , sl, ha, mo] = elt;
      let z = elt[1];
      if (ha != null || mo != null) {
        weekdays.push([a!, (ha ?? mo)!] as CronWeekday);
      } else if (sl != null) {
        for (let i = a ?? 0; i <= (z ?? (a != null ? a : 6)); i += sl < 1 ? 1 : sl) {
          weekdays.push([i]);
        }
      } else if (z != null) {
        if (a! > z) z = z + 7;
        for (let i = a!; i <= z; i++) weekdays.push([i > 6 ? i - 7 : i]);
      } else if (a != null) {
        weekdays.push([a]);
      }
    }

    for (const wd of weekdays) if (wd[0] === 7) wd[0] = 0;
    weekdays = sort(uniq(weekdays));
    this.weekdays = weekdays.length === 0 ? null : weekdays;

    return true;
  }

  /** @internal */
  protected determineTimezone(z: [string, Timezone | null] | undefined): boolean {
    [this.zone, this.timezone] = z ?? [null, null];

    return true;
  }

  /** @internal */
  protected weekdaysToCronS(): string {
    if (!this.weekdays) return "*";

    return this.weekdays
      .map((a) => {
        if (a.length === 1) {
          return toS(a[0]);
        } else if (Array.isArray(a[1])) {
          const a11 = a[1][1];
          const off = a11 < 0 ? toS(a11) : a11 > 0 ? `+${a11}` : "";
          return `${a[0]}%${a[1][0]}` + off;
        } else {
          return a.map((e) => toS(e)).join("#");
        }
      })
      .join(",");
  }
}

export class TimeCursor {
  declare year: () => number;
  declare month: () => number;
  declare day: () => number;
  declare wday: () => number;
  declare hour: () => number;
  declare min: () => number;
  declare sec: () => number;
  declare wdayInMonth: () => [number, number];
  declare rweek: () => number;
  declare rday: () => number;
  /** @internal */
  declare protected _cron: Cron;
  /** @internal */
  declare protected _t: EoTime;

  constructor(cron: Cron, t: EoTime | TimeCursor) {
    this._cron = cron;
    this._t = t instanceof TimeCursor ? t.time() : t;
    this._t.seconds = toI(this._t.seconds) as number;
  }

  time(): EoTime {
    return this._t;
  }
  toT(): EoTime {
    return this._t;
  }
  toI(): number {
    return this._t.toI();
  }

  inc(i: number): this {
    this._t = this._t.plus(i);
    return this;
  }
  dec(i: number): this {
    return this.inc(-i);
  }

  incMonth(): this {
    let y = this._t.year();
    let m = this._t.month() + 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }

    this._t = EtOrbi.make(y, m, this._t.zone);

    return this;
  }

  incDay(): this | undefined {
    this.inc((24 - this._t.hour()) * 3600 - this._t.min() * 60 - this._t.sec());

    if (this._t.hour() === 0) return;

    if (this._t.hour() < 12) {
      try {
        this._t = EtOrbi.make(this._t.year(), this._t.month(), this._t.day(), this._t.zone);
      } catch (e) {
        if (!(e instanceof TZInfo.PeriodNotFound)) throw e;
        return this.inc((24 - this._t.hour()) * 3600);
      }
      return;
    } else {
      return this.inc((24 - this._t.hour()) * 3600);
    }
  }

  incHour(): this {
    return this.inc((60 - this._t.min()) * 60 - this._t.sec());
  }
  incMin(): this {
    return this.inc(60 - this._t.sec());
  }

  incSec(): this {
    const sec = this._cron.seconds!.find((s) => s > this._t.sec());
    if (sec != null) {
      return this.inc(sec - this._t.sec());
    } else {
      return this.inc(60 - this._t.sec() + first(this._cron.seconds!)!);
    }
  }

  decMonth(): this {
    return this.dec(
      (this._t.day() - 1) * DAY_S + this._t.hour() * 3600 + this._t.min() * 60 + this._t.sec() + 1,
    );
  }

  decDay(): this {
    return this.dec(this._t.hour() * 3600 + this._t.min() * 60 + this._t.sec() + 1);
  }
  decHour(): this {
    return this.dec(this._t.min() * 60 + this._t.sec() + 1);
  }
  decMin(): this {
    return this.dec(this._t.sec() + 1);
  }

  decSec(): this {
    const target =
      [...this._cron.seconds!].reverse().find((s) => s < this._t.sec()) ??
      this._cron.seconds![this._cron.seconds!.length - 1];
    return this.inc(target - this._t.sec() - (this._t.sec() > target ? 0 : 60));
  }
}

(
  ["year", "month", "day", "wday", "hour", "min", "sec", "wdayInMonth", "rweek", "rday"] as const
).forEach((k) => {
  rbModDefineMethod(TimeCursor, k, function (this: TimeCursor) {
    return (this as unknown as { _t: EoTime })._t[k]();
  });
});

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include ::Enumerable` (`fugit/lib/fugit/cron.rb:341`); the class/interface merge is how a mixin surfaces on the type side. */
export class CronIterator {
  declare cron: Cron;
  declare start: unknown;
  declare current: unknown;
  declare direction: ":nextTime" | ":previousTime";

  constructor(cron: Cron, direction: ":nextTime" | ":previousTime", start: unknown) {
    this.cron = cron;
    this.start = start;
    this.current = rbObjDup(start);
    this.direction = direction;
  }

  each(block: (t: EoTime) => void): void {
    for (;;) {
      block(
        (this.current = this.cron[this.direction.slice(1) as "nextTime" | "previousTime"](
          this.current,
        )),
      );
    }
  }
}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface CronIterator extends Enumerable<EoTime> {}
/* eslint-enable @typescript-eslint/no-unsafe-declaration-merging */
include(CronIterator, Enumerable);

export class Frequency {
  declare span: number;
  declare deltaMin: number | null;
  declare deltaMax: number | null;
  declare occurrences: number;
  declare spanYears: number;
  declare yearlyOccurrences: number;

  constructor(deltas: number[], span: number) {
    this.span = span;

    this.deltaMin = min(deltas);
    this.deltaMax = max(deltas);
    this.occurrences = deltas.length;
    this.spanYears = span / YEAR_S;
    this.yearlyOccurrences = toF(this.occurrences) / this.spanYears;
  }

  toDebugS(): string {
    return Object.entries({
      dmin: new Duration(this.deltaMin).deflate().toPlainS(),
      dmax: new Duration(this.deltaMax).deflate().toPlainS(),
      ocs: this.occurrences,
      spn: new Duration(toI(this.span)).deflate().toPlainS(),
      spnys: toI(this.spanYears),
      yocs: toI(this.yearlyOccurrences),
    })
      .map(([k, v]) => `${k}: ${toS(v)}`)
      .join(", ");
  }
}

export class Parser {
  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;

  static WEEKDAYS = Object.freeze([
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ]);

  static WEEKDS = Object.freeze(Parser.WEEKDAYS.map((d) => d.slice(0, 3)));
  static DOW_REX = Object.freeze(new RegExp(`([0-7]|${Parser.WEEKDS.join("|")})`, "i"));

  static MONTHS = Object.freeze([
    "-",
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ]);
  static MONTH_REX = Object.freeze(
    new RegExp(`(1[0-2]|0?[1-9]|${Parser.MONTHS.slice(1).join("|")})`, "i"),
  );

  s(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /[ \t]+/);
  }
  star(this: ModuleMethods, i: Input): Tree {
    return this.str(null, i, "*");
  }
  hyphen(this: ModuleMethods, i: Input): Tree {
    return this.str(null, i, "-");
  }
  comma(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /,([ \t]*,)*/);
  }
  isComma(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /([ \t]*,)*/);
  }
  isAnd(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, /&?/);
  }

  slash(this: ModuleMethods, i: Input): Tree {
    return this.rex(":slash", i, /\/\d\d?/);
  }

  mos(this: ModuleMethods, i: Input): Tree {
    return this.rex(":mos", i, /[0-5]?\d/);
  }
  hou(this: ModuleMethods, i: Input): Tree {
    return this.rex(":hou", i, /(2[0-4]|[01]?[0-9])/);
  }
  dom(this: ModuleMethods, i: Input): Tree {
    return this.rex(":dom", i, /(-?(3[01]|[12][0-9]|0?[1-9])|last|l)/i);
  }
  mon(this: ModuleMethods, i: Input): Tree {
    return this.rex(":mon", i, Parser.MONTH_REX);
  }
  dow(this: ModuleMethods, i: Input): Tree {
    return this.rex(":dow", i, Parser.DOW_REX);
  }

  dowHash(this: ModuleMethods, i: Input): Tree {
    return this.rex(":hash", i, /#(-?[1-5]|last|l)/i);
  }

  _mos(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":hyphen", ":mos");
  }
  _hou(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":hyphen", ":hou");
  }
  _dom(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":hyphen", ":dom");
  }
  _mon(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":hyphen", ":mon");
  }
  _dow(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":hyphen", ":dow");
  }

  rMos(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":mos", ":_mos", "?");
  }
  rHou(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":hou", ":_hou", "?");
  }
  rDom(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":dom", ":_dom", "?");
  }
  rMon(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":mon", ":_mon", "?");
  }
  rDow(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":dow", ":_dow", "?");
  }

  sorMos(this: ModuleMethods, i: Input): Tree {
    return this.alt(null, i, ":star", ":rMos");
  }
  sorHou(this: ModuleMethods, i: Input): Tree {
    return this.alt(null, i, ":star", ":rHou");
  }
  sorDom(this: ModuleMethods, i: Input): Tree {
    return this.alt(null, i, ":star", ":rDom");
  }
  sorMon(this: ModuleMethods, i: Input): Tree {
    return this.alt(null, i, ":star", ":rMon");
  }
  sorDow(this: ModuleMethods, i: Input): Tree {
    return this.alt(null, i, ":star", ":rDow");
  }

  sorwsMos(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":sorMos", ":slash", "?");
  }
  sorwsHou(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":sorHou", ":slash", "?");
  }
  sorwsDom(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":sorDom", ":slash", "?");
  }
  sorwsMon(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":sorMon", ":slash", "?");
  }
  sorwsDow(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":sorDow", ":slash", "?");
  }

  mosElt(this: ModuleMethods, i: Input): Tree {
    return this.alt(":elt", i, ":slash", ":sorwsMos");
  }
  houElt(this: ModuleMethods, i: Input): Tree {
    return this.alt(":elt", i, ":slash", ":sorwsHou");
  }
  domElt(this: ModuleMethods, i: Input): Tree {
    return this.alt(":elt", i, ":slash", ":sorwsDom");
  }
  monElt(this: ModuleMethods, i: Input): Tree {
    return this.alt(":elt", i, ":slash", ":sorwsMon");
  }
  dowElt(this: ModuleMethods, i: Input): Tree {
    return this.alt(":elt", i, ":slash", ":sorwsDow");
  }

  mod(this: ModuleMethods, i: Input): Tree {
    return this.rex(":mod", i, /%\d+(\+\d+)?/);
  }

  modDow(this: ModuleMethods, i: Input): Tree {
    return this.seq(":elt", i, ":dow", ":mod");
  }
  hDow(this: ModuleMethods, i: Input): Tree {
    return this.seq(":elt", i, ":dow", ":dowHash");
  }

  dowElt_(this: ModuleMethods, i: Input): Tree {
    return this.alt(null, i, ":hDow", ":modDow", ":dowElt");
  }

  listSec(this: ModuleMethods, i: Input): Tree {
    return this.jseq(":sec", i, ":mosElt", ":comma");
  }
  listMin(this: ModuleMethods, i: Input): Tree {
    return this.jseq(":min", i, ":mosElt", ":comma");
  }
  listHou(this: ModuleMethods, i: Input): Tree {
    return this.jseq(":hou", i, ":houElt", ":comma");
  }
  listDom(this: ModuleMethods, i: Input): Tree {
    return this.jseq(":dom", i, ":domElt", ":comma");
  }
  listMon(this: ModuleMethods, i: Input): Tree {
    return this.jseq(":mon", i, ":monElt", ":comma");
  }
  listDow(this: ModuleMethods, i: Input): Tree {
    return this.jseq(":dow", i, ":dowElt_", ":comma");
  }

  lsec_(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":isComma", ":listSec", ":isComma", ":s");
  }
  lmin_(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":isComma", ":listMin", ":isComma", ":s");
  }
  lhou_(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":isComma", ":listHou", ":isComma", ":s");
  }
  ldom_(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":isComma", ":listDom", ":isComma", ":isAnd", ":s");
  }
  lmon_(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":isComma", ":listMon", ":isComma", ":s");
  }
  ldow(this: ModuleMethods, i: Input): Tree {
    return this.seq(null, i, ":isComma", ":listDow", ":isComma", ":isAnd");
  }

  _tzName(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, / +[A-Z][a-zA-Z0-9+-]+(\/[A-Z][a-zA-Z0-9+\-_]+){0,2}/);
  }
  _tzDelta(this: ModuleMethods, i: Input): Tree {
    return this.rex(null, i, / +[-+]([01][0-9]|2[0-4]):?(00|15|30|45)/);
  }
  _tz(this: ModuleMethods, i: Input): Tree {
    return this.alt(":tz", i, ":_tzDelta", ":_tzName");
  }

  classicCron(this: ModuleMethods, i: Input): Tree {
    return this.seq(":ccron", i, ":lmin_", ":lhou_", ":ldom_", ":lmon_", ":ldow", ":_tz", "?");
  }
  secondCron(this: ModuleMethods, i: Input): Tree {
    return this.seq(
      ":scron",
      i,
      ":lsec_",
      ":lmin_",
      ":lhou_",
      ":ldom_",
      ":lmon_",
      ":ldow",
      ":_tz",
      "?",
    );
  }

  cron(this: ModuleMethods, i: Input): Tree {
    return this.alt(":cron", i, ":secondCron", ":classicCron");
  }

  rewriteBound(k: string | null, t: Tree): number {
    const s = t.string().toLowerCase();

    if (k === ":mon") {
      const i = Parser.MONTHS.indexOf(s);
      if (i >= 0) return i;
    }
    if (k === ":dow") {
      const i = Parser.WEEKDS.indexOf(s);
      if (i >= 0) return i;
    }
    if (k === ":dom" && s.slice(0, 1) === "l") return -1;
    return toI(s) as number;
  }

  rewriteMod(_k: string | null, t: Tree): [number, number] {
    const [mod, plus] = t
      .string()
      .split(/[%+]/)
      .filter((e) => e.length > 0)
      .map((e) => toI(e) as number);

    return [mod, plus ?? 0];
  }

  rewriteElt(this: Parser, k: string | null, t: Tree): CronElt {
    let at: Tree | null = null;
    let zt: Tree | null = null;
    let slt: Tree | null = null;
    let hat: Tree | null = null;
    let mot: Tree | null = null;
    for (const tt of t.subgather(null)) {
      switch (tt.name) {
        case ":slash":
          slt = tt;
          break;
        case ":hash":
          hat = tt;
          break;
        case ":mod":
          mot = tt;
          break;
        default:
          if (at) {
            zt ??= tt;
          } else {
            at = tt;
          }
      }
    }

    const sl = slt ? (toI(slt.string().slice(1)) as number) : null;

    let ha: string | number | null = hat ? hat.string().slice(1) : null;
    if (ha != null && ha.toUpperCase().slice(0, 1) === "L") ha = -1;
    if (ha != null) ha = toI(ha) as number;

    const mo = mot ? this.rewriteMod(k, mot) : null;

    const a = at ? this.rewriteBound(k, at) : null;
    const z = zt ? this.rewriteBound(k, zt) : null;

    return [a, z, sl, ha, mo];
  }

  rewriteEntry(this: Parser, t: Tree): CronElt[] {
    return t.subgather(":elt").map((et) => this.rewriteElt(t.name, et));
  }

  rewriteTz(t: Tree): [string, Timezone | null] {
    const s = t.strim();
    const z = EtOrbi.getTzone(s);

    return [s, z];
  }

  rewriteCron(this: Parser, t: Tree): CronHash | null {
    const st = t.sublookup(null);

    if (!st) return null;

    const hcron = st.subgather(null).reduce((h: Record<string, unknown>, tt) => {
      h[tt.name!.slice(1)] = tt.name === ":tz" ? this.rewriteTz(tt) : this.rewriteEntry(tt);
      return h;
    }, {}) as CronHash;
    if (t.string().includes("&")) hcron["&"] = true;

    const [z, tz] = hcron.tz ?? [];
    if (z && !tz) return null;

    return hcron;
  }

  static {
    include(this, Raabro);
    for (const name of Object.getOwnPropertyNames(this.prototype)) {
      if (name !== "constructor") (this as unknown as ModuleMethods).methodAdded(name);
    }
  }
}

Cron.Parser = Parser as typeof Cron.Parser;
Fugit.Cron = Cron;
rbSetClassPathString(Cron, Fugit, "Cron");
rbSetClassPathString(TimeCursor, Cron, "TimeCursor");
rbSetClassPathString(CronIterator, Cron, "CronIterator");
rbSetClassPathString(Frequency, Cron, "Frequency");
rbSetClassPathString(Parser, Cron, "Parser");
