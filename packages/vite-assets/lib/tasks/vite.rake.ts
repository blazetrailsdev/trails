import { DSL, Task } from "@blazetrails/rake";
import { ARGV, block, env as ENV, rbFSystem, setEnv } from "@blazetrails/ruby-compat";
import { ViteAssets } from "../vite-assets.js";

DSL.namespace("vite", () => {
  DSL.task(
    "binstubs",
    block(async () => {
      await ViteAssets.prewarmConfig();
      await ViteAssets.commands().installBinstubs();
    }),
  );

  DSL.desc("Bundle frontend entrypoints using ViteRuby");
  DSL.task(
    { build: "vite:verify_install" },
    block(async () => {
      await ViteAssets.commands().buildFromTask();
    }),
  );

  DSL.desc("Bundle a Node.js app from the SSR entrypoint using ViteRuby");
  DSL.task(
    { build_ssr: "vite:verify_install" },
    block(async () => {
      await ViteAssets.commands().buildFromTask("--ssr");
    }),
  );

  DSL.desc("Bundle entrypoints using Vite Ruby (SSR only if enabled)");
  DSL.task(
    { build_all: "vite:verify_install" },
    block(async () => {
      await ViteAssets.commands().buildFromTask();
      if (ViteAssets.config().ssrBuildEnabled) {
        await ViteAssets.commands().buildFromTask("--ssr");
      }
    }),
  );

  DSL.desc("Remove the build output directory for ViteRuby");
  DSL.task(
    { clobber: "vite:verify_install" },
    block(async () => {
      await ViteAssets.commands().clobber();
    }),
  );

  DSL.desc("Verify if ViteRuby is properly installed in the app");
  DSL.task(
    "verify_install",
    block(async () => {
      await ViteAssets.prewarmConfig();
      await ViteAssets.commands().verifyInstall();
    }),
  );

  DSL.desc("Ensure build dependencies like Vite are installed before bundling");
  DSL.task(
    "install_dependencies",
    block(async () => {
      await ViteAssets.prewarmConfig();
      const installEnvArgs: Record<string, string> =
        ENV["VITE_RUBY_SKIP_INSTALL_DEV_DEPENDENCIES"] === "true"
          ? {}
          : { NODE_ENV: "development" };

      const pkg = ViteAssets.config().packageManager;
      let installCmd: string;
      switch (pkg) {
        case "npm":
          installCmd = "npm ci";
          break;
        default:
          installCmd = `${pkg} install --frozen-lockfile`;
      }

      await rbFSystem(installEnvArgs, installCmd);
    }),
  );

  DSL.desc("Provide information on ViteRuby's environment");
  DSL.task(
    "info",
    block(async () => {
      await ViteAssets.prewarmConfig();
      await ViteAssets.commands().printInfo();
    }),
  );
});

if (ENV["VITE_RUBY_SKIP_ASSETS_PRECOMPILE_EXTENSION"] !== "true") {
  if (Task.isTaskDefined("assets:precompile")) {
    (await Task.get("assets:precompile")).enhance(null, async (task) => {
      const prefix = task.name.split(/#|assets:precompile/)[0];
      if (ENV["VITE_RUBY_SKIP_ASSETS_PRECOMPILE_INSTALL"] !== "true") {
        await (await Task.get(`${prefix}vite:install_dependencies`)).invoke();
      }
      await (await Task.get(`${prefix}vite:build_all`)).invoke();
    });
  } else {
    DSL.desc("Bundle Vite assets");
    if (ENV["VITE_RUBY_SKIP_ASSETS_PRECOMPILE_INSTALL"] === "true") {
      Task.defineTask({ "assets:precompile": "vite:build_all" });
    } else {
      Task.defineTask({ "assets:precompile": ["vite:install_dependencies", "vite:build_all"] });
    }
  }

  if (Task.isTaskDefined("assets:clobber")) {
    (await Task.get("assets:clobber")).enhance(null, async () => {
      await (await Task.get("vite:clobber")).invoke();
    });
  } else {
    DSL.desc("Remove compiled assets");
    Task.defineTask({ "assets:clobber": "vite:clobber" });
  }
}

if (ARGV.includes("assets:precompile")) {
  if (await ViteAssets.commands().isLegacyNpmVersion()) {
    setEnv("NPM_CONFIG_PRODUCTION", "false");
  } else {
    setEnv("NPM_CONFIG_INCLUDE", "dev");
  }
}
