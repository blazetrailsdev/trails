import { TopLevel } from "@blazetrails/ruby-compat";
import type { DataTimezone } from "../data-timezone.js";
import { TimezoneInfo } from "./timezone-info.js";

export class DataTimezoneInfo extends TimezoneInfo {
  override createTimezone(): DataTimezone {
    return new TopLevel.TZInfo!.DataTimezone(this);
  }
}
