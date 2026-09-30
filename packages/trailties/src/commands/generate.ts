import { Dir } from "@blazetrails/ruby-compat";
import { Command } from "commander";
import { MigrationGenerator } from "../generators/migration-generator.js";
import { Generators } from "../generators.js";
import { bootApplicationBang, loadGenerators } from "../command/actions.js";
import { APP_PATH } from "../app-path.js";

export function generateCommand(): Command {
  const cmd = new Command("generate");
  cmd.alias("g");
  cmd.description("Generate models, controllers, migrations, and scaffolds");

  cmd
    .command("migration")
    .description("Generate a database migration")
    .argument("<name>", "Migration name (e.g. AddEmailToUsers)")
    .argument("[columns...]", "Columns as name:type pairs")
    .action(async (name: string, columns: string[]) => {
      if (APP_PATH != null) {
        await bootApplicationBang();
        await loadGenerators();
      }
      const gen = new MigrationGenerator({ cwd: Dir.pwd(), output: console.log });
      await gen.run(name, columns);
    });

  const help = async (): Promise<void> => {
    if (APP_PATH != null) {
      await bootApplicationBang();
      await loadGenerators();
    }
    await Generators.help("generate", console.log);
  };

  cmd
    .argument("[generator]", "Generator name")
    .argument("[args...]", "Generator arguments")
    .allowUnknownOption()
    .passThroughOptions()
    .action(async (generator: string | undefined, args: string[]) => {
      if (!generator) return help();

      if (APP_PATH != null) {
        await bootApplicationBang();
        await loadGenerators();
      }

      await Generators.invoke(generator, args, {
        cwd: Dir.pwd(),
        output: console.log,
        behavior: "invoke",
      });
    });

  return cmd;
}
