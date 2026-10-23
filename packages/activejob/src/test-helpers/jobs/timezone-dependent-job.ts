import { zone } from "@blazetrails/activesupport";
import { Time as RubyTime } from "@blazetrails/date";
import { rbFSend, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { rbBinop } from "../../codegen-runtime.js";
import { JobBuffer } from "../../test-helpers/support/job-buffer.js";

export class TimezoneDependentJob extends Base {
  static toString(): string {
    return "TimezoneDependentJob";
  }

  perform(now: unknown) {
    now = rbFSend(now, "inTimeZone");
    const newYear = this.localtime(2018, 1, 1);
    if (rbBinop(now, ">=", newYear)) {
      return JobBuffer.add("Happy New Year!");
    } else {
      return JobBuffer.add(
        `Just ${Math.floor(rbBinop(newYear, "-", now) / 3600) ?? ""} hours to go`,
      );
    }
  }

  /** @internal */
  protected localtime(...args: number[]) {
    if (zone() != null) {
      return zone()!.local(...args);
    } else {
      return RubyTime.utc(...args);
    }
  }
}
registerConstant("TimezoneDependentJob", TimezoneDependentJob);
