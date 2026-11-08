import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./generators/trails/app/app-generator.js";

defineConstants([
  [() => m0.ActionMethods, "Trails::ActionMethods"],
  [() => m0.AppBuilder, "Trails::AppBuilder"],
  [() => m0.AppGenerator, "Trails::Generators::AppGenerator"],
  [() => m0.ARGVScrubber, "Trails::Generators::ARGVScrubber"],
]);
