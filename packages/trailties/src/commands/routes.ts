import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";

export function routesCommand(): Command {
  const cmd = new Command("routes");
  cmd
    .description("Print the application route table")
    .option("-g, --grep <pattern>", "Filter routes by pattern")
    .action(async (options) => {
      const cwd = process.cwd();
      const routesFile = path.join(cwd, "src", "config", "routes.ts");

      if (!fs.existsSync(routesFile)) {
        console.log("No routes file found at src/config/routes.ts");
        return;
      }

      try {
        const mod = await import(routesFile);
        if (mod.routes && typeof mod.routes.inspect === "function") {
          let output = mod.routes.inspect();
          if (options.grep) {
            const pattern = new RegExp(options.grep, "i");
            output = output
              .split("\n")
              .filter((line: string) => pattern.test(line))
              .join("\n");
          }
          console.log(output);
        } else {
          console.log("Routes file does not export a routes object with inspect().");
        }
      } catch {
        console.log("Could not load routes file.");
      }
    });

  return cmd;
}
