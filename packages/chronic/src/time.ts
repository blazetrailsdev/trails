import { Chronic } from "./namespaces.js";

export class Time {
  static HOUR_SECONDS = 3600;
  static MINUTE_SECONDS = 60;
  static SECOND_SECONDS = 1;
  static SUBSECOND_SECONDS = 0.001;

  static isCouldBeHour(hour: number): boolean {
    return hour >= 0 && hour <= 24;
  }

  static isCouldBeMinute(minute: number): boolean {
    return minute >= 0 && minute <= 60;
  }

  static isCouldBeSecond(second: number): boolean {
    return second >= 0 && second <= 60;
  }

  static isCouldBeSubsecond(subsecond: number): boolean {
    return subsecond >= 0 && subsecond <= 999999;
  }

  static normalizeOffset(offset: number | string | null): string {
    if (typeof offset === "string") return offset;
    if (offset == null) offset = Chronic.timeClass().now().toTime().utcOffset;
    let sign = "+";
    if (offset < 0) sign = "-";
    const hours = String(Math.trunc(Math.abs(offset) / 3600)).padStart(2, "0");
    const minutes = String(Math.abs(offset) % 3600).padStart(2, "0");
    return sign + hours + minutes;
  }
}

Chronic.Time = Time;
