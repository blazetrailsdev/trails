import { runLoadHooks } from "@blazetrails/activesupport";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { ActiveJob } from "./namespaces.js";

export class Base {}
rbModConstSet(ActiveJob, "Base", Base);

runLoadHooks("active_job", Base);
