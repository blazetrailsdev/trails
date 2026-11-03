import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./cref.js";
import * as m1 from "./cref/map.js";
import * as m2 from "./error.js";
import * as m3 from "./inflector.js";
import * as m4 from "./loader.js";
import * as m5 from "./loader/callbacks.js";
import * as m6 from "./loader/config.js";
import * as m7 from "./loader/eager-load.js";
import * as m8 from "./loader/helpers.js";
import * as m9 from "./null-inflector.js";
import * as m10 from "./real-mod-name.js";
import * as m11 from "./registry.js";
import * as m12 from "./registry/explicit-namespaces.js";

defineConstants([
  [() => m0.Cref, "Zeitwerk::Cref"],
  [() => m1.Map, "Zeitwerk::Cref::Map"],
  [() => m2.Error, "Zeitwerk::Error"],
  [() => m3.Inflector, "Zeitwerk::Inflector"],
  [() => m4.Loader, "Zeitwerk::Loader"],
  [() => m5.Callbacks, "Zeitwerk::Loader::Callbacks"],
  [() => m6.Config, "Zeitwerk::Loader::Config"],
  [() => m7.EagerLoad, "Zeitwerk::Loader::EagerLoad"],
  [() => m8.Helpers, "Zeitwerk::Loader::Helpers"],
  [() => m2.NameError, "Zeitwerk::NameError"],
  [() => m9.NullInflector, "Zeitwerk::NullInflector"],
  [() => m10.RealModName, "Zeitwerk::RealModName"],
  [() => m11.Registry, "Zeitwerk::Registry"],
  [() => m12.ExplicitNamespaces, "Zeitwerk::Registry::ExplicitNamespaces"],
  [() => m2.ReloadingDisabledError, "Zeitwerk::ReloadingDisabledError"],
  [() => m2.SetupRequired, "Zeitwerk::SetupRequired"],
]);
