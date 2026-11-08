import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./generators/trails/plugin/plugin-generator.js";

defineConstants([
  [() => m0.PluginGenerator, "Trails::Generators::PluginGenerator"],
  [() => m0.PluginBuilder, "Trails::PluginBuilder"],
]);
