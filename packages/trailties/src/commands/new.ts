import { cwd as getCwd, exit } from "@blazetrails/activesupport/process-adapter";
import { Command } from "commander";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  AppGenerator,
  VALID_PACKAGE_MANAGERS,
  VALID_SQLITE_DRIVERS,
  type PackageManager,
  type SqliteDriver,
} from "../generators/app-generator.js";
import { getPackageManager, packageManagerInstall } from "../package-manager.js";

export function newCommand(): Command {
  const cmd = new Command("new");

  cmd
    .description("Create a new trails application")
    .argument("<name>", "Application name")
    .option("-d, --database <type>", "Database adapter (sqlite, postgres, mysql)", "sqlite")
    .option("--package-manager <pm>", "Package manager to use (pnpm, npm, yarn)", "pnpm")
    .option(
      "--sqlite-driver <driver>",
      "SQLite driver (better-sqlite3, node-sqlite, expo-sqlite)",
      "better-sqlite3",
    )
    .option("--skip-git", "Skip git init")
    .option("--skip-install", "Skip dependency installation")
    .option("--skip-docker", "Skip Dockerfile creation")
    .action(async (name: string, options) => {
      const pm = options.packageManager as PackageManager;
      const driver = options.sqliteDriver as SqliteDriver;

      if (!VALID_PACKAGE_MANAGERS.includes(pm)) {
        console.error(
          `Unknown package manager: '${pm}'. Valid options: ${VALID_PACKAGE_MANAGERS.join(", ")}`,
        );
        exit(1);
      }
      if (!VALID_SQLITE_DRIVERS.includes(driver)) {
        console.error(
          `Unknown SQLite driver: '${driver}'. Valid options: ${VALID_SQLITE_DRIVERS.join(", ")}`,
        );
        exit(1);
      }

      const cwd = getCwd();
      const gen = new AppGenerator({
        cwd,
        output: console.log,
        appPath: name,
        database: options.database,
        packageManager: pm,
        sqliteDriver: driver,
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
        console.log(`  Installing dependencies with ${pm}...`);
        const pmAdapter = getPackageManager(appDir, { fallback: pm });
        const result = packageManagerInstall(appDir, pmAdapter);
        if (result.status === 0) {
          console.log("  Dependencies installed");
        } else {
          console.log(`  Could not install dependencies — run '${pm} install' manually`);
        }
      }

      console.log("");
      console.log(`  Done! cd ${name} && trails server`);
    });

  return cmd;
}
