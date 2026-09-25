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
      "The environment to run `server` in (e.g. test / development / production).",
    )
    .action(async (options) => {
      options.environment = environment(options);
      setEnvironment(options);

      const root = Dir.pwd();
      await requireApplicationBang();
      const app = await Trails.initialize();
      const port = parseInt(options.port, 10);
      if (options.environment !== "development" || !(await hasViteConfig(root))) {
        const server = await Handler.Node.run(app.app(), { Port: port, Host: host(options) });
        const address = server.address();
        const boundPort = address && typeof address === "object" ? address.port : port;
        console.log(
          `=> Trails application starting in ${Trails.env} on http://${host(options)}:${boundPort}`,
        );
        console.log(`=> Ctrl+C to stop`);
        console.log("");
        return;
      }
      const server = new DevServer({
        port,
        host: host(options),
        cwd: root,
        app: app.app(),
      });
      await server.start();
    });

  return cmd;
}

interface ServerOptions {
  binding?: string;
  environment?: string;
}

function setEnvironment(options: ServerOptions): void {
  if (!presence(getEnv("TRAILS_ENV"))) setEnv("TRAILS_ENV", options.environment);
}

/** @internal */
function host(options: ServerOptions): string {
  if (options.binding) {
    return options.binding;
  } else {
    const defaultHost = environment(options) === "development" ? "localhost" : "0.0.0.0";

    return getEnv("BINDING", defaultHost);
  }
}

/** @internal */
function environment(options: ServerOptions): string {
  return options.environment || commandEnvironment();
}

function commandEnvironment(): string {
  return presence(getEnv("TRAILS_ENV")) || presence(getEnv("NODE_ENV")) || "development";
}

async function hasViteConfig(root: string): Promise<boolean> {
  const fs = getFs();
  const p = getPath();
  return (
    (await fs.exists(p.join(root, "vite.config.ts"))) ||
    (await fs.exists(p.join(root, "vite.config.js")))
  );
}
