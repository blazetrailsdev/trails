import { Dir, File } from "@blazetrails/ruby-compat";
import { Command } from "commander";
import { classify, dasherize } from "../generators/base.js";
import { tableize } from "@blazetrails/activesupport";

export function destroyCommand(): Command {
  const cmd = new Command("destroy");
  cmd.alias("d");
  cmd.description("Remove files created by a generator");

  cmd
    .command("model")
    .description("Remove a model, its migration, and test")
    .argument("<name>", "Model name")
    .action((name: string) => {
      const cwd = Dir.pwd();
      const fileName = dasherize(name);
      const className = classify(name);
      const tableName = tableize(className);

      removeFile(cwd, `app/models/${fileName}.ts`);
      removeFile(cwd, `test/models/${fileName}.test.ts`);

      const migrationsDir = File.join(cwd, "db", "migrate");
      if (File.isExist(migrationsDir)) {
        const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(`^\\d+_create_${escaped}\\.(ts|js)$`);
        for (const f of Dir.children(migrationsDir)) {
          if (pattern.test(f)) {
            removeFile(cwd, `db/migrate/${f}`);
          }
        }
      }
    });

  cmd
    .command("controller")
    .description("Remove a controller and its test")
    .argument("<name>", "Controller name")
    .action((name: string) => {
      const cwd = Dir.pwd();
      const fileName = dasherize(name.replace(/Controller$/i, "")) + "-controller";
      removeFile(cwd, `app/controllers/${fileName}.ts`);
      removeFile(cwd, `test/controllers/${fileName}.test.ts`);
    });

  cmd
    .command("migration")
    .description("Remove a migration")
    .argument("<name>", "Migration name")
    .action((name: string) => {
      const cwd = Dir.pwd();
      const migrationsDir = File.join(cwd, "db", "migrate");
      if (!File.isExist(migrationsDir)) return;

      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const underscored = dasherize(escaped).replace(/-/g, "_");
      const pattern = new RegExp(`^\\d+_${underscored}\\.(ts|js)$`);
      for (const f of Dir.children(migrationsDir)) {
        if (pattern.test(f)) {
          removeFile(cwd, `db/migrate/${f}`);
        }
      }
    });

  cmd
    .command("scaffold")
    .description("Remove a scaffold (model, controller, migration, tests)")
    .argument("<name>", "Resource name")
    .action((name: string) => {
      const cwd = Dir.pwd();
      const fileName = dasherize(name);
      const className = classify(name);
      const tableName = tableize(className);

      removeFile(cwd, `app/models/${fileName}.ts`);
      removeFile(cwd, `test/models/${fileName}.test.ts`);

      removeFile(cwd, `app/controllers/${tableName}-controller.ts`);
      removeFile(cwd, `test/controllers/${tableName}-controller.test.ts`);

      const migrationsDir = File.join(cwd, "db", "migrate");
      if (File.isExist(migrationsDir)) {
        const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(`^\\d+_create_${escaped}\\.(ts|js)$`);
        for (const f of Dir.children(migrationsDir)) {
          if (pattern.test(f)) {
            removeFile(cwd, `db/migrate/${f}`);
          }
        }
      }
    });

  return cmd;
}

function removeFile(cwd: string, relativePath: string): void {
  const fullPath = File.join(cwd, relativePath);
  if (File.isExist(fullPath)) {
    File.delete(fullPath);
    console.log(`      remove  ${relativePath}`);
  }
}
