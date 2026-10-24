import type { Time as RubyTime } from "@blazetrails/date";
import { Chronic } from "../namespaces.js";
import { Repeater } from "../repeater.js";
import { Span } from "../span.js";

export class RepeaterDay extends Repeater {
  static DAY_SECONDS = 86_400;

  /** @internal */
  currentDayStart: RubyTime | null;

  constructor(type: unknown, options: Record<string, unknown> = {}) {
    super(type, options);
    this.currentDayStart = null;
  }

  next(pointer: string): Span {
    super.next(pointer);

    if (!this.currentDayStart) {
      this.currentDayStart = Chronic.timeClass.local(
        this.now!.year,
        this.now!.month,
        this.now!.day,
      );
    }

    const direction = pointer === "future" ? 1 : -1;
    this.currentDayStart = this.currentDayStart.plus(direction * RepeaterDay.DAY_SECONDS);

    return new Span(this.currentDayStart, this.currentDayStart.plus(RepeaterDay.DAY_SECONDS));
  }

  this(pointer = "future"): Span {
    super.this(pointer);

    let dayBegin: RubyTime | undefined, dayEnd: RubyTime | undefined;
    switch (pointer) {
      case "future":
        dayBegin = Chronic.construct(
          this.now!.year,
          this.now!.month,
          this.now!.day,
          this.now!.hour,
        );
        dayEnd = Chronic.construct(this.now!.year, this.now!.month, this.now!.day).plus(
          RepeaterDay.DAY_SECONDS,
        );
        break;
      case "past":
        dayBegin = Chronic.construct(this.now!.year, this.now!.month, this.now!.day);
        dayEnd = Chronic.construct(this.now!.year, this.now!.month, this.now!.day, this.now!.hour);
        break;
      case "none":
        dayBegin = Chronic.construct(this.now!.year, this.now!.month, this.now!.day);
        dayEnd = Chronic.construct(this.now!.year, this.now!.month, this.now!.day).plus(
          RepeaterDay.DAY_SECONDS,
        );
        break;
    }

    return new Span(dayBegin!, dayEnd!);
  }

  offset(span: Span, amount: number, pointer: string): Span {
    const direction = pointer === "future" ? 1 : -1;
    return span.plus(direction * amount * RepeaterDay.DAY_SECONDS);
  }

  width(): number {
    return RepeaterDay.DAY_SECONDS;
  }

  toString(): string {
    return super.toString() + "-day";
  }
}

Chronic.RepeaterDay = RepeaterDay;
