import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { classify, dasherize, tableize } from "../generators/base.js";

export function destroyCommand(): Command {
  const cmd = new Command("destroy");
  cmd.alias("d");
  cmd.description("Remove files created by a generator");

  cmd
    .command("model")
    .description("Remove a model, its migration, and test")
    .argument("<name>", "Model name")
    .action((name: string) => {
      const cwd = process.cwd();
      const fileName = dasherize(name);
      const className = classify(name);
      const tableName = tableize(className);

      removeFile(cwd, `src/app/models/${fileName}.ts`);
      removeFile(cwd, `test/models/${fileName}.test.ts`);

      // Find and remove migration
      const migrationsDir = path.join(cwd, "db", "migrations");
      if (fs.existsSync(migrationsDir)) {
        const pattern = new RegExp(`create-${tableName}\\.ts$`);
        for (const f of fs.readdirSync(migrationsDir)) {
          if (pattern.test(f)) {
            removeFile(cwd, `db/migrations/${f}`);
          }
        }
      }
    });

  cmd
    .command("controller")
    .description("Remove a controller and its test")
    .argument("<name>", "Controller name")
    .action((name: string) => {
      const cwd = process.cwd();
      const fileName = dasherize(name.replace(/Controller$/i, "")) + "-controller";
      removeFile(cwd, `src/app/controllers/${fileName}.ts`);
      removeFile(cwd, `test/controllers/${fileName}.test.ts`);
    });

  cmd
    .command("migration")
    .description("Remove a migration")
    .argument("<name>", "Migration name")
    .action((name: string) => {
      const cwd = process.cwd();
      const migrationsDir = path.join(cwd, "db", "migrations");
      if (!fs.existsSync(migrationsDir)) return;

      const dashed = dasherize(name);
      for (const f of fs.readdirSync(migrationsDir)) {
        if (f.includes(dashed)) {
          removeFile(cwd, `db/migrations/${f}`);
        }
      }
    });

  cmd
    .command("scaffold")
    .description("Remove a scaffold (model, controller, migration, tests)")
    .argument("<name>", "Resource name")
    .action((name: string) => {
      const cwd = process.cwd();
      const fileName = dasherize(name);
      const className = classify(name);
      const tableName = tableize(className);

      // Model
      removeFile(cwd, `src/app/models/${fileName}.ts`);
      removeFile(cwd, `test/models/${fileName}.test.ts`);

      // Controller
      removeFile(cwd, `src/app/controllers/${tableName}-controller.ts`);
      removeFile(cwd, `test/controllers/${tableName}-controller.test.ts`);

      // Migration
      const migrationsDir = path.join(cwd, "db", "migrations");
      if (fs.existsSync(migrationsDir)) {
        for (const f of fs.readdirSync(migrationsDir)) {
          if (f.includes(`create-${tableName}`) || f.includes(`create_${tableName}`)) {
            removeFile(cwd, `db/migrations/${f}`);
          }
        }
      }
    });

  return cmd;
}

function removeFile(cwd: string, relativePath: string): void {
  const fullPath = path.join(cwd, relativePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    console.log(`      remove  ${relativePath}`);
  }
}
