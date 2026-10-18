import { runLoadHooks } from "@blazetrails/activesupport";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { ActiveJob } from "./namespaces.js";

export class Base {
  static toString(): string {
    return "ActiveJob::Base";
  }
}
rbModConstSet(ActiveJob, "Base", Base);

runLoadHooks("active_job", Base);
