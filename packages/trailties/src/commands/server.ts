import { getFs, getPath } from "@blazetrails/ruby-compat";
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
    .description("Start the development server")
    .option("-p, --port <port>", "Port to listen on", "3000")
    .option("-b, --binding <host>", "Host to bind to", "127.0.0.1")
    .action(async (options) => {
      const root = Dir.pwd();
      await requireApplicationBang();
      const app = await Trails.initialize();
      const port = parseInt(options.port, 10);
      if (!(await hasViteConfig(root))) {
        const server = await Handler.Node.run(app.app(), { Port: port, Host: options.binding });
        const address = server.address();
        const boundPort = address && typeof address === "object" ? address.port : port;
        console.log(
          `=> Trails application starting in development on http://${options.binding}:${boundPort}`,
        );
        console.log(`=> Ctrl+C to stop`);
        console.log("");
        return;
      }
      const server = new DevServer({
        port,
        host: options.binding,
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
