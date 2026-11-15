import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./build.js";
import * as m1 from "./builder.js";
import * as m2 from "./config.js";
import * as m3 from "./dev-server-proxy.js";
import * as m4 from "./error.js";
import * as m5 from "./io.js";
import * as m6 from "./manifest.js";
import * as m7 from "./missing-entrypoint-error.js";
import * as m8 from "./missing-executable-error.js";
import * as m9 from "./runner.js";

defineConstants([
  [() => m0.Build, "ViteAssets::Build"],
  [() => m1.Builder, "ViteAssets::Builder"],
  [() => m2.Config, "ViteAssets::Config"],
  [() => m3.DevServerProxy, "ViteAssets::DevServerProxy"],
  [() => m4.Error, "ViteAssets::Error"],
  [() => m5.IO, "ViteAssets::IO"],
  [() => m6.Manifest, "ViteAssets::Manifest"],
  [() => m7.MissingEntrypointError, "ViteAssets::MissingEntrypointError"],
  [() => m8.MissingExecutableError, "ViteAssets::MissingExecutableError"],
  [() => m9.Runner, "ViteAssets::Runner"],
]);
