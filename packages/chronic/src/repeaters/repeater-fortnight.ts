import type { Time as RubyTime } from "@blazetrails/date";
import { Chronic } from "../namespaces.js";
import { Repeater } from "../repeater.js";
import { Span } from "../span.js";
import { RepeaterDay } from "./repeater-day.js";
import { RepeaterDayName } from "./repeater-day-name.js";
import { RepeaterHour } from "./repeater-hour.js";

export class RepeaterFortnight extends Repeater {
  static FORTNIGHT_SECONDS = 1_209_600;

  /** @internal */
  currentFortnightStart: RubyTime | null;

  constructor(type: unknown, options: Record<string, unknown> = {}) {
    super(type, options);
    this.currentFortnightStart = null;
  }

  next(pointer: string): Span {
    super.next(pointer);

    if (!this.currentFortnightStart) {
      switch (pointer) {
        case "future": {
          const sundayRepeater = new RepeaterDayName("sunday");
          sundayRepeater.start = this.now!;
          const nextSundaySpan = sundayRepeater.next("future");
          this.currentFortnightStart = nextSundaySpan.begin;
          break;
        }
        case "past": {
          const sundayRepeater = new RepeaterDayName("sunday");
          sundayRepeater.start = this.now!.plus(RepeaterDay.DAY_SECONDS);
          for (let i = 0; i < 2; i++) sundayRepeater.next("past");
          const lastSundaySpan = sundayRepeater.next("past");
          this.currentFortnightStart = lastSundaySpan.begin;
          break;
        }
      }
    } else {
      const direction = pointer === "future" ? 1 : -1;
      this.currentFortnightStart = this.currentFortnightStart.plus(
        direction * RepeaterFortnight.FORTNIGHT_SECONDS,
      );
    }

    return new Span(
      this.currentFortnightStart,
      this.currentFortnightStart!.plus(RepeaterFortnight.FORTNIGHT_SECONDS),
    );
  }

  this(pointer = "future"): Span | null {
    super.this(pointer);

    if (pointer === "none") pointer = "future";

    switch (pointer) {
      case "future": {
        const thisFortnightStart = Chronic.construct(
          this.now!.year,
          this.now!.month,
          this.now!.day,
          this.now!.hour,
        ).plus(RepeaterHour.HOUR_SECONDS);
        const sundayRepeater = new RepeaterDayName("sunday");
        sundayRepeater.start = this.now!;
        sundayRepeater.this("future");
        const thisSundaySpan = sundayRepeater.this("future");
        const thisFortnightEnd = thisSundaySpan.begin;
        return new Span(thisFortnightStart, thisFortnightEnd);
      }
      case "past": {
        const thisFortnightEnd = Chronic.construct(
          this.now!.year,
          this.now!.month,
          this.now!.day,
          this.now!.hour,
        );
        const sundayRepeater = new RepeaterDayName("sunday");
        sundayRepeater.start = this.now!;
        const lastSundaySpan = sundayRepeater.next("past");
        const thisFortnightStart = lastSundaySpan.begin;
        return new Span(thisFortnightStart, thisFortnightEnd);
      }
    }
    return null;
  }

  offset(span: Span, amount: number, pointer: string): Span {
    const direction = pointer === "future" ? 1 : -1;
    return span.plus(direction * amount * RepeaterFortnight.FORTNIGHT_SECONDS);
  }

  width(): number {
    return RepeaterFortnight.FORTNIGHT_SECONDS;
  }

  toString(): string {
    return super.toString() + "-fortnight";
  }
}

Chronic.RepeaterFortnight = RepeaterFortnight;
