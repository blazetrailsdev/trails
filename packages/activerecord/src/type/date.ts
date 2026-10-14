import { DateType as ActiveModelDate } from "@blazetrails/activemodel";
import { include } from "@blazetrails/activesupport";
import { registerConstant } from "@blazetrails/ruby-compat";
import { Timezone, type TimezoneOptions } from "./internal/timezone.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include Internal::Timezone`; the class/interface merge is how `include()` surfaces on the type side.
export interface Date extends Timezone {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Date extends ActiveModelDate {
  /** @inlinedFrom ActiveRecord::Type::Internal::Timezone#initialize rails/v8.0.2/activerecord/lib/active_record/type/internal/timezone.rb:7-10 */
  constructor({
    timezone,
    ...kwargs
  }: TimezoneOptions & ConstructorParameters<typeof ActiveModelDate>[0] = {}) {
    super(kwargs);
    this._timezone = timezone;
  }
}

include(Date, Timezone);

registerConstant("ActiveRecord::Type::Date", Date);
