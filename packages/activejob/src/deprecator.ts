import { Deprecation } from "@blazetrails/activesupport";
import { ActiveJob } from "./active-job.js";

export function deprecator(): Deprecation {
  if (!(ActiveJob._deprecator != null && ActiveJob._deprecator !== false))
    ActiveJob._deprecator = new Deprecation();
  return ActiveJob._deprecator;
}
