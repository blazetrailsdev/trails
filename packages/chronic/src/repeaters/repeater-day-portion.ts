import { Range, RuntimeError, fixDiv, fixMod } from "@blazetrails/ruby-compat";
import type { Time as RubyTime } from "@blazetrails/date";
import { Chronic } from "../namespaces.js";
import { Repeater } from "../repeater.js";
import { Span } from "../span.js";
import { RepeaterDay } from "./repeater-day.js";

export class RepeaterDayPortion extends Repeater<string | number> {
  static PORTIONS: Record<string, Range<number>> = {
    am: new Range(0, 12 * 60 * 60 - 1),
    pm: new Range(12 * 60 * 60, 24 * 60 * 60 - 1),
    morning: new Range(6 * 60 * 60, 12 * 60 * 60),
    afternoon: new Range(13 * 60 * 60, 17 * 60 * 60),
    evening: new Range(17 * 60 * 60, 20 * 60 * 60),
    night: new Range(20 * 60 * 60, 24 * 60 * 60),
  };

  /** @internal */
  currentSpan: Span | null;
  /** @internal */
  range: Range<number> | undefined;

  constructor(type: string | number, options: Record<string, unknown> = {}) {
    super(type, options);
    this.currentSpan = null;

    if (Number.isInteger(type)) {
      this.range = new Range(
        (this.type as number) * 60 * 60,
        ((this.type as number) + 12) * 60 * 60,
      );
    } else {
      this.range = RepeaterDayPortion.PORTIONS[type as string];
      if (!this.range)
        throw new RuntimeError(`Invalid type '${String(type)}' for RepeaterDayPortion`);
    }

    if (!this.range) throw new RuntimeError("Range should have been set by now");
  }

  next(pointer: string): Span {
    super.next(pointer);

    const now = this.now!;
    const range = this.range!;
    if (!this.currentSpan) {
      const nowSeconds = now.minus(Chronic.construct(now.year, now.month, now.day)) as number;
      let rangeStart: RubyTime | undefined;
      if (nowSeconds < range.begin!) {
        switch (pointer) {
          case "future":
            rangeStart = Chronic.construct(now.year, now.month, now.day).plus(range.begin!);
            break;
          case "past":
            rangeStart = Chronic.construct(now.year, now.month, now.day - 1).plus(range.begin!);
            break;
        }
      } else if (nowSeconds > range.end!) {
        switch (pointer) {
          case "future":
            rangeStart = Chronic.construct(now.year, now.month, now.day + 1).plus(range.begin!);
            break;
          case "past":
            rangeStart = Chronic.construct(now.year, now.month, now.day).plus(range.begin!);
            break;
        }
      } else {
        switch (pointer) {
          case "future":
            rangeStart = Chronic.construct(now.year, now.month, now.day + 1).plus(range.begin!);
            break;
          case "past":
            rangeStart = Chronic.construct(now.year, now.month, now.day - 1).plus(range.begin!);
            break;
        }
      }
      const offset = range.end! - range.begin!;
      const rangeEnd = this.constructDateFromReferenceAndOffset(rangeStart!, offset);
      return (this.currentSpan = new Span(rangeStart!, rangeEnd));
    } else {
      let daysToShiftWindow: number | undefined;
      switch (pointer) {
        case "future":
          daysToShiftWindow = 1;
          break;
        case "past":
          daysToShiftWindow = -1;
          break;
      }

      const newBegin = Chronic.construct(
        this.currentSpan.begin!.year,
        this.currentSpan.begin!.month,
        this.currentSpan.begin!.day + daysToShiftWindow!,
        this.currentSpan.begin!.hour,
        this.currentSpan.begin!.min,
        this.currentSpan.begin!.sec,
      );
      const newEnd = Chronic.construct(
        this.currentSpan.end!.year,
        this.currentSpan.end!.month,
        this.currentSpan.end!.day + daysToShiftWindow!,
        this.currentSpan.end!.hour,
        this.currentSpan.end!.min,
        this.currentSpan.end!.sec,
      );
      return (this.currentSpan = new Span(newBegin, newEnd));
    }
  }

  this(context = "future"): Span {
    super.this(context);

    const rangeStart = Chronic.construct(this.now!.year, this.now!.month, this.now!.day).plus(
      this.range!.begin!,
    );
    const rangeEnd = this.constructDateFromReferenceAndOffset(rangeStart);
    return (this.currentSpan = new Span(rangeStart, rangeEnd));
  }

  offset(span: Span, amount: number, pointer: string): Span {
    this.now = span.begin!;
    const portionSpan = this.next(pointer);
    const direction = pointer === "future" ? 1 : -1;
    return portionSpan.plus(direction * (amount - 1) * RepeaterDay.DAY_SECONDS);
  }

  width(): number {
    if (!this.range) throw new RuntimeError("Range has not been set");
    if (this.currentSpan) return this.currentSpan.width();
    if (Number.isInteger(this.type)) {
      return 12 * 60 * 60;
    } else {
      return this.range.end! - this.range.begin!;
    }
  }

  toString(): string {
    return super.toString() + "-dayportion-" + String(this.type);
  }

  /** @internal */
  private constructDateFromReferenceAndOffset(
    reference: RubyTime,
    offset: number | null = null,
  ): RubyTime {
    const elapsedSecondsForRange = offset ?? this.range!.end! - this.range!.begin!;
    const secondHand = fixMod(elapsedSecondsForRange - 12 * 60, 60);
    const minuteHand = fixMod(fixDiv(elapsedSecondsForRange - secondHand, 60), 60);
    const hourHand =
      fixDiv(elapsedSecondsForRange - minuteHand - secondHand, 60 * 60) +
      fixMod(reference.hour, 24);
    return Chronic.construct(
      reference.year,
      reference.month,
      reference.day,
      hourHand,
      minuteHand,
      secondHand,
    );
  }
}

Chronic.RepeaterDayPortion = RepeaterDayPortion;
