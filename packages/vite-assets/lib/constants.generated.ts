import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./config.js";
import * as m1 from "./error.js";
import * as m2 from "./manifest.js";
import * as m3 from "./missing-entrypoint-error.js";
import * as m4 from "./missing-executable-error.js";

defineConstants([
  [() => m0.Config, "ViteAssets::Config"],
  [() => m1.Error, "ViteAssets::Error"],
  [() => m2.Manifest, "ViteAssets::Manifest"],
  [() => m3.MissingEntrypointError, "ViteAssets::MissingEntrypointError"],
  [() => m4.MissingExecutableError, "ViteAssets::MissingExecutableError"],
]);
