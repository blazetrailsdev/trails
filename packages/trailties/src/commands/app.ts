import { cwd as getCwd } from "@blazetrails/activesupport/process-adapter";
import { getPath } from "@blazetrails/activesupport";
import { Command } from "commander";
import { AppGenerator } from "../generators/app-generator.js";

// Mirror of `bin/rails app:template`. Rails source:
// railties/lib/rails/tasks/framework.rake.
export function appCommand(): Command {
  const cmd = new Command("app");
  cmd.description("Apply app templates and other app-level tasks");

  cmd
    .command("template")
    .description("Apply the template supplied by <location>")
    .argument("<location>", "Path to a template file (.ts/.mjs/.js)")
    .action(async (location: string) => {
      const path = getPath();
      const absolute = path.isAbsolute?.(location) ? location : path.resolve(getCwd(), location);
      const url = path.pathToFileURL?.(absolute);
      const href = url ? url.href : absolute;
      const mod = await import(href);
      const template: unknown = mod.default ?? mod.template ?? mod;
      if (typeof template !== "function") {
        throw new Error(`App template ${location} does not export a function`);
      }
      const gen = new AppGenerator({ cwd: getCwd(), output: console.log });
      await (template as (g: AppGenerator) => unknown)(gen);
    });

  return cmd;
}
