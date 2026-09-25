import { getEnv, presence } from "@blazetrails/activesupport";
import { getFs, getPath, setEnv } from "@blazetrails/ruby-compat";
import { Dir } from "@blazetrails/ruby-compat";
import { Command } from "commander";
import { Handler } from "@blazetrails/rack";
import { requireApplicationBang } from "../command/actions.js";
import { Trails } from "../rails.js";
import { DevServer } from "../server/dev-server.js";

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
      "Specifies the environment to run this server under (test/development/production).",
    )
    .action(async (options) => {
      const environment: string =
        options.environment ||
        presence(getEnv("TRAILS_ENV")) ||
        presence(getEnv("NODE_ENV")) ||
        "development";
      if (!presence(getEnv("TRAILS_ENV"))) setEnv("TRAILS_ENV", environment);

      const root = Dir.pwd();
      await requireApplicationBang();
      const app = await Trails.initialize();
      const port = parseInt(options.port, 10);
      const host: string =
        options.binding ??
        getEnv("BINDING", environment === "development" ? "localhost" : "0.0.0.0");
      if (environment !== "development" || !(await hasViteConfig(root))) {
        const server = await Handler.Node.run(app.app(), { Port: port, Host: host });
        const address = server.address();
        const boundPort = address && typeof address === "object" ? address.port : port;
        console.log(
          `=> Trails application starting in ${Trails.env} on http://${host}:${boundPort}`,
        );
        console.log(`=> Ctrl+C to stop`);
        console.log("");
        return;
      }
      const server = new DevServer({
        port,
        host,
        cwd: root,
        app: app.app(),
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
