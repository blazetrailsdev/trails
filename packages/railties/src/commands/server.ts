import { Command } from "commander";
import { DevServer } from "../server/dev-server.js";

export function serverCommand(): Command {
  const cmd = new Command("server");
  cmd.alias("s");
  cmd
    .description("Start the development server")
    .option("-p, --port <port>", "Port to listen on", "3000")
    .option("-b, --binding <host>", "Host to bind to", "127.0.0.1")
    .action(async (options) => {
      const server = new DevServer({
        port: parseInt(options.port, 10),
        host: options.binding,
        cwd: process.cwd(),
      });
      await server.start();
    });

  return cmd;
}
