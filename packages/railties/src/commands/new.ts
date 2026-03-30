import { Command } from "commander";
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
        skipGit: options.skipGit,
        skipInstall: options.skipInstall,
        skipDocker: options.skipDocker,
      });
    });

  return cmd;
}
