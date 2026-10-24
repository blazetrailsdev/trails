import type { Time as RubyTime } from "@blazetrails/date";
import { Chronic } from "../namespaces.js";
import { Repeater } from "../repeater.js";
import { Span } from "../span.js";

export class RepeaterHour extends Repeater {
  static HOUR_SECONDS = 3600;

  /** @internal */
  currentHourStart: RubyTime | null;

  constructor(type: unknown, options: Record<string, unknown> = {}) {
    super(type, options);
    this.currentHourStart = null;
  }

  next(pointer: string): Span {
    super.next(pointer);

    if (!this.currentHourStart) {
      switch (pointer) {
        case "future":
          this.currentHourStart = Chronic.construct(
            this.now!.year,
            this.now!.month,
            this.now!.day,
            this.now!.hour + 1,
          );
          break;
        case "past":
          this.currentHourStart = Chronic.construct(
            this.now!.year,
            this.now!.month,
            this.now!.day,
            this.now!.hour - 1,
          );
          break;
      }
    } else {
      const direction = pointer === "future" ? 1 : -1;
      this.currentHourStart = this.currentHourStart.plus(direction * RepeaterHour.HOUR_SECONDS);
    }

    return new Span(this.currentHourStart, this.currentHourStart!.plus(RepeaterHour.HOUR_SECONDS));
  }

  this(pointer = "future"): Span {
    super.this(pointer);

    let hourStart: RubyTime | undefined, hourEnd: RubyTime | undefined;
    switch (pointer) {
      case "future":
        hourStart = Chronic.construct(
          this.now!.year,
          this.now!.month,
          this.now!.day,
          this.now!.hour,
          this.now!.min + 1,
        );
        hourEnd = Chronic.construct(
          this.now!.year,
          this.now!.month,
          this.now!.day,
          this.now!.hour + 1,
        );
        break;
      case "past":
        hourStart = Chronic.construct(
          this.now!.year,
          this.now!.month,
          this.now!.day,
          this.now!.hour,
        );
        hourEnd = Chronic.construct(
          this.now!.year,
          this.now!.month,
          this.now!.day,
          this.now!.hour,
          this.now!.min,
        );
        break;
      case "none":
        hourStart = Chronic.construct(
          this.now!.year,
          this.now!.month,
          this.now!.day,
          this.now!.hour,
        );
        hourEnd = hourStart.plus(RepeaterHour.HOUR_SECONDS);
        break;
    }

    return new Span(hourStart!, hourEnd!);
  }

  offset(span: Span, amount: number, pointer: string): Span {
    const direction = pointer === "future" ? 1 : -1;
    return span.plus(direction * amount * RepeaterHour.HOUR_SECONDS);
  }

  width(): number {
    return RepeaterHour.HOUR_SECONDS;
  }

  toString(): string {
    return super.toString() + "-hour";
  }
}

Chronic.RepeaterHour = RepeaterHour;
