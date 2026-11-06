import { zoneDefault, type TimeZone } from "@blazetrails/activesupport";

export class Timezone {
  get isUtc(): boolean {
    const defaultZone = zoneDefault();
    if (defaultZone != null) {
      return (defaultZone as TimeZone).name === "UTC";
    } else {
      return true;
    }
  }

  get defaultTimezone(): "utc" | "local" {
    return this.isUtc ? "utc" : "local";
  }
}
