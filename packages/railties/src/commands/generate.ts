import { Command } from "commander";
import { ModelGenerator } from "../generators/model-generator.js";
import { MigrationGenerator } from "../generators/migration-generator.js";
import { ControllerGenerator } from "../generators/controller-generator.js";
import { ScaffoldGenerator } from "../generators/scaffold-generator.js";

export function generateCommand(): Command {
  const cmd = new Command("generate");
  cmd.alias("g");
  cmd.description("Generate models, controllers, migrations, and scaffolds");

  cmd
    .command("model")
    .description("Generate a model with attributes")
    .argument("<name>", "Model name (e.g. User)")
    .argument("[attributes...]", "Attributes as name:type pairs")
    .option("--no-migration", "Skip migration generation")
    .option("--no-test", "Skip test file generation")
    .option("--no-timestamps", "Skip timestamps in migration")
    .action(
      (
        name: string,
        attributes: string[],
        opts: { migration: boolean; test: boolean; timestamps: boolean },
      ) => {
        const gen = new ModelGenerator({ cwd: process.cwd(), output: console.log });
        gen.run(name, attributes, {
          migration: opts.migration,
          test: opts.test,
          timestamps: opts.timestamps,
        });
      },
    );

  cmd
    .command("migration")
    .description("Generate a database migration")
    .argument("<name>", "Migration name (e.g. AddEmailToUsers)")
    .argument("[columns...]", "Columns as name:type pairs")
    .action((name: string, columns: string[]) => {
      const gen = new MigrationGenerator({ cwd: process.cwd(), output: console.log });
      gen.run(name, columns);
    });

  cmd
    .command("controller")
    .description("Generate a controller with actions")
    .argument("<name>", "Controller name (e.g. Posts)")
    .argument("[actions...]", "Action names (e.g. index show create)")
    .action((name: string, actions: string[]) => {
      const gen = new ControllerGenerator({ cwd: process.cwd(), output: console.log });
      gen.run(name, actions);
    });

  cmd
    .command("scaffold")
    .description("Generate a complete CRUD resource")
    .argument("<name>", "Resource name (e.g. Post)")
    .argument("[attributes...]", "Attributes as name:type pairs")
    .action((name: string, attributes: string[]) => {
      const gen = new ScaffoldGenerator({ cwd: process.cwd(), output: console.log });
      gen.run(name, attributes);
    });

  return cmd;
}
