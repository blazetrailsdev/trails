import { DateTimeType as ActiveModelDateTime } from "@blazetrails/activemodel";
import { include } from "@blazetrails/activesupport";
import { Timezone, type TimezoneOptions } from "./internal/timezone.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include Internal::Timezone`; the class/interface merge is how `include()` surfaces on the type side.
export interface DateTime extends Timezone {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DateTime extends ActiveModelDateTime {
  constructor(options?: TimezoneOptions) {
    super(options);
    this._timezone = options?.timezone;
  }
}

include(DateTime, Timezone);
