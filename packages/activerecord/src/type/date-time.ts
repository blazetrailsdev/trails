import { DateTimeType as ActiveModelDateTime } from "@blazetrails/activemodel";
import { include } from "@blazetrails/activesupport";
import type { Initialized } from "@blazetrails/ruby-compat";
import { registerConstant } from "@blazetrails/ruby-compat";
import { Timezone } from "./internal/timezone.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include Internal::Timezone`; the class/interface merge is how `include()` surfaces on the type side.
export interface DateTime extends Timezone {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DateTime extends (ActiveModelDateTime as Initialized<
  typeof ActiveModelDateTime,
  typeof Timezone
>) {}

include(DateTime, Timezone);

registerConstant("ActiveRecord::Type::DateTime", DateTime);
