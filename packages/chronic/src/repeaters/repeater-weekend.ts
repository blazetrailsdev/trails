import type { Time as RubyTime } from "@blazetrails/date";
import { Chronic } from "../namespaces.js";
import { Repeater } from "../repeater.js";
import { Span } from "../span.js";
import { RepeaterDay } from "./repeater-day.js";
import { RepeaterDayName } from "./repeater-day-name.js";
import { RepeaterWeek } from "./repeater-week.js";

export class RepeaterWeekend extends Repeater {
  static WEEKEND_SECONDS = 172_800;

  /** @internal */
  currentWeekStart: RubyTime | null;

  constructor(type: unknown, options: Record<string, unknown> = {}) {
    super(type, options);
    this.currentWeekStart = null;
  }

  next(pointer: string): Span {
    super.next(pointer);

    if (!this.currentWeekStart) {
      switch (pointer) {
        case "future": {
          const saturdayRepeater = new RepeaterDayName("saturday");
          saturdayRepeater.start = this.now!;
          const nextSaturdaySpan = saturdayRepeater.next("future");
          this.currentWeekStart = nextSaturdaySpan.begin!;
          break;
        }
        case "past": {
          const saturdayRepeater = new RepeaterDayName("saturday");
          saturdayRepeater.start = this.now!.plus(RepeaterDay.DAY_SECONDS);
          const lastSaturdaySpan = saturdayRepeater.next("past");
          this.currentWeekStart = lastSaturdaySpan.begin!;
          break;
        }
      }
    } else {
      const direction = pointer === "future" ? 1 : -1;
      this.currentWeekStart = this.currentWeekStart.plus(direction * RepeaterWeek.WEEK_SECONDS);
    }

    return new Span(
      this.currentWeekStart,
      this.currentWeekStart!.plus(RepeaterWeekend.WEEKEND_SECONDS),
    );
  }

  this(pointer = "future"): Span | null {
    super.this(pointer);

    switch (pointer) {
      case "future":
      case "none": {
        const saturdayRepeater = new RepeaterDayName("saturday");
        saturdayRepeater.start = this.now!;
        const thisSaturdaySpan = saturdayRepeater.this("future");
        return new Span(
          thisSaturdaySpan.begin,
          thisSaturdaySpan.begin!.plus(RepeaterWeekend.WEEKEND_SECONDS),
        );
      }
      case "past": {
        const saturdayRepeater = new RepeaterDayName("saturday");
        saturdayRepeater.start = this.now!;
        const lastSaturdaySpan = saturdayRepeater.this("past");
        return new Span(
          lastSaturdaySpan.begin,
          lastSaturdaySpan.begin!.plus(RepeaterWeekend.WEEKEND_SECONDS),
        );
      }
    }
    return null;
  }

  offset(span: Span, amount: number, pointer: string): Span {
    const direction = pointer === "future" ? 1 : -1;
    const weekend = new RepeaterWeekend("weekend");
    weekend.start = span.begin!;
    const start = weekend
      .next(pointer)
      .begin!.plus((amount - 1) * direction * RepeaterWeek.WEEK_SECONDS);
    return new Span(start, start.plus(span.end!.minus(span.begin!) as number));
  }

  width(): number {
    return RepeaterWeekend.WEEKEND_SECONDS;
  }

  toString(): string {
    return super.toString() + "-weekend";
  }
}

Chronic.RepeaterWeekend = RepeaterWeekend;
