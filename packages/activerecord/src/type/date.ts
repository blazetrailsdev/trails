import { DateType as ActiveModelDate } from "@blazetrails/activemodel";
import { include } from "@blazetrails/activesupport";
import { Timezone, type TimezoneOptions } from "./internal/timezone.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include Internal::Timezone`; the class/interface merge is how `include()` surfaces on the type side.
export interface Date extends Timezone {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Date extends ActiveModelDate {
  constructor(options?: TimezoneOptions) {
    super(options);
    this._timezone = options?.timezone;
  }
}

include(Date, Timezone);
