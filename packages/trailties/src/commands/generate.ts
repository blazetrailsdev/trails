import { Dir } from "@blazetrails/ruby-compat";
import { Command } from "commander";
import { ModelGenerator } from "../generators/model-generator.js";
import { MigrationGenerator } from "../generators/migration-generator.js";
import { Generators } from "../generators.js";

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
        const gen = new ModelGenerator({ cwd: Dir.pwd(), output: console.log });
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
      const gen = new MigrationGenerator({ cwd: Dir.pwd(), output: console.log });
      gen.run(name, columns);
    });

  const registered = new Set(cmd.commands.map((c) => c.name()));
  for (const { name, namespace, hidden, klass } of Generators.namespacesForHelp()) {
    if (registered.has(name)) continue;
    cmd
      .command(name, { hidden })
      .description(`Run the ${name} generator`)
      .argument("[args...]", "Generator arguments")
      .allowUnknownOption()
      .addHelpText("after", () => {
        const lines = [""];
        klass.classOptionsHelp((line) => lines.push(line));
        return lines.join("\n");
      })
      .action(async (args: string[]) => {
        await Generators.invoke(namespace, args, { cwd: Dir.pwd(), output: console.log });
      });
  }

  return cmd;
}
