import type { Time as RubyTime } from "@blazetrails/date";
import { ArgumentError, fixMod, Range } from "@blazetrails/ruby-compat";
import { Chronic } from "./namespaces.js";

export class MiniDate {
  month: number;
  day: number;

  static fromTime(time: RubyTime): MiniDate {
    return new this(time.month, time.day);
  }

  constructor(month: number, day: number) {
    if (!new Range(1, 12).isInclude(month)) {
      throw new ArgumentError("1..12 are valid months");
    }

    this.month = month;
    this.day = day;
  }

  isBetween(mdStart: MiniDate, mdEnd: MiniDate): boolean {
    if (
      this.month === mdStart.month &&
      this.month === mdEnd.month &&
      (this.day < mdStart.day || this.day > mdEnd.day)
    ) {
      return false;
    }
    if (
      (this.month === mdStart.month && this.day >= mdStart.day) ||
      (this.month === mdEnd.month && this.day <= mdEnd.day)
    ) {
      return true;
    }

    let i = fixMod(mdStart.month, 12) + 1;

    while (i !== mdEnd.month) {
      if (this.month === i) return true;
      i = fixMod(i, 12) + 1;
    }

    return false;
  }

  isEquals(other: MiniDate): boolean {
    return this.month === other.month && this.day === other.day;
  }
}

Chronic.MiniDate = MiniDate;
