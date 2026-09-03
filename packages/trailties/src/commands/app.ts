import { Dir, File, getPathAsync } from "@blazetrails/ruby-compat";
import { Command } from "commander";
import { AppGenerator } from "../generators/app-generator.js";
import { generateCommand } from "./generate.js";

// Mirror of `bin/rails app:template`. Rails source:
// railties/lib/rails/tasks/framework.rake.
export function appTemplateCommand(): Command {
  return new Command("app:template")
    .description("Apply the template supplied by <location>")
    .argument("<location>", "Template file (.mjs/.js; .ts needs a TS loader like tsx)")
    .action(async (location: string) => {
      const { pathToFileURL } = await getPathAsync();
      if (!pathToFileURL) throw new Error("app:template needs PathAdapter.pathToFileURL");
      const abs = File.expandPath(location);
      const mod = await import(pathToFileURL(abs).href);
      const tmpl: unknown = mod.default ?? mod.template ?? mod;
      if (typeof tmpl !== "function") throw new Error(`${location} does not export a function`);
      const gen = new AppGenerator({ cwd: Dir.pwd(), output: console.log });
      await (tmpl as (g: AppGenerator) => unknown)(gen);
      for (const { what, args } of gen.pendingGenerators) {
        await generateCommand()
          .exitOverride()
          .parseAsync(["node", "g", what, ...args]);
      }
    });
}
