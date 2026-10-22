import { Concern, extend, useZone } from "@blazetrails/activesupport";
import { block as rbBlock, rbModConstSet } from "@blazetrails/ruby-compat";
import { ActiveJob } from "./namespaces.js";

interface TimezonesJob {
  timezone: string | null;
}

interface TimezonesClass {
  aroundPerform(...filters: unknown[]): void;
}

export const Timezones = {};
extend(Timezones, Concern);

(
  Timezones as unknown as { included(base: null, block: (this: TimezonesClass) => void): void }
).included(null, function (this: TimezonesClass) {
  this.aroundPerform(
    rbBlock(function (job: TimezonesJob, block: () => unknown) {
      return useZone(job.timezone, block);
    }),
  );
});

rbModConstSet(ActiveJob, "Timezones", Timezones);
