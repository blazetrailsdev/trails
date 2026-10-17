import { Deprecation } from "@blazetrails/activesupport";
import { rtest } from "@blazetrails/ruby-compat";
import { ActiveJob as ActiveJobSeat } from "./namespaces.js";

export function deprecator(): any {
  if (!rtest(ActiveJob._deprecator)) ActiveJob._deprecator = new Deprecation();
  return ActiveJob._deprecator;
}

export const ActiveJob: any = ActiveJobSeat;
Object.assign(ActiveJob, { deprecator });
