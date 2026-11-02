import type { ThorClass } from "@blazetrails/thor";
import { Command } from "commander";
import { AppGenerator } from "../generators/rails/app/app-generator.js";

AppGenerator.isExitOnFailure = () => true;

export function newCommand(): Command {
  const cmd = new Command("new");

  cmd
    .description("Create a new trails application")
    .helpOption(false)
    .allowUnknownOption()
    .allowExcessArguments()
    .action(async (_options, command: Command) => {
      await (AppGenerator as unknown as ThorClass).start(command.args);
    });

  return cmd;
}
