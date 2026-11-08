import { Date as RubyDate, type Time as RubyTime } from "@blazetrails/date";
import { fixDiv, fixMod } from "@blazetrails/ruby-compat";
import { Chronic } from "../namespaces.js";
import { Repeater } from "../repeater.js";
import { Span } from "../span.js";

export class RepeaterMonth extends Repeater {
  static MONTH_SECONDS = 2_592_000;
  static YEAR_MONTHS = 12;
  static MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  static MONTH_DAYS_LEAP = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  /** @internal */
  currentMonthStart: RubyTime | null;

  constructor(type: unknown, options: Record<string, unknown> = {}) {
    super(type, options);
    this.currentMonthStart = null;
  }

  next(pointer: string): Span {
    super.next(pointer);

    if (!this.currentMonthStart) {
      this.currentMonthStart = this.offsetBy(
        Chronic.construct(this.now!.year, this.now!.month),
        1,
        pointer,
      );
    } else {
      this.currentMonthStart = this.offsetBy(
        Chronic.construct(this.currentMonthStart.year, this.currentMonthStart.month),
        1,
        pointer,
      );
    }

    return new Span(
      this.currentMonthStart,
      Chronic.construct(this.currentMonthStart.year, this.currentMonthStart.month + 1),
    );
  }

  this(pointer = "future"): Span {
    super.this(pointer);

    let monthStart: RubyTime | undefined, monthEnd: RubyTime | undefined;
    switch (pointer) {
      case "future":
        monthStart = Chronic.construct(this.now!.year, this.now!.month, this.now!.day + 1);
        monthEnd = this.offsetBy(Chronic.construct(this.now!.year, this.now!.month), 1, "future");
        break;
      case "past":
        monthStart = Chronic.construct(this.now!.year, this.now!.month);
        monthEnd = Chronic.construct(this.now!.year, this.now!.month, this.now!.day);
        break;
      case "none":
        monthStart = Chronic.construct(this.now!.year, this.now!.month);
        monthEnd = this.offsetBy(Chronic.construct(this.now!.year, this.now!.month), 1, "future");
        break;
    }

    return new Span(monthStart!, monthEnd!);
  }

  offset(span: Span, amount: number, pointer: string): Span {
    return new Span(
      this.offsetBy(span.begin!, amount, pointer),
      this.offsetBy(span.end!, amount, pointer),
    );
  }

  offsetBy(time: RubyTime, amount: number, pointer: string): RubyTime {
    const direction = pointer === "future" ? 1 : -1;

    const amountYears = fixDiv(direction * amount, RepeaterMonth.YEAR_MONTHS);
    const amountMonths = fixMod(direction * amount, RepeaterMonth.YEAR_MONTHS);

    let newYear = time.year + amountYears;
    let newMonth = time.month + amountMonths;
    if (newMonth > RepeaterMonth.YEAR_MONTHS) {
      newYear += 1;
      newMonth -= RepeaterMonth.YEAR_MONTHS;
    }

    const days = this.monthDays(newYear, newMonth);
    const newDay = time.day > days ? days : time.day;

    return Chronic.construct(newYear, newMonth, newDay, time.hour, time.min, time.sec);
  }

  width(): number {
    return RepeaterMonth.MONTH_SECONDS;
  }

  toString(): string {
    return super.toString() + "-month";
  }

  /** @internal */
  private monthDays(year: number, month: number): number {
    return RubyDate.isLeap(year)
      ? RepeaterMonth.MONTH_DAYS_LEAP[month - 1]
      : RepeaterMonth.MONTH_DAYS[month - 1];
  }
}

Chronic.RepeaterMonth = RepeaterMonth;
