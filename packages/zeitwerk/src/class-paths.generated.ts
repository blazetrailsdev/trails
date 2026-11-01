import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./cref.js";
import * as m1 from "./cref/map.js";
import * as m2 from "./error.js";
import * as m3 from "./gem-inflector.js";
import * as m4 from "./inflector.js";
import * as m5 from "./loader.js";
import * as m6 from "./loader/config.js";
import * as m7 from "./loader/helpers.js";
import * as m8 from "./null-inflector.js";
import * as m9 from "./real-mod-name.js";
import * as m10 from "./registry.js";
import * as m11 from "./registry/explicit-namespaces.js";

registerClassPaths([
  [() => m0.Cref, "Zeitwerk::Cref"],
  [() => m1.Map, "Zeitwerk::Cref::Map"],
  [() => m2.Error, "Zeitwerk::Error"],
  [() => m3.GemInflector, "Zeitwerk::GemInflector"],
  [() => m4.Inflector, "Zeitwerk::Inflector"],
  [() => m5.Loader, "Zeitwerk::Loader"],
  [() => m6.Config, "Zeitwerk::Loader::Config"],
  [() => m7.Helpers, "Zeitwerk::Loader::Helpers"],
  [() => m2.NameError, "Zeitwerk::NameError"],
  [() => m8.NullInflector, "Zeitwerk::NullInflector"],
  [() => m9.RealModName, "Zeitwerk::RealModName"],
  [() => m10.Registry, "Zeitwerk::Registry"],
  [() => m11.ExplicitNamespaces, "Zeitwerk::Registry::ExplicitNamespaces"],
  [() => m2.ReloadingDisabledError, "Zeitwerk::ReloadingDisabledError"],
  [() => m2.SetupRequired, "Zeitwerk::SetupRequired"],
]);
