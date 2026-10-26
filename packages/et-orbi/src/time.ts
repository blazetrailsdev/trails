import { TZInfo, type Timezone } from "@blazetrails/tzinfo";
import { Time } from "@blazetrails/date";
import {
  ArgumentError,
  NoMethodError,
  cmp,
  format,
  rbEqual,
  rbInspect,
  rbObjClassname,
  rbCNumeric,
  rbObjDup,
  rbObjIsKindOf,
  rbObjRespondTo,
  rbSetClassPathString,
  strip,
  toF,
} from "@blazetrails/ruby-compat";
import { platformInfo, renderNozoneTime } from "./info.js";
import { makeFromArray, makeTime, now, parse } from "./make.js";
import { getTzone } from "./zone.js";
import { determineLocalTzone } from "./zones.js";

export class EoTime {
  static now(zone: unknown = null): EoTime {
    return now(zone);
  }

  static parse(str: string, opts: Record<string, unknown> = {}): EoTime {
    return parse(str, opts);
  }

  static getTzone(o: unknown): Timezone | null {
    return getTzone(o);
  }

  static localTzone(): Timezone | null {
    return determineLocalTzone();
  }

  static platformInfo(): string {
    return platformInfo();
  }

  static make(o: unknown): EoTime {
    return makeTime(o);
  }

  static utc(...a: unknown[]): EoTime {
    return makeFromArray(a, getTzone("UTC"));
  }

  static local(...a: unknown[]): EoTime {
    return makeFromArray(a, this.localTzone());
  }

  /** @internal */
  private _seconds: number;
  /** @internal */
  private _zone: Timezone;
  /** @internal */
  private _time: Time | null = null;
  /** @internal */
  private _rday: number | null = null;
  /** @internal */
  private _rweek: number | null = null;

  get seconds(): number {
    return this._seconds;
  }

  get zone(): Timezone {
    return this._zone;
  }

  constructor(s: unknown, zone: unknown) {
    let z = zone;
    if (typeof zone === "string" && strip(zone) === "") z = null;

    this._seconds = toF(s);
    this._zone = (this.constructor as typeof EoTime).getTzone(
      z != null && z !== false ? z : ":local",
    )!;

    if (this.zone == null) {
      throw new ArgumentError(
        `Cannot determine timezone from ${rbInspect(zone)}` +
          `\n${renderNozoneTime(this.seconds)}` +
          `\n${platformInfo().replace(",debian:", ",\ndebian:")}` +
          "\nTry setting `ENV['TZ'] = 'Continent/City'` in your script " +
          "(see https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)" +
          ("Data" in TZInfo ? "" : "\nand adding gem 'tzinfo-data'"),
      );
    }

    this.touch();
  }

  touch(): void {
    this._time = null;
    this._rday = null;
    this._rweek = null;
  }

  set seconds(f: number) {
    this._seconds = f;

    this.touch();
  }

  set zone(z: unknown) {
    this._zone = (this.constructor as typeof EoTime).getTzone(this.zone ?? ":current")!;

    this.touch();
  }

  isAmbiguous(): boolean {
    try {
      this.zone.localToUtc(this.zone.utcToLocal(this.utc()));

      return false;
    } catch (error) {
      if (!(error instanceof TZInfo.AmbiguousTime)) throw error;

      return true;
    }
  }

  utc(): Time {
    return Time.utc(1970).plus(this.seconds);
  }

  isUtc(): boolean {
    return ["gmt", "utc", "zulu", "etc/gmt", "etc/utc"].includes(
      this.zone.canonicalIdentifier.toLowerCase(),
    );
  }

  getutc(): Time {
    return this.utc();
  }

  getgm(): Time {
    return this.utc();
  }

  toUtcTime(): Time {
    return this.utc();
  }

  toF(): number {
    return this.seconds;
  }

  toI(): number {
    return Math.trunc(this.seconds);
  }

  strftime(format: string): string {
    format = format.replace(/%(\/?Z|:{0,2}z)/g, (f) => this.strfz(f));

    return this.toTime().strftime(format);
  }

  toLocalTime(): Time {
    return Time.at(this.seconds);
  }

  toT(): Time {
    return this.toLocalTime();
  }

  isDst(): boolean {
    return this.zone.periodForUtc(this.utc()).stdOffset !== 0;
  }

  isdst(): boolean {
    return this.isDst();
  }

