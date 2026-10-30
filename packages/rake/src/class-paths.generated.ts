import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./file-utils-ext.js";
import * as m1 from "./pseudo-status.js";
import * as m2 from "./version.js";

registerClassPaths([
  [() => m0.FileUtilsExt, "Rake::FileUtilsExt"],
  [() => m1.PseudoStatus, "Rake::PseudoStatus"],
  [() => m2.Version, "Rake::Version"],
]);
