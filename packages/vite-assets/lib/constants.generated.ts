import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./build.js";
import * as m1 from "./builder.js";
import * as m2 from "./commands.js";
import * as m3 from "./compatibility-check.js";
import * as m4 from "./config.js";
import * as m5 from "./dev-server-proxy.js";
import * as m6 from "./error.js";
import * as m7 from "./io.js";
import * as m8 from "./manifest.js";
import * as m9 from "./missing-entrypoint-error.js";
import * as m10 from "./missing-executable-error.js";
import * as m11 from "./runner.js";

defineConstants([
  [() => m0.Build, "ViteAssets::Build"],
  [() => m1.Builder, "ViteAssets::Builder"],
  [() => m2.Commands, "ViteAssets::Commands"],
  [() => m3.CompatibilityCheck, "ViteAssets::CompatibilityCheck"],
  [() => m4.Config, "ViteAssets::Config"],
  [() => m5.DevServerProxy, "ViteAssets::DevServerProxy"],
  [() => m6.Error, "ViteAssets::Error"],
  [() => m7.IO, "ViteAssets::IO"],
  [() => m8.Manifest, "ViteAssets::Manifest"],
  [() => m9.MissingEntrypointError, "ViteAssets::MissingEntrypointError"],
  [() => m10.MissingExecutableError, "ViteAssets::MissingExecutableError"],
  [() => m11.Runner, "ViteAssets::Runner"],
]);
