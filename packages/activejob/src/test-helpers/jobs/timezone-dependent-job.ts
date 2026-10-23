import { inTimeZone, TimeWithZone, zone } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { cmp, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { JobBuffer } from "../support/job-buffer.js";

export class TimezoneDependentJob extends Base {
  static toString(): string {
    return "TimezoneDependentJob";
  }

  perform(now: string | TimeWithZone): void {
    now = inTimeZone(now as string) as TimeWithZone;
    const newYear = this.localtime(2018, 1, 1);

    if (cmp(now, newYear)! >= 0) {
      JobBuffer.add("Happy New Year!");
    } else {
      JobBuffer.add(`Just ${Math.floor((newYear as TimeWithZone).minus(now) / 3600)} hours to go`);
    }
  }

  /** @internal */
  private localtime(...args: [number, number, number]): TimeWithZone | Time {
    const timeZone = zone();
    return timeZone ? timeZone.local(...args) : Time.utc(...args);
  }
}
registerConstant("TimezoneDependentJob", TimezoneDependentJob);
