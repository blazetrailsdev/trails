// mirrors packages/activerecord/src/type/internal/timezone.ts verbatim in shape
import { initialize } from "@blazetrails/activesupport";
import { defaultTimezone } from "./ri-root.js";

export interface TimezoneOptions {
  timezone?: "utc" | "local";
}

export class Timezone {
  declare _timezone?: "utc" | "local";

  static *[initialize](
    this: Timezone,
    { timezone, ...kwargs }: TimezoneOptions = {},
  ): Generator<[typeof kwargs]> {
    yield [kwargs];
    this._timezone = timezone ?? (defaultTimezone as "utc" | "local");
  }
}
