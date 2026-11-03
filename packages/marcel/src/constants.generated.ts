import { defineConstants } from "@blazetrails/ruby-compat";
import "./marcel.js";
import * as m0 from "./magic.js";
import * as m1 from "./mime-type.js";

defineConstants([
  [() => m0.Magic, "Marcel::Magic"],
  [() => m1.MimeType, "Marcel::MimeType"],
]);
