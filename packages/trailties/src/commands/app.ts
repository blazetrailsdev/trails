import { Dir } from "@blazetrails/ruby-compat";
import { Command } from "commander";
import { AppGenerator } from "../generators/rails/app/app-generator.js";

export function appTemplateCommand(): Command {
  return new Command("app:template")
    .description("Apply the template supplied by <location>")
    .argument("<location>", "Template file (.mjs/.js/.ts)")
    .action(async (location: string) => {
      await AppGenerator.applyRailsTemplate(location, Dir.pwd());
    });
}
