import type { Time as RubyTime } from "@blazetrails/date";
import { Chronic } from "../namespaces.js";
import { Repeater } from "../repeater.js";
import { Span } from "../span.js";

export class RepeaterMinute extends Repeater {
  static MINUTE_SECONDS = 60;

  /** @internal */
  currentMinuteStart: RubyTime | null;

  constructor(type: unknown, options: Record<string, unknown> = {}) {
    super(type, options);
    this.currentMinuteStart = null;
  }

  next(pointer = "future"): Span {
    super.next(pointer);

    if (!this.currentMinuteStart) {
      switch (pointer) {
        case "future":
          this.currentMinuteStart = Chronic.construct(
            this.now!.year,
            this.now!.month,
            this.now!.day,
            this.now!.hour,
            this.now!.min + 1,
          );
          break;
        case "past":
          this.currentMinuteStart = Chronic.construct(
            this.now!.year,
            this.now!.month,
            this.now!.day,
            this.now!.hour,
            this.now!.min - 1,
          );
          break;
      }
    } else {
      const direction = pointer === "future" ? 1 : -1;
      this.currentMinuteStart = this.currentMinuteStart.plus(
        direction * RepeaterMinute.MINUTE_SECONDS,
      );
    }

    return new Span(
      this.currentMinuteStart,
      this.currentMinuteStart!.plus(RepeaterMinute.MINUTE_SECONDS),
    );
  }

  this(pointer = "future"): Span {
    super.this(pointer);

    let minuteBegin: RubyTime | undefined, minuteEnd: RubyTime | undefined;
    switch (pointer) {
      case "future":
        minuteBegin = this.now!;
        minuteEnd = Chronic.construct(
          this.now!.year,
          this.now!.month,
          this.now!.day,
          this.now!.hour,
          this.now!.min,
        );
        break;
      case "past":
        minuteBegin = Chronic.construct(
          this.now!.year,
          this.now!.month,
          this.now!.day,
          this.now!.hour,
          this.now!.min,
        );
        minuteEnd = this.now!;
        break;
      case "none":
        minuteBegin = Chronic.construct(
          this.now!.year,
          this.now!.month,
          this.now!.day,
          this.now!.hour,
          this.now!.min,
        );
        minuteEnd = Chronic.construct(
          this.now!.year,
          this.now!.month,
          this.now!.day,
          this.now!.hour,
          this.now!.min,
        ).plus(RepeaterMinute.MINUTE_SECONDS);
        break;
    }

    return new Span(minuteBegin!, minuteEnd!);
  }

  offset(span: Span, amount: number, pointer: string): Span {
    const direction = pointer === "future" ? 1 : -1;
    return span.plus(direction * amount * RepeaterMinute.MINUTE_SECONDS);
  }

  width(): number {
    return RepeaterMinute.MINUTE_SECONDS;
  }

  toString(): string {
    return super.toString() + "-minute";
  }
}

Chronic.RepeaterMinute = RepeaterMinute;
