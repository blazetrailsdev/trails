import { cwd as getCwd } from "@blazetrails/activesupport/process-adapter";
import { Mapper, RouteSet, RoutesInspector } from "@blazetrails/actionpack";
import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

export function routesCommand(): Command {
  const cmd = new Command("routes");
  cmd
    .description("Print the application route table")
    .option("-g, --grep <pattern>", "Filter routes by pattern")
    .option("-c, --controller <name>", "Filter routes by controller")
    .action(async (options: { grep?: string; controller?: string }) => {
      const cwd = getCwd();
      // Same candidates, in the same order, as the dev server's route loader
      // (`server/application.ts#loadRoutes`) so the two never disagree about
      // which file defines the app's routes.
      const candidates = [
        path.join(cwd, "dist", "config", "routes.js"),
        path.join(cwd, "src", "config", "routes.ts"),
      ];
      const routesFile = candidates.find((c) => fs.existsSync(c));

      if (!routesFile) {
        console.log("No routes file found at src/config/routes.ts");
        return;
      }

      const mod = await import(pathToFileURL(routesFile).href);
      if (typeof mod.drawRoutes !== "function") {
        console.log(`${path.relative(cwd, routesFile)} does not export drawRoutes().`);
        return;
      }

      const routeSet = new RouteSet();
      routeSet.draw((mapper: Mapper) => mod.drawRoutes(mapper));

      const inspector = new RoutesInspector(routeSet.getRoutes());
      console.log(
        inspector.format(undefined, { grep: options.grep, controller: options.controller }),
      );
    });

  return cmd;
}
