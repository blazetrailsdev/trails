import { getEnv, isBlank } from "@blazetrails/activesupport";
import { DSL, main } from "@blazetrails/rake";
import { File, RuntimeError, block } from "@blazetrails/ruby-compat";
import { Trails } from "../rails.js";

DSL.namespace("app", () => {
  DSL.desc("Apply the template supplied by LOCATION=(/path/to/template) or URL");
  DSL.task(
    { template: "environment" },
    block(async () => {
      const template = getEnv("LOCATION");
      if (isBlank(template)) {
        throw new RuntimeError(
          "No LOCATION value given. Please set LOCATION either as path to a file or a URL",
        );
      }
      const { AppGenerator } = await import("../generators/rails/app/app-generator.js");
      const { GenerateCommand } = await import("../commands/generate.js");
      const gen = await AppGenerator.applyRailsTemplate(template!, Trails.root()!.toString());
      for (const { what, args } of gen.pendingGenerators) {
        await GenerateCommand.perform("generate", [what, ...args], {});
      }
    }),
  );

  DSL.namespace("templates", () => {
    DSL.task(
      "copy",
      block(async () => {
        const generatorsLib = File.expandPath("../generators", import.meta.dirname);
        const projectTemplates = `${Trails.root()}/lib/templates`;

        const defaultTemplates = {
          tse: ["controller"],
          rails: ["controller", "helper", "scaffold-controller"],
        };

        for (const [type, names] of Object.entries(defaultTemplates)) {
          const localTemplateTypeDir = File.join(projectTemplates, type);
          await main.mkdirP(localTemplateTypeDir, { verbose: false });

          for (const name of names) {
            const dstName = File.join(localTemplateTypeDir, name);
            const srcName = File.join(generatorsLib, type, name, "templates");
            await main.cpR(srcName, dstName, { verbose: false });
          }
        }
      }),
    );
  });
});
