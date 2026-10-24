import "./parser.js";
import "./date.js";
import "./time.js";

import "./handler.js";
import "./handlers.js";
import "./mini-date.js";
import "./tag.js";
import "./span.js";
import "./token.js";
import "./grabber.js";
import "./pointer.js";
import "./scalar.js";
import "./ordinal.js";
import "./separator.js";
import "./sign.js";
import "./time-zone.js";
import "./numerizer.js";
import "./season.js";

import "./repeater.js";
import "./repeaters/repeater-year.js";
import "./repeaters/repeater-season.js";
import "./repeaters/repeater-season-name.js";
import "./repeaters/repeater-month.js";
import "./repeaters/repeater-month-name.js";
import "./repeaters/repeater-fortnight.js";
import "./repeaters/repeater-week.js";
import "./repeaters/repeater-weekend.js";
import "./repeaters/repeater-weekday.js";
import "./repeaters/repeater-day.js";
import "./repeaters/repeater-day-name.js";
import "./repeaters/repeater-day-portion.js";
import "./repeaters/repeater-hour.js";
import "./repeaters/repeater-minute.js";
import "./repeaters/repeater-second.js";
import "./repeaters/repeater-time.js";

import { Date as RubyDate, Time as RubyTime } from "@blazetrails/date";
import {
  fixDiv,
  fixMod,
  rbObjRespondTo,
  RUBY_VERSION,
  RuntimeError,
} from "@blazetrails/ruby-compat";
import { Date } from "./date.js";
import { Chronic, type TimeClass } from "./namespaces.js";
import type { Span } from "./span.js";
import { Time } from "./time.js";

export const VERSION = "0.10.2";

let _debug: boolean;
let _timeClass: TimeClass;

export function debug(): boolean {
  return _debug;
}

export function setDebug(value: boolean): void {
  _debug = value;
}

export function timeClass(): TimeClass {
  return _timeClass;
}

export function setTimeClass(value: TimeClass): void {
  _timeClass = value;
}

setDebug(false);
setTimeClass(RubyTime as unknown as TimeClass);

export function parse(text: string, options: Record<string, unknown> = {}): RubyTime | Span | null {
  return new Chronic.Parser(options).parse(text);
}

/** @inventedArm if — CONVERGEABLE date-datetime-new-spelling-converges-with-time-new */
export function construct(
  year: number,
  month = 1,
  day = 1,
  hour = 0,
  minute = 0,
  second = 0,
  offset: number | string | null = null,
): RubyTime {
  if (second >= 60) {
    minute += fixDiv(second, 60);
    second = fixMod(second, 60);
  }

  if (minute >= 60) {
    hour += fixDiv(minute, 60);
    minute = fixMod(minute, 60);
  }

  if (hour >= 24) {
    day += fixDiv(hour, 24);
    hour = fixMod(hour, 24);
  }

  if (!(day <= 56))
    throw new RuntimeError("day must be no more than 56 (makes month resolution easier)");
  if (day > 28) {
    const daysThisMonth = RubyDate.isLeap(year)
      ? Date.MONTH_DAYS_LEAP[month]!
      : Date.MONTH_DAYS[month]!;
    if (day > daysThisMonth) {
      month += fixDiv(day, daysThisMonth);
      day = fixMod(day, daysThisMonth);
    }
  }

  if (month > 12) {
    if (fixMod(month, 12) === 0) {
      year += fixDiv(month - 12, 12);
      month = 12;
    } else {
      year += fixDiv(month, 12);
      month = fixMod(month, 12);
    }
  }
  if (Chronic.timeClass().name === "Date") {
    return new (Chronic.timeClass() as unknown as typeof RubyDate)(
      year,
      month,
      day,
    ) as unknown as RubyTime;
  } else if (
    !(rbObjRespondTo(Chronic.timeClass(), "new") || typeof Chronic.timeClass() === "function") ||
    (parseFloat(RUBY_VERSION) < 1.9 && Chronic.timeClass().name === "Time")
  ) {
    return Chronic.timeClass().local(year, month, day, hour, minute, second);
  } else {
    if (Chronic.timeClass().name === "DateTime") offset = Time.normalizeOffset(offset);
    if (!rbObjRespondTo(Chronic.timeClass(), "new")) {
      return new (Chronic.timeClass() as unknown as new (...args: unknown[]) => RubyTime)(
        year,
        month,
        day,
        hour,
        minute,
        second,
        offset,
      );
    }
    return Chronic.timeClass().new!(year, month, day, hour, minute, second, offset);
  }
}

Chronic.VERSION = VERSION;
Chronic.debug = debug;
Chronic.setDebug = setDebug;
Chronic.timeClass = timeClass;
Chronic.setTimeClass = setTimeClass;
Chronic.parse = parse;
Chronic.construct = construct;

export { Chronic };
