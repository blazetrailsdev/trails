import { useZone, Concern } from "@blazetrails/activesupport";
import { block as rbBlock, extend, Module, rbModConstSet } from "@blazetrails/ruby-compat";
import { ActiveJob as ActiveJobSeat } from "./namespaces.js";

export const Timezones: any = new Module();
extend(Timezones, Concern);
Timezones.included(null, function (this: any): void {
  const base = this;
  base.aroundPerform(
    rbBlock(function (this: any, job?: any, block?: any) {
      return useZone(job.timezone, block);
    }),
  );
});
rbModConstSet(ActiveJobSeat, "Timezones", Timezones);
