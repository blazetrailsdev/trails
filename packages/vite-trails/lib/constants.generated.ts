import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./config.js";
import * as m1 from "./engine.js";
import * as m2 from "./tag-helpers.js";

defineConstants([
  [() => m0.Config, "ViteTrails::Config"],
  [() => m1.Engine, "ViteTrails::Engine"],
  [() => m2.TagHelpers, "ViteTrails::TagHelpers"],
]);
