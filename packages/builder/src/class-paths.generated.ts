import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./xchar.js";
import * as m1 from "./xmlbase.js";
import * as m2 from "./xmlevents.js";
import * as m3 from "./xmlmarkup.js";

registerClassPaths([
  [() => m1.IllegalBlockError, "Builder::IllegalBlockError"],
  [() => m0.XChar, "Builder::XChar"],
  [() => m1.XmlBase, "Builder::XmlBase"],
  [() => m2.XmlEvents, "Builder::XmlEvents"],
  [() => m3.XmlMarkup, "Builder::XmlMarkup"],
]);
