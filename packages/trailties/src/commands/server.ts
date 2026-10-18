import { getFs, getPath } from "@blazetrails/ruby-compat";
import { Dir } from "@blazetrails/ruby-compat";
import { Command } from "commander";
import { type RackEnv } from "@blazetrails/rack";
import { requireApplicationBang } from "../command/actions.js";
import { Trails } from "../rails.js";
import { pinEnvironment, serve, serverHost } from "../server/boot.js";

export function serverCommand(): Command {
  const cmd = new Command("server");
  cmd.alias("s");
  cmd
    .description("Start the Trails server")
    .option("-p, --port <port>", "Port to listen on", "3000")
    .option(
      "-b, --binding <IP>",
      "Bind Trails to the specified IP - defaults to 'localhost' in development and '0.0.0.0' in other environments'.",
    )
    .option(
      "-e, --environment <name>",
      "The environment to run `server` in (e.g. test / development / production).",
    )
    .action(async (options) => {
      options.environment = pinEnvironment(options);

      const root = Dir.pwd();
      if (options.environment !== "development" || !(await hasViteConfig(root))) {
        await serve(options);
        return;
      }

      await requireApplicationBang();
      const app = await Trails.initialize();
      const { DevServer } = await import("../server/dev-server.js");
      const server = new DevServer({
        port: parseInt(options.port, 10),
        host: serverHost(options),
        cwd: root,
        app: (env: RackEnv) => app.call(env),
      });
      await server.start();
    });

  return cmd;
}

async function hasViteConfig(root: string): Promise<boolean> {
  const fs = getFs();
  const p = getPath();
  return (
    (await fs.exists(p.join(root, "vite.config.ts"))) ||
    (await fs.exists(p.join(root, "vite.config.js")))
  );
}
