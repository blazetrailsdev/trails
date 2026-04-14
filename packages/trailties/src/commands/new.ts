import { Command } from "commander";
import path from "node:path";
import { execSync } from "node:child_process";
import { AppGenerator } from "../generators/app-generator.js";

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
      const cwd = process.cwd();
      const gen = new AppGenerator({
        cwd,
        output: console.log,
      });
      await gen.run(name, {
        database: options.database,
        skipDocker: options.skipDocker,
      });

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
        console.log("  Installing dependencies...");
        try {
          execSync("pnpm install", { cwd: appDir, stdio: "pipe" });
          console.log("  Dependencies installed");
        } catch {
          console.log("  Could not install dependencies — run 'pnpm install' manually");
        }
      }

      console.log("");
      console.log(`  Done! cd ${name} && trails server`);
    });

  return cmd;
}
