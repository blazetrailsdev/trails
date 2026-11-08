import type { Time as RubyTime } from "@blazetrails/date";
import {
  ArgumentError,
  RuntimeError,
  kernelCatch,
  kernelThrow,
  stringSplit,
  toI,
  toF,
} from "@blazetrails/ruby-compat";
import { Chronic } from "../namespaces.js";
import { Repeater } from "../repeater.js";
import { Span } from "../span.js";

export class Tick {
  time: number;
  /** @internal */
  ambiguous: boolean;

  constructor(time: number, ambiguous = false) {
    this.time = time;
    this.ambiguous = ambiguous;
  }

  isAmbiguous(): boolean {
    return this.ambiguous;
  }

  multiply(other: number): Tick {
    return new Tick(this.time * other, this.ambiguous);
  }

  toF(): number {
    return this.time;
  }

  toString(): string {
    return String(this.time) + (this.ambiguous ? "?" : "");
  }
}

export class RepeaterTime extends Repeater<Tick> {
  static Tick = Tick;

  /** @internal */
  currentTime: RubyTime | null;

  constructor(time: string, options: Record<string, unknown> = {}) {
    super(time as never, options);
    this.currentTime = null;
    this.options = options;
    const timeParts = stringSplit(time, ":");
    if (timeParts.length > 4) {
      throw new ArgumentError("Time cannot have more than 4 groups of ':'");
    }

    if (timeParts[0].length > 2 && timeParts.length === 1) {
      if (timeParts[0].length > 4) {
        const secondIndex = timeParts[0].length - 2;
        timeParts.splice(1, 0, timeParts[0].slice(secondIndex));
        timeParts[0] = timeParts[0].slice(0, secondIndex);
      }
      const minuteIndex = timeParts[0].length - 2;
      timeParts.splice(1, 0, timeParts[0].slice(minuteIndex));
      timeParts[0] = timeParts[0].slice(0, minuteIndex);
    }

    let ambiguous = false;
    let hours = toI(timeParts[0]) as number;

    if (
      this.options.hours24 == null ||
      (this.options.hours24 != null && this.options.hours24 !== true)
    ) {
      if (
        (timeParts[0].length === 1 && hours > 0) ||
        (hours >= 10 && hours <= 12) ||
        (this.options.hours24 === false && hours > 0)
      ) {
        ambiguous = true;
      }
      if (hours === 12 && ambiguous) hours = 0;
    }

    hours *= 60 * 60;
    let minutes = 0;
    let seconds = 0;
    let subseconds = 0;

    if (timeParts.length > 1) minutes = (toI(timeParts[1]) as number) * 60;
    if (timeParts.length > 2) seconds = toI(timeParts[2]) as number;
    if (timeParts.length > 3) {
      subseconds = toF(timeParts[3]) / 10 ** timeParts[3].length;
    }

    this.type = new Tick(hours + minutes + seconds + subseconds, ambiguous);
  }

  next(pointer: string): Span {
    super.next(pointer);

    const halfDay = 60 * 60 * 12;
    const fullDay = 60 * 60 * 24;

    let first = false;

    if (!this.currentTime) {
      first = true;
      const midnight = Chronic.timeClass().local(this.now!.year, this.now!.month, this.now!.day);

      const yesterdayMidnight = midnight.minus(fullDay) as RubyTime;
      let tomorrowMidnight = midnight.plus(fullDay);

      const offsetFix = midnight.gmtOffset - tomorrowMidnight.gmtOffset;
      tomorrowMidnight = tomorrowMidnight.plus(offsetFix);

      kernelCatch("done", () => {
        if (pointer === "future") {
          if (this.type.isAmbiguous()) {
            for (const t of [
              midnight.plus(this.type.time).plus(offsetFix),
              midnight.plus(halfDay).plus(this.type.time).plus(offsetFix),
              tomorrowMidnight.plus(this.type.time),
            ]) {
              if (t.compare(this.now)! >= 0) {
                this.currentTime = t;
                kernelThrow("done");
              }
            }
          } else {
            for (const t of [
              midnight.plus(this.type.time).plus(offsetFix),
              tomorrowMidnight.plus(this.type.time),
            ]) {
              if (t.compare(this.now)! >= 0) {
                this.currentTime = t;
                kernelThrow("done");
              }
            }
          }
        } else {
          if (this.type.isAmbiguous()) {
            for (const t of [
              midnight.plus(halfDay).plus(this.type.time).plus(offsetFix),
              midnight.plus(this.type.time).plus(offsetFix),
              yesterdayMidnight.plus(this.type.time).plus(halfDay),
            ]) {
              if (t.compare(this.now)! <= 0) {
                this.currentTime = t;
                kernelThrow("done");
              }
            }
          } else {
            for (const t of [
              midnight.plus(this.type.time).plus(offsetFix),
              yesterdayMidnight.plus(this.type.time),
            ]) {
              if (t.compare(this.now)! <= 0) {
                this.currentTime = t;
                kernelThrow("done");
              }
            }
          }
        }
      });

      if (!this.currentTime) throw new RuntimeError("Current time cannot be nil at this point");
    }

    if (!first) {
      const increment = this.type.isAmbiguous() ? halfDay : fullDay;
      this.currentTime = this.currentTime.plus(pointer === "future" ? increment : -increment);
    }

    return new Span(this.currentTime, this.currentTime.plus(this.width()));
  }

  this(context = "future"): Span {
    super.this(context);

    if (context === "none") context = "future";

    return this.next(context);
  }

  width(): number {
    return 1;
  }

  toString(): string {
    return super.toString() + "-time-" + this.type.toString();
  }
}

Chronic.RepeaterTime = RepeaterTime;
