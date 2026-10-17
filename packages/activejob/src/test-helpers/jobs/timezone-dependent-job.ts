import { zone } from "@blazetrails/activesupport";
import { Time as RubyTime } from "@blazetrails/date";
import { rbFSend, rbObjAsString, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { rbBinop } from "../../codegen-runtime.js";
import { add } from "../../test-helpers/support/job-buffer.js";

export class TimezoneDependentJob extends Base {
  [key: string]: any;
  static [key: string]: any;

  perform(now: any): any {
    now = rbFSend(now, "inTimeZone");
    const newYear: any = this.localtime(2018, 1, 1);
    if (rbBinop(now, ">=", newYear)) {
      return add("Happy New Year!");
    } else {
      return add(
        `Just ${rbObjAsString(Math.floor(rbBinop(newYear, "-", now) / 3600))} hours to go`,
      );
    }
  }

  /** @internal */
  protected localtime(...args: any[]): any {
    if (zone() != null) {
      return zone().local(...args);
    } else {
      return RubyTime.utc(...args);
    }
  }
}
registerConstant("TimezoneDependentJob", TimezoneDependentJob);
