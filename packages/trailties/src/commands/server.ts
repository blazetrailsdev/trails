import { getFsAsync, getPathAsync } from "@blazetrails/activesupport";
import { cwd } from "@blazetrails/activesupport/process-adapter";
import { Command } from "commander";
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
      const root = cwd();
      // Rails: `require APP_PATH` (`commands/server/server_command.rb:340`)
      // — loading `config/application` is what registers the Application
      // subclass, so `Trails.application` is nil until it has been imported.
      await requireApplication(root);
      const app = await Trails.initialize();
      const server = new DevServer({
        port: parseInt(options.port, 10),
        host: options.binding,
        cwd: root,
        // Rails: `config.ru`'s `run Rails.application`.
        app: app.app(),
      });
      await server.start();
    });

  return cmd;
}

/**
 * Rails' `APP_PATH` require. Trails apps ship TypeScript sources and a
 * compiled `dist/`, so both spellings of `config/application` are probed —
 * the built one first, mirroring how `bin/rails` prefers the loaded app.
 */
async function requireApplication(root: string): Promise<void> {
  const fs = await getFsAsync();
  const p = await getPathAsync();
  if (!p.pathToFileURL) {
    throw new Error("PathAdapter.pathToFileURL() is required to boot an application.");
  }
  for (const candidate of [
    p.join(root, "dist", "config", "application.js"),
    p.join(root, "config", "application.ts"),
  ]) {
    if (await fs.exists(candidate)) {
      await import(p.pathToFileURL(candidate).href);
      return;
    }
  }
  throw new Error(`No config/application.ts found in ${root}.`);
}
