import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./config.js";
import * as m1 from "./error.js";
import * as m2 from "./manifest.js";
import * as m3 from "./missing-entrypoint-error.js";
import * as m4 from "./missing-executable-error.js";

defineConstants([
  [() => m0.Config, "ViteRuby::Config"],
  [() => m1.Error, "ViteRuby::Error"],
  [() => m2.Manifest, "ViteRuby::Manifest"],
  [() => m3.MissingEntrypointError, "ViteRuby::MissingEntrypointError"],
  [() => m4.MissingExecutableError, "ViteRuby::MissingExecutableError"],
]);
