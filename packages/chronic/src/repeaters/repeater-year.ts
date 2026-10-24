import { Date as RubyDate, type Time as RubyTime } from "@blazetrails/date";
import { Chronic } from "../namespaces.js";
import { Repeater } from "../repeater.js";
import { Span } from "../span.js";
import { RepeaterMonth } from "./repeater-month.js";

export class RepeaterYear extends Repeater {
  static YEAR_SECONDS = 31536000;

  /** @internal */
  currentYearStart: RubyTime | null;

  constructor(type: unknown, options: Record<string, unknown> = {}) {
    super(type, options);
    this.currentYearStart = null;
  }

  next(pointer: string): Span {
    super.next(pointer);

    if (!this.currentYearStart) {
      switch (pointer) {
        case "future":
          this.currentYearStart = Chronic.construct(this.now!.year + 1);
          break;
        case "past":
          this.currentYearStart = Chronic.construct(this.now!.year - 1);
          break;
      }
    } else {
      const diff = pointer === "future" ? 1 : -1;
      this.currentYearStart = Chronic.construct(this.currentYearStart.year + diff);
    }

    return new Span(this.currentYearStart, Chronic.construct(this.currentYearStart!.year + 1));
  }

  this(pointer = "future"): Span {
    super.this(pointer);

    let thisYearStart: RubyTime | undefined, thisYearEnd: RubyTime | undefined;
    switch (pointer) {
      case "future":
        thisYearStart = Chronic.construct(this.now!.year, this.now!.month, this.now!.day + 1);
        thisYearEnd = Chronic.construct(this.now!.year + 1, 1, 1);
        break;
      case "past":
        thisYearStart = Chronic.construct(this.now!.year, 1, 1);
        thisYearEnd = Chronic.construct(this.now!.year, this.now!.month, this.now!.day);
        break;
      case "none":
        thisYearStart = Chronic.construct(this.now!.year, 1, 1);
        thisYearEnd = Chronic.construct(this.now!.year + 1, 1, 1);
        break;
    }

    return new Span(thisYearStart!, thisYearEnd!);
  }

  offset(span: Span, amount: number, pointer: string): Span {
    const direction = pointer === "future" ? 1 : -1;
    const newBegin = this.buildOffsetTime(span.begin, amount, direction);
    const newEnd = this.buildOffsetTime(span.end, amount, direction);
    return new Span(newBegin, newEnd);
  }

  width(): number {
    return RepeaterYear.YEAR_SECONDS;
  }

  toString(): string {
    return super.toString() + "-year";
  }

  /** @internal */
  private buildOffsetTime(time: RubyTime, amount: number, direction: number): RubyTime {
    const year = time.year + amount * direction;
    const days = this.monthDays(year, time.month);
    const day = time.day > days ? days : time.day;
    return Chronic.construct(year, time.month, day, time.hour, time.min, time.sec);
  }

  /** @internal */
  private monthDays(year: number, month: number): number {
    if (RubyDate.isLeap(year)) {
      return RepeaterMonth.MONTH_DAYS_LEAP[month - 1];
    } else {
      return RepeaterMonth.MONTH_DAYS[month - 1];
    }
  }
}

Chronic.RepeaterYear = RepeaterYear;
