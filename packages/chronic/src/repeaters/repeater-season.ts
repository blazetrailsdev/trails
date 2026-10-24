import type { Time as RubyTime } from "@blazetrails/date";
import { MiniDate } from "../mini-date.js";
import { Chronic } from "../namespaces.js";
import { Repeater } from "../repeater.js";
import { Season } from "../season.js";
import { Span } from "../span.js";
import { RepeaterDay } from "./repeater-day.js";

export class RepeaterSeason extends Repeater<string> {
  static SEASON_SECONDS = 7_862_400;
  static SEASONS: Record<string, Season> = {
    spring: new Season(new MiniDate(3, 20), new MiniDate(6, 20)),
    summer: new Season(new MiniDate(6, 21), new MiniDate(9, 22)),
    autumn: new Season(new MiniDate(9, 23), new MiniDate(12, 21)),
    winter: new Season(new MiniDate(12, 22), new MiniDate(3, 19)),
  };

  /** @internal */
  nextSeasonStart: RubyTime | null;
  /** @internal */
  nextSeasonEnd: RubyTime | null;

  constructor(type: string, options: Record<string, unknown> = {}) {
    super(type, options);
    this.nextSeasonStart = null;
    this.nextSeasonEnd = null;
  }

  next(pointer: string): Span {
    super.next(pointer);

    const direction = pointer === "future" ? 1 : -1;
    const nextSeason = Season.findNextSeason(
      this.findCurrentSeason(MiniDate.fromTime(this.now!))!,
      direction,
    );

    return this.findNextSeasonSpan(direction, nextSeason);
  }

  this(pointer = "future"): Span {
    super.this(pointer);

    const direction = pointer === "future" ? 1 : -1;

    const today = Chronic.construct(this.now!.year, this.now!.month, this.now!.day);
    const thisSsn = this.findCurrentSeason(MiniDate.fromTime(this.now!))!;
    let thisSsnStart: RubyTime | undefined, thisSsnEnd: RubyTime | undefined;
    switch (pointer) {
      case "past":
        thisSsnStart = today.plus(direction * this.numSecondsTilStart(thisSsn, direction));
        thisSsnEnd = today;
        break;
      case "future":
        thisSsnStart = today.plus(RepeaterDay.DAY_SECONDS);
        thisSsnEnd = today.plus(direction * this.numSecondsTilEnd(thisSsn, direction));
        break;
      case "none":
        thisSsnStart = today.plus(direction * this.numSecondsTilStart(thisSsn, direction));
        thisSsnEnd = today.plus(direction * this.numSecondsTilEnd(thisSsn, direction));
        break;
    }

    return this.constructSeason(thisSsnStart!, thisSsnEnd!);
  }

  offset(span: Span, amount: number, pointer: string): Span {
    return new Span(
      this.offsetBy(span.begin!, amount, pointer),
      this.offsetBy(span.end!, amount, pointer),
    );
  }

  offsetBy(time: RubyTime, amount: number, pointer: string): RubyTime {
    const direction = pointer === "future" ? 1 : -1;
    return time.plus(amount * direction * RepeaterSeason.SEASON_SECONDS);
  }

  width(): number {
    return RepeaterSeason.SEASON_SECONDS;
  }

  toString(): string {
    return super.toString() + "-season";
  }

  /** @internal */
  protected findNextSeasonSpan(direction: number, nextSeason: string): Span {
    if (!(this.nextSeasonStart || this.nextSeasonEnd)) {
      this.nextSeasonStart = Chronic.construct(this.now!.year, this.now!.month, this.now!.day);
      this.nextSeasonEnd = Chronic.construct(this.now!.year, this.now!.month, this.now!.day);
    }

    this.nextSeasonStart = this.nextSeasonStart!.plus(
      direction * this.numSecondsTilStart(nextSeason, direction),
    );
    this.nextSeasonEnd = this.nextSeasonEnd!.plus(
      direction * this.numSecondsTilEnd(nextSeason, direction),
    );

    return this.constructSeason(this.nextSeasonStart, this.nextSeasonEnd);
  }

  /** @internal */
  protected findCurrentSeason(md: MiniDate): string | undefined {
    return ["spring", "summer", "autumn", "winter"].find((season) =>
      md.isBetween(RepeaterSeason.SEASONS[season].start, RepeaterSeason.SEASONS[season].end),
    );
  }

  /** @internal */
  protected numSecondsTil(goal: MiniDate, direction: number): number {
    const start = Chronic.construct(this.now!.year, this.now!.month, this.now!.day);
    let seconds = 0;

    while (!MiniDate.fromTime(start.plus(direction * seconds)).isEquals(goal)) {
      seconds += RepeaterDay.DAY_SECONDS;
    }

    return seconds;
  }

  /** @internal */
  protected numSecondsTilStart(seasonSymbol: string, direction: number): number {
    return this.numSecondsTil(RepeaterSeason.SEASONS[seasonSymbol].start, direction);
  }

  /** @internal */
  protected numSecondsTilEnd(seasonSymbol: string, direction: number): number {
    return this.numSecondsTil(RepeaterSeason.SEASONS[seasonSymbol].end, direction);
  }

  /** @internal */
  protected constructSeason(start: RubyTime, finish: RubyTime): Span {
    return new Span(
      Chronic.construct(start.year, start.month, start.day),
      Chronic.construct(finish.year, finish.month, finish.day),
    );
  }
}

Chronic.RepeaterSeason = RepeaterSeason;
