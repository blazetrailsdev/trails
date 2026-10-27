import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./magic.js";
import * as m1 from "./mime-type.js";

registerClassPaths([
  [() => m0.Magic, "Marcel::Magic"],
  [() => m1.MimeType, "Marcel::MimeType"],
]);
