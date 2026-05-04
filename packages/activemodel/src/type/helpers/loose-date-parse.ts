import { Temporal } from "@blazetrails/activesupport/temporal";

export interface LooseDateParts {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
  microsecond?: number;
}

/**
 * Loosely parse a date/time string, mirroring Ruby's `Date._parse(string, false)`.
 *
 * Supported formats (in evaluation order):
 *   - ISO 8601 datetime:   "2020-07-04T15:30:00", "2020-07-04T15:30:00Z"
 *   - ISO 8601 date:       "2020-07-04"
 *   - ISO 8601 time:       "15:30", "15:30:45"
 *   - US slashes:          "7/4/2020" (MM/DD/YYYY)
 *   - Year-first slashes:  "2020/07/04" (YYYY/MM/DD)
 *   - Month-name day year: "July 4, 2020", "July 4 2020" (case-insensitive)
 *   - Day-first month:     "4 July 2020" (case-insensitive)
 *   - 12-hour time:        "3pm", "3:30 PM" (case-insensitive)
 *   - 24-hour time:        "15:30", "15:30:45"
 *
 * Returns `null` for unrecognised input.
 *
 * @internal Rails-private helper.
 */
export function looseDateParse(input: string): LooseDateParts | null {
  const s = input.trim();
  if (s === "") return null;

  // Layer 1: ISO datetime (with or without timezone offset)
  if (/Z$|[+-]\d{2}:\d{2}$/.test(s)) {
    try {
      const pdt = Temporal.Instant.from(s).toZonedDateTimeISO("UTC").toPlainDateTime();
      return toDateTimeParts(pdt);
    } catch {
      // fall through
    }
  }

  try {
    const pdt = Temporal.PlainDateTime.from(s);
    return toDateTimeParts(pdt);
  } catch {
    // fall through
  }

  // Layer 2: ISO date only
  try {
    const pd = Temporal.PlainDate.from(s);
    return { year: pd.year, month: pd.month, day: pd.day };
  } catch {
    // fall through
  }

  // Layer 3: ISO time only
  try {
    const pt = Temporal.PlainTime.from(s);
    return toTimeParts(pt);
  } catch {
    // fall through
  }

  // Layer 4: regex set for common non-ISO formats

  // US slashes: MM/DD/YYYY
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return { year: int(m[3]), month: int(m[1]), day: int(m[2]) };

  // Year-first slashes: YYYY/MM/DD
  m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (m) return { year: int(m[1]), month: int(m[2]), day: int(m[3]) };

  // Month-name day year: "July 4, 2020" or "July 4 2020"
  m = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m) {
    const month = monthNumber(m[1]);
    if (month) return { year: int(m[3]), month, day: int(m[2]) };
  }

  // Day-first month year: "4 July 2020"
  m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(s);
  if (m) {
    const month = monthNumber(m[2]);
    if (month) return { year: int(m[3]), month, day: int(m[1]) };
  }

  // 12-hour time: "3pm", "3:30 PM", "12 AM"
  m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.exec(s);
  if (m) {
    let hour = int(m[1]);
    const minute = m[2] !== undefined ? int(m[2]) : undefined;
    const ampm = m[3].toLowerCase();
    hour = ampm === "am" ? (hour === 12 ? 0 : hour) : hour === 12 ? 12 : hour + 12;
    const parts: LooseDateParts = { hour };
    if (minute !== undefined) parts.minute = minute;
    return parts;
  }

  // 24-hour time: "15:30" or "15:30:45"
  m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) {
    const parts: LooseDateParts = { hour: int(m[1]), minute: int(m[2]) };
    if (m[3] !== undefined) parts.second = int(m[3]);
    return parts;
  }

  return null;
}

function toDateTimeParts(pdt: Temporal.PlainDateTime): LooseDateParts {
  return {
    year: pdt.year,
    month: pdt.month,
    day: pdt.day,
    hour: pdt.hour,
    minute: pdt.minute,
    second: pdt.second,
    millisecond: pdt.millisecond,
    microsecond: pdt.microsecond,
  };
}

function toTimeParts(pt: Temporal.PlainTime): LooseDateParts {
  return {
    hour: pt.hour,
    minute: pt.minute,
    second: pt.second,
    millisecond: pt.millisecond,
    microsecond: pt.microsecond,
  };
}

function int(s: string): number {
  return parseInt(s, 10);
}

const MONTH_NAMES: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function monthNumber(name: string): number | null {
  return MONTH_NAMES[name.toLowerCase()] ?? null;
}
