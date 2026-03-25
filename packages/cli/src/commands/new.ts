import { Command } from "commander";
import { AppGenerator } from "../generators/app-generator.js";

export function newCommand(): Command {
  const cmd = new Command("new");

  cmd
    .description("Create a new rails-ts application")
    .argument("<name>", "Application name")
    .option("-d, --database <type>", "Database adapter (sqlite, postgres, mysql)", "sqlite")
    .option("--skip-git", "Skip git init")
    .option("--skip-install", "Skip dependency installation")
    .action(async (name: string, options) => {
      const cwd = process.cwd();
      const gen = new AppGenerator({
        cwd,
        output: console.log,
      });
      await gen.run(name, {
        database: options.database,
        skipGit: options.skipGit,
        skipInstall: options.skipInstall,
      });
    });

  return cmd;
}
