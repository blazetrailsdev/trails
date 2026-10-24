import type { Time as RubyTime } from "@blazetrails/date";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { Chronic } from "../namespaces.js";
import { Repeater } from "../repeater.js";
import { Span } from "../span.js";

export class RepeaterMonthName extends Repeater {
  declare type: string;

  static MONTH_SECONDS = 2_592_000;
  static MONTHS: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };

  /** @internal */
  currentMonthBegin: RubyTime | null;
  #index: number | undefined;

  constructor(type: unknown, options: Record<string, unknown> = {}) {
    super(type, options);
    this.currentMonthBegin = null;
  }

  next(pointer: string): Span {
    super.next(pointer);

    if (!this.currentMonthBegin) {
      switch (pointer) {
        case "future":
          if (this.now!.month < this.index()) {
            this.currentMonthBegin = Chronic.construct(this.now!.year, this.index());
          } else if (this.now!.month > this.index()) {
            this.currentMonthBegin = Chronic.construct(this.now!.year + 1, this.index());
          }
          break;
        case "none":
          if (this.now!.month <= this.index()) {
            this.currentMonthBegin = Chronic.construct(this.now!.year, this.index());
          } else if (this.now!.month > this.index()) {
            this.currentMonthBegin = Chronic.construct(this.now!.year + 1, this.index());
          }
          break;
        case "past":
          if (this.now!.month >= this.index()) {
            this.currentMonthBegin = Chronic.construct(this.now!.year, this.index());
          } else if (this.now!.month < this.index()) {
            this.currentMonthBegin = Chronic.construct(this.now!.year - 1, this.index());
          }
          break;
      }
      if (!this.currentMonthBegin) throw new RuntimeError("Current month should be set by now");
    } else {
      switch (pointer) {
        case "future":
          this.currentMonthBegin = Chronic.construct(
            this.currentMonthBegin.year + 1,
            this.currentMonthBegin.month,
          );
          break;
        case "past":
          this.currentMonthBegin = Chronic.construct(
            this.currentMonthBegin.year - 1,
            this.currentMonthBegin.month,
          );
          break;
      }
    }

    const curMonthYear = this.currentMonthBegin.year;
    const curMonthMonth = this.currentMonthBegin.month;

    let nextMonthYear, nextMonthMonth;
    if (curMonthMonth === 12) {
      nextMonthYear = curMonthYear + 1;
      nextMonthMonth = 1;
    } else {
      nextMonthYear = curMonthYear;
      nextMonthMonth = curMonthMonth + 1;
    }

    return new Span(this.currentMonthBegin, Chronic.construct(nextMonthYear, nextMonthMonth));
  }

  this(pointer = "future"): Span | null {
    super.this(pointer);

    switch (pointer) {
      case "past":
        return this.next(pointer);
      case "future":
      case "none":
        return this.next("none");
    }
    return null;
  }

  width(): number {
    return RepeaterMonthName.MONTH_SECONDS;
  }

  index(): number {
    return (this.#index ??= RepeaterMonthName.MONTHS[this.type]);
  }

  toString(): string {
    return super.toString() + "-monthname-" + String(this.type);
  }
}

Chronic.RepeaterMonthName = RepeaterMonthName;
