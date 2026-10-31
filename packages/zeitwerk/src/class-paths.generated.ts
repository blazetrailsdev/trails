import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./error.js";
import * as m1 from "./gem-inflector.js";
import * as m2 from "./inflector.js";
import * as m3 from "./null-inflector.js";

registerClassPaths([
  [() => m0.Error, "Zeitwerk::Error"],
  [() => m1.GemInflector, "Zeitwerk::GemInflector"],
  [() => m2.Inflector, "Zeitwerk::Inflector"],
  [() => m0.NameError, "Zeitwerk::NameError"],
  [() => m3.NullInflector, "Zeitwerk::NullInflector"],
  [() => m0.ReloadingDisabledError, "Zeitwerk::ReloadingDisabledError"],
  [() => m0.SetupRequired, "Zeitwerk::SetupRequired"],
]);
