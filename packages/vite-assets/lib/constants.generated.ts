import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./config.js";
import * as m1 from "./dev-server-proxy.js";
import * as m2 from "./error.js";
import * as m3 from "./manifest.js";
import * as m4 from "./missing-entrypoint-error.js";
import * as m5 from "./missing-executable-error.js";

defineConstants([
  [() => m0.Config, "ViteAssets::Config"],
  [() => m1.DevServerProxy, "ViteAssets::DevServerProxy"],
  [() => m2.Error, "ViteAssets::Error"],
  [() => m3.Manifest, "ViteAssets::Manifest"],
  [() => m4.MissingEntrypointError, "ViteAssets::MissingEntrypointError"],
  [() => m5.MissingExecutableError, "ViteAssets::MissingExecutableError"],
]);
