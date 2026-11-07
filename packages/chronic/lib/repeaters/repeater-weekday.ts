import type { Time as RubyTime } from "@blazetrails/date";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { Chronic } from "../namespaces.js";
import { Repeater } from "../repeater.js";
import { Span } from "../span.js";

export class RepeaterWeekday extends Repeater {
  static DAY_SECONDS = 86400;
  static DAYS: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  /** @internal */
  currentWeekdayStart: RubyTime | null;

  constructor(type: unknown, options: Record<string, unknown> = {}) {
    super(type, options);
    this.currentWeekdayStart = null;
  }

  next(pointer: string): Span {
    super.next(pointer);

    const direction = pointer === "future" ? 1 : -1;

    if (!this.currentWeekdayStart) {
      this.currentWeekdayStart = Chronic.construct(this.now!.year, this.now!.month, this.now!.day);
      this.currentWeekdayStart = this.currentWeekdayStart.plus(
        direction * RepeaterWeekday.DAY_SECONDS,
      );

      while (!this.isWeekday(this.currentWeekdayStart.wday)) {
        this.currentWeekdayStart = this.currentWeekdayStart.plus(
          direction * RepeaterWeekday.DAY_SECONDS,
        );
      }
    } else {
      for (;;) {
        this.currentWeekdayStart = this.currentWeekdayStart.plus(
          direction * RepeaterWeekday.DAY_SECONDS,
        );
        if (this.isWeekday(this.currentWeekdayStart.wday)) break;
      }
    }

    return new Span(
      this.currentWeekdayStart,
      this.currentWeekdayStart.plus(RepeaterWeekday.DAY_SECONDS),
    );
  }

  this(pointer = "future"): Span | null {
    super.this(pointer);

    switch (pointer) {
      case "past":
        return this.next("past");
      case "future":
      case "none":
        return this.next("future");
    }
    return null;
  }

  offset(span: Span, amount: number, pointer: string): Span {
    const direction = pointer === "future" ? 1 : -1;

    let numWeekdaysPassed = 0;
    let offset = 0;
    while (numWeekdaysPassed !== amount) {
      offset += direction * RepeaterWeekday.DAY_SECONDS;
      if (this.isWeekday(span.begin!.plus(offset).wday)) numWeekdaysPassed += 1;
    }

    return span.plus(offset);
  }

  width(): number {
    return RepeaterWeekday.DAY_SECONDS;
  }

  toString(): string {
    return super.toString() + "-weekday";
  }

  /** @internal */
  private isWeekend(day: number): boolean {
    return day === this.symbolToNumber("saturday") || day === this.symbolToNumber("sunday");
  }

  /** @internal */
  private isWeekday(day: number): boolean {
    return !this.isWeekend(day);
  }

  /** @internal */
  private symbolToNumber(sym: string): number {
    const number = RepeaterWeekday.DAYS[sym];
    if (number != null) return number;
    throw new RuntimeError("Invalid symbol specified");
  }
}

Chronic.RepeaterWeekday = RepeaterWeekday;
