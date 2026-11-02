import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./cref.js";
import * as m1 from "./cref/map.js";
import * as m2 from "./error.js";
import * as m3 from "./gem-inflector.js";
import * as m4 from "./gem-loader.js";
import * as m5 from "./inflector.js";
import * as m6 from "./loader.js";
import * as m7 from "./loader/callbacks.js";
import * as m8 from "./loader/config.js";
import * as m9 from "./loader/eager-load.js";
import * as m10 from "./loader/helpers.js";
import * as m11 from "./null-inflector.js";
import * as m12 from "./real-mod-name.js";
import * as m13 from "./registry.js";
import * as m14 from "./registry/explicit-namespaces.js";

registerClassPaths([
  [() => m0.Cref, "Zeitwerk::Cref"],
  [() => m1.Map, "Zeitwerk::Cref::Map"],
  [() => m2.Error, "Zeitwerk::Error"],
  [() => m3.GemInflector, "Zeitwerk::GemInflector"],
  [() => m4.GemLoader, "Zeitwerk::GemLoader"],
  [() => m5.Inflector, "Zeitwerk::Inflector"],
  [() => m6.Loader, "Zeitwerk::Loader"],
  [() => m7.Callbacks, "Zeitwerk::Loader::Callbacks"],
  [() => m8.Config, "Zeitwerk::Loader::Config"],
  [() => m9.EagerLoad, "Zeitwerk::Loader::EagerLoad"],
  [() => m10.Helpers, "Zeitwerk::Loader::Helpers"],
  [() => m2.NameError, "Zeitwerk::NameError"],
  [() => m11.NullInflector, "Zeitwerk::NullInflector"],
  [() => m12.RealModName, "Zeitwerk::RealModName"],
  [() => m13.Registry, "Zeitwerk::Registry"],
  [() => m14.ExplicitNamespaces, "Zeitwerk::Registry::ExplicitNamespaces"],
  [() => m2.ReloadingDisabledError, "Zeitwerk::ReloadingDisabledError"],
  [() => m2.SetupRequired, "Zeitwerk::SetupRequired"],
]);