  toDebugS(): string {
    let uo = this.utcOffset();
    const uos = uo < 0 ? "-" : "+";
    uo = Math.abs(uo);
    const [uoh, uom] = [Math.floor(uo / 3600), uo % 3600];

    return [
      "ot",
      this.strftime("%Y-%m-%d %H:%M:%S"),
      format("%s%02d:%02d", uos, uoh, uom),
      `dst:${this.isdst()}`,
    ].join(" ");
  }

  utcOffset(): number {
    return this.zone.periodForUtc(this.utc()).utcTotalOffset;
  }

  get year(): number {
    return this.toTime().year;
  }

  get month(): number {
    return this.toTime().month;
  }

  get day(): number {
    return this.toTime().day;
  }

  get wday(): number {
    return this.toTime().wday;
  }

  get yday(): number {
    return this.toTime().yday;
  }

  get hour(): number {
    return this.toTime().hour;
  }

  get min(): number {
    return this.toTime().min;
  }

  get sec(): number {
    return this.toTime().sec;
  }

  get usec(): number {
    return this.toTime().usec;
  }

  asctime(): string {
    return this.toTime().asctime();
  }

  equals(o: unknown): boolean {
    if (o instanceof EoTime) {
      return (
        rbEqual(o.seconds, this.seconds) &&
        (rbEqual(o.zone, this.zone) || rbEqual(o.zone.currentPeriod(), this.zone.currentPeriod()))
      );
    } else if (o instanceof Time) {
      return Math.trunc(this.toF() * 1000) === Math.trunc(toF(o) * 1000);
    } else {
      return false;
    }
  }

  gt(o: unknown): boolean {
    return this.seconds > this._toF(o);
  }

  gteq(o: unknown): boolean {
    return this.seconds >= this._toF(o);
  }

  lt(o: unknown): boolean {
    return this.seconds < this._toF(o);
  }

  lteq(o: unknown): boolean {
    return this.seconds <= this._toF(o);
  }

  compareTo(o: unknown): number | null {
    return cmp(this.seconds, this._toF(o));
  }

  add(t: unknown): this {
    this._seconds += toF(t);
    this.touch();
    return this;
  }

  subtract(t: unknown): this {
    this._seconds -= toF(t);
    this.touch();
    return this;
  }

  plus(t: unknown): EoTime {
    return this.inc(t, 1) as EoTime;
  }

  minus(t: number): EoTime;
  minus(t: Time | EoTime): number;
  minus(t: unknown): EoTime | number {
    return this.inc(t, -1);
  }

  static readonly DAY_S = 24 * 3600;
  static readonly WEEK_S = 7 * EoTime.DAY_S;

  monthdays(): [string, string] {
    const date = this.toTime();

    let pos = 1;
    let d = rbObjDup(this);

    while (true) {
      d.add(-EoTime.WEEK_S);
      if (d.month !== date.month) break;
      pos = pos + 1;
    }

    let neg = -1;
    d = rbObjDup(this);

    while (true) {
      d.add(EoTime.WEEK_S);
      if (d.month !== date.month) break;
      neg = neg - 1;
    }

    return [`${date.wday}#${pos}`, `${date.wday}#${neg}`];
  }

  toString(): string {
    return this.strftime("%Y-%m-%d %H:%M:%S %z");
  }

  toZs(): string {
    return this.strftime("%Y-%m-%d %H:%M:%S %/Z");
  }

  iso8601(fractionDigits: number | null = 0): string {
    const s = (fractionDigits ?? 0) > 0 ? `.%${fractionDigits}N` : "";
    return this.strftime(`%Y-%m-%dT%H:%M:%S${s}%:z`);
  }

  toUtcComparisonS(): string {
    const per = this.zone.periodForUtc(this.utc());
    let off: number | string = per.utcTotalOffset;

    off = Math.floor(off / 3600);
    off = off >= 0 ? `+${off}` : String(off);

    return this.strftime("%H%M") + off + this.utc().strftime("(%H%M)");
  }

  toTimeS(): string {
    return this.strftime("%H:%M:%S.%6N");
  }

