import { cwd as getCwd } from "@blazetrails/activesupport/process-adapter";
import { Command } from "commander";
import path from "node:path";
import { execSync } from "node:child_process";
import { AppGenerator } from "../generators/app-generator.js";
import { getPackageManager, packageManagerInstall } from "../package-manager.js";

export function newCommand(): Command {
  const cmd = new Command("new");

  cmd
    .description("Create a new trails application")
    .argument("<name>", "Application name")
    .option("-d, --database <type>", "Database adapter (sqlite, postgres, mysql)", "sqlite")
    .option("--skip-git", "Skip git init")
    .option("--skip-install", "Skip dependency installation")
    .option("--skip-docker", "Skip Dockerfile creation")
    .action(async (name: string, options) => {
      const cwd = getCwd();
      const gen = new AppGenerator({
        cwd,
        output: console.log,
        appPath: name,
        database: options.database,
        skipDocker: options.skipDocker,
      });
      await gen.run();

      const appDir = path.join(cwd, name);

      if (!options.skipGit) {
        try {
          execSync("git init", { cwd: appDir, stdio: "pipe" });
          console.log("  Initialized git repository");
        } catch {
          // git not available
        }
      }

      if (!options.skipInstall) {
        // Detect from the *caller* cwd, not appDir: a freshly generated app
        // has no lockfile, so detecting in appDir always falls back to npm
        // and silently downgrades anyone who invoked `trails new` from a
        // pnpm/yarn/bun workspace. Falls back to pnpm (the historical
        // trails default) when caller cwd has no lockfile either.
        const pm = getPackageManager(cwd, { fallback: "pnpm" });
        console.log(`  Installing dependencies with ${pm.name}...`);
        const result = packageManagerInstall(appDir, pm);
        if (result.status === 0) {
          console.log("  Dependencies installed");
        } else {
          console.log(`  Could not install dependencies — run '${pm.name} install' manually`);
        }
      }

      console.log("");
      console.log(`  Done! cd ${name} && trails server`);
    });

  return cmd;
}
