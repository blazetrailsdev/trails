import { cwd as getCwd } from "@blazetrails/activesupport/process-adapter";
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
      const cwd = getCwd();
      const fileName = dasherize(name);
      const className = classify(name);
      const tableName = tableize(className);

      removeFile(cwd, `src/app/models/${fileName}.ts`);
      removeFile(cwd, `test/models/${fileName}.test.ts`);

      // Find and remove migration
      const migrationsDir = path.join(cwd, "db", "migrations");
      if (fs.existsSync(migrationsDir)) {
        // Match both the underscore form (post-1.12c, Rails-faithful)
        // and the hyphen form (pre-1.12c transitional). Escape the
        // user-derived tableName so regex metacharacters can't widen
        // the match.
        const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // Anchor to the start of the filename and require the timestamp
        // + separator so names like `..._recreate_posts.ts` cannot match
        // `create_posts.ts`.
        const pattern = new RegExp(`^\\d+[_-]create[_-]${escaped}\\.(ts|js)$`);
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
      const cwd = getCwd();
      const fileName = dasherize(name.replace(/Controller$/i, "")) + "-controller";
      removeFile(cwd, `src/app/controllers/${fileName}.ts`);
      removeFile(cwd, `test/controllers/${fileName}.test.ts`);
    });

  cmd
    .command("migration")
    .description("Remove a migration")
    .argument("<name>", "Migration name")
    .action((name: string) => {
      const cwd = getCwd();
      const migrationsDir = path.join(cwd, "db", "migrations");
      if (!fs.existsSync(migrationsDir)) return;

      // Anchor on `^<timestamp>[_-]<name>\.(ts|js)$` so a name like
      // `create_posts` does not also match `..._add_create_posts_flag.ts`.
      // Escape first so regex metacharacters in the user-supplied name
      // can't widen the match.
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const dashed = dasherize(escaped);
      const underscored = dashed.replace(/-/g, "_");
      const pattern = new RegExp(`^\\d+[_-](${dashed}|${underscored})\\.(ts|js)$`);
      for (const f of fs.readdirSync(migrationsDir)) {
        if (pattern.test(f)) {
          removeFile(cwd, `db/migrations/${f}`);
        }
      }
    });

  cmd
    .command("scaffold")
    .description("Remove a scaffold (model, controller, migration, tests)")
    .argument("<name>", "Resource name")
    .action((name: string) => {
      const cwd = getCwd();
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
        const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(`^\\d+[_-]create[_-]${escaped}\\.(ts|js)$`);
        for (const f of fs.readdirSync(migrationsDir)) {
          if (pattern.test(f)) {
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