  inc(t: unknown, dir = 1): EoTime | number {
    let r: EoTime | number;
    if (rbObjIsKindOf(t, rbCNumeric)) {
      const nt = rbObjDup(this);
      nt.seconds += dir * toF(t);
      r = nt;
    } else if (t instanceof Time || t instanceof EoTime) {
      if (dir > 0) throw new ArgumentError(`Cannot add ${rbObjClassname(t)} to EoTime`);
      r = this.seconds + dir * toF(t);
    } else {
      throw new ArgumentError(
        `Cannot call add or subtract ${rbObjClassname(t)} to EoTime instance`,
      );
    }

    this.touch();

    return r;
  }

  localtime(zone: unknown = null): EoTime {
    return new EoTime(this.toF(), zone);
  }

  translate(zone: unknown = null): EoTime {
    return this.localtime(zone);
  }

  inTimeZone(zone: unknown = null): EoTime {
    return this.localtime(zone);
  }

  get wdayInMonth(): [number, number] {
    return [
      this.countWeeks(makeTime(this.strftime("%F 12:00:00 %/Z")), -1),
      -this.countWeeks(makeTime(this.strftime("%F 12:00:00 %/Z")), 1),
    ];
  }

  get rweek(): number {
    return (this._rweek ??= (() => {
      const ref = makeTime("2019-01-01 12:00:00", this.zone);
      const noon = makeTime(this.strftime("%F 12:00:00"), this.zone);
      return Math.floor(noon.minus(ref) / EoTime.WEEK_S) + 1;
    })());
  }

  get rday(): number {
    return (this._rday ??= (() => {
      const ref = makeTime("2019-01-01 12:00:00", this.zone);
      const noon = makeTime(this.strftime("%F 12:00:00"), this.zone);
      return Math.floor(noon.minus(ref) / EoTime.DAY_S) + 1;
    })());
  }

  reach(points: Record<string, number | undefined>): EoTime {
    let t = new EoTime(this.toF(), this.zone);
    let step = 1;

    const s = points.second ?? points.sec ?? points.s ?? null;
    const m = points.minute ?? points.min ?? points.m ?? null;
    const h = points.hour ?? points.hou ?? points.h ?? null;

    if (!(s != null || m != null || h != null)) {
      throw new ArgumentError("missing :second, :minute, and :hour");
    }

    if (s == null && m == null) {
      step = 60 * 60;
      t = t.minus(t.sec);
      t = t.minus(t.min * 60);
    } else if (s == null) {
      step = 60;
      t = t.minus(t.sec);
    }

    while (true) {
      t = t.plus(step);
      if (s != null && t.sec !== s) continue;
      if (m != null && t.min !== m) continue;
      if (h != null && t.hour !== h) continue;
      break;
    }

    return t;
  }

  clone(): EoTime {
    return new EoTime(this.seconds, this.zone);
  }

  /** @internal */
  protected toTime(): Time {
    return (this._time ??= this.zone.utcToLocal(this.utc()));
  }

  /** @internal */
  protected countWeeks(start: EoTime, dir: number): number {
    let c = 0;
    let t = start;

    while (!(t.month !== this.month)) {
      c += 1;
      t = t.plus(dir * (7 * 24 * 3600));
    }

    return c;
  }

  /** @internal */
  protected strfz(code: string): string {
    if (code === "%/Z") return this.zone.name;

    const per = this.zone.periodForUtc(this.utc());

    if (code === "%Z") return String(per.abbreviation);

    let off = per.utcTotalOffset;
    const sn = off < 0 ? "-" : "+";
    off = Math.abs(off);
    const hr = Math.floor(off / 3600);
    const mn = Math.floor((off % 3600) / 60);
    const sc = 0;

    if (this.zone.name === "UTC") {
      return "Z";
    } else if (code === "%z") {
      return format("%s%02d%02d", sn, hr, mn);
    } else if (code === "%:z") {
      return format("%s%02d:%02d", sn, hr, mn);
    } else {
      return format("%s%02d:%02d:%02d", sn, hr, mn, sc);
    }
  }

  /** @internal */
  protected _toF(o: unknown): number {
    if (!rbObjRespondTo(o, "toF")) {
      const args = [`Comparison of EoTime with ${rbInspect(o)} failed`];
      throw new NoMethodError(
        "undefined method `ArgumentError' for an instance of EtOrbi::EoTime",
        "ArgumentError",
        args,
        true,
        { receiver: this },
      );
    }

    return toF(o);
  }
}

rbSetClassPathString(EoTime, { name: "EtOrbi" }, "EoTime");
