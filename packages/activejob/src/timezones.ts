import { Concern, extend, useZone } from "@blazetrails/activesupport";
import { block as rbBlock } from "@blazetrails/ruby-compat";

interface TimezonesJob {
  timezone: string | null;
}

interface TimezonesClass {
  aroundPerform(...filters: unknown[]): void;
}

export const Timezones = {};
extend(Timezones, Concern);

Concern.included.call(Timezones as never, null, function (this: TimezonesClass) {
  this.aroundPerform(
    rbBlock(function (job: TimezonesJob, block: () => unknown) {
      return useZone(job.timezone, block);
    }),
  );
});
