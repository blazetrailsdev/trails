import { Concern, useZone } from "@blazetrails/activesupport";
import { Time as RubyTime } from "@blazetrails/date";
import { extend, classModule, Extended } from "@blazetrails/ruby-compat";
import type { Base } from "./base.js";

export class Timezones {
  declare static included: Extended<typeof Concern>["included"];

  static readonly [classModule] = true;

  static toString(): string {
    return "ActiveJob::Timezones";
  }
}
extend(Timezones, Concern);
Timezones.included(null, function (this: typeof Base): void {
  this.aroundPerform(function (this: Base, job: unknown, block: unknown) {
    return useZone(job.timezone, block as () => unknown);
  });
});
