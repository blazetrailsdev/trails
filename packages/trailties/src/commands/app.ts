import { Dir, File } from "@blazetrails/ruby-compat";
import { Command } from "commander";
import { AppGenerator } from "../generators/app-generator.js";
import { generateCommand } from "./generate.js";

export function appTemplateCommand(): Command {
  return new Command("app:template")
    .description("Apply the template supplied by <location>")
    .argument("<location>", "Template file (.mjs/.js; .ts needs a TS loader like tsx)")
    .action(async (location: string) => {
      const gen = new AppGenerator({ cwd: Dir.pwd(), output: console.log });
      (await gen.sourcePaths()).push(Dir.pwd());
      await gen.apply(File.expandPath(location), { verbose: false });
      for (const { what, args } of gen.pendingGenerators) {
        await generateCommand()
          .exitOverride()
          .parseAsync(["node", "g", what, ...args]);
      }
    });
}
