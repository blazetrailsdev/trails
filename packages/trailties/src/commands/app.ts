import { cwd as getCwd } from "@blazetrails/activesupport/process-adapter";
import { getPath } from "@blazetrails/activesupport";
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
      const path = getPath();
      if (!path.pathToFileURL) throw new Error("app:template needs PathAdapter.pathToFileURL");
      // PathAdapter contract: undefined isAbsolute → treat all paths as absolute.
      const abs =
        path.isAbsolute && !path.isAbsolute(location) ? path.resolve(getCwd(), location) : location;
      const mod = await import(path.pathToFileURL(abs).href);
      const tmpl: unknown = mod.default ?? mod.template ?? mod;
      if (typeof tmpl !== "function") throw new Error(`${location} does not export a function`);
      const gen = new AppGenerator({ cwd: getCwd(), output: console.log });
      await (tmpl as (g: AppGenerator) => unknown)(gen);
      for (const { what, args } of gen.pendingGenerators) {
        await generateCommand()
          .exitOverride()
          .parseAsync(["node", "g", what, ...args]);
      }
    });
}
