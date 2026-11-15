import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./build.js";
import * as m1 from "./builder.js";
import * as m2 from "./commands.js";
import * as m3 from "./config.js";
import * as m4 from "./dev-server-proxy.js";
import * as m5 from "./error.js";
import * as m6 from "./io.js";
import * as m7 from "./manifest.js";
import * as m8 from "./missing-entrypoint-error.js";
import * as m9 from "./missing-executable-error.js";
import * as m10 from "./runner.js";

defineConstants([
  [() => m0.Build, "ViteAssets::Build"],
  [() => m1.Builder, "ViteAssets::Builder"],
  [() => m2.Commands, "ViteAssets::Commands"],
  [() => m3.Config, "ViteAssets::Config"],
  [() => m4.DevServerProxy, "ViteAssets::DevServerProxy"],
  [() => m5.Error, "ViteAssets::Error"],
  [() => m6.IO, "ViteAssets::IO"],
  [() => m7.Manifest, "ViteAssets::Manifest"],
  [() => m8.MissingEntrypointError, "ViteAssets::MissingEntrypointError"],
  [() => m9.MissingExecutableError, "ViteAssets::MissingExecutableError"],
  [() => m10.Runner, "ViteAssets::Runner"],
]);
