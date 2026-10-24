import type { Time as RubyTime } from "@blazetrails/date";
import { Chronic } from "../namespaces.js";
import { Repeater } from "../repeater.js";
import { Span } from "../span.js";
import { RepeaterDay } from "./repeater-day.js";
import { RepeaterDayName } from "./repeater-day-name.js";
import { RepeaterHour } from "./repeater-hour.js";

export class RepeaterWeek extends Repeater {
  static WEEK_SECONDS = 604800;

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
          const sundayRepeater = new RepeaterDayName("sunday");
          sundayRepeater.start = this.now!;
          const nextSundaySpan = sundayRepeater.next("future");
          this.currentWeekStart = nextSundaySpan.begin;
          break;
        }
        case "past": {
          const sundayRepeater = new RepeaterDayName("sunday");
          sundayRepeater.start = this.now!.plus(RepeaterDay.DAY_SECONDS);
          sundayRepeater.next("past");
          const lastSundaySpan = sundayRepeater.next("past");
          this.currentWeekStart = lastSundaySpan.begin;
          break;
        }
      }
    } else {
      const direction = pointer === "future" ? 1 : -1;
      this.currentWeekStart = this.currentWeekStart.plus(direction * RepeaterWeek.WEEK_SECONDS);
    }

    return new Span(this.currentWeekStart, this.currentWeekStart!.plus(RepeaterWeek.WEEK_SECONDS));
  }

  this(pointer = "future"): Span | null {
    super.this(pointer);

    switch (pointer) {
      case "future": {
        const thisWeekStart = Chronic.timeClass
          .local(this.now!.year, this.now!.month, this.now!.day, this.now!.hour)
          .plus(RepeaterHour.HOUR_SECONDS);
        const sundayRepeater = new RepeaterDayName("sunday");
        sundayRepeater.start = this.now!;
        const thisSundaySpan = sundayRepeater.this("future");
        const thisWeekEnd = thisSundaySpan.begin;
        return new Span(thisWeekStart, thisWeekEnd);
      }
      case "past": {
        const thisWeekEnd = Chronic.timeClass.local(
          this.now!.year,
          this.now!.month,
          this.now!.day,
          this.now!.hour,
        );
        const sundayRepeater = new RepeaterDayName("sunday");
        sundayRepeater.start = this.now!;
        const lastSundaySpan = sundayRepeater.next("past");
        const thisWeekStart = lastSundaySpan.begin;
        return new Span(thisWeekStart, thisWeekEnd);
      }
      case "none": {
        const sundayRepeater = new RepeaterDayName("sunday");
        sundayRepeater.start = this.now!;
        const lastSundaySpan = sundayRepeater.next("past");
        const thisWeekStart = lastSundaySpan.begin;
        return new Span(thisWeekStart, thisWeekStart.plus(RepeaterWeek.WEEK_SECONDS));
      }
    }
    return null;
  }

  offset(span: Span, amount: number, pointer: string): Span {
    const direction = pointer === "future" ? 1 : -1;
    return span.plus(direction * amount * RepeaterWeek.WEEK_SECONDS);
  }

  width(): number {
    return RepeaterWeek.WEEK_SECONDS;
  }

  toString(): string {
    return super.toString() + "-week";
  }
}

Chronic.RepeaterWeek = RepeaterWeek;
