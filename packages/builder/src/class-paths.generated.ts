import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./xmlbase.js";
import * as m1 from "./xmlevents.js";
import * as m2 from "./xmlmarkup.js";

registerClassPaths([
  [() => m0.IllegalBlockError, "Builder::IllegalBlockError"],
  [() => m0.XmlBase, "Builder::XmlBase"],
  [() => m1.XmlEvents, "Builder::XmlEvents"],
  [() => m2.XmlMarkup, "Builder::XmlMarkup"],
]);
