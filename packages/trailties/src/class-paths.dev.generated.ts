import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./commands/dev.js";

registerClassPaths([[() => m0.DevCommand, "Rails::Command::DevCommand"]]);
