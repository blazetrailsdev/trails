import { getEnv, presence } from "@blazetrails/activesupport";
import { getFs, getPath, setEnv } from "@blazetrails/ruby-compat";
import { Dir } from "@blazetrails/ruby-compat";
import { Command } from "commander";
import { Handler, type RackEnv } from "@blazetrails/rack";
import { DetailsKey } from "@blazetrails/actionview";
import { requireApplicationBang } from "../command/actions.js";
import { Trails } from "../rails.js";
import type {} from "../trailties/action-view.js";

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
      await watchViews(app, root);
      const port = parseInt(options.port, 10);
      const railsApp = (env: RackEnv) => app.call(env);
      if (options.environment !== "development" || !(await hasViteConfig(root))) {
        const server = await Handler.Node.run(railsApp, { Port: port, Host: host(options) });
        const address = server.address();
        const boundPort = address && typeof address === "object" ? address.port : port;
        console.log(
          `=> Trails application starting in ${Trails.env} on http://${host(options)}:${boundPort}`,
        );
        console.log(`=> Ctrl+C to stop`);
        console.log("");
        return;
      }
      const { DevServer } = await import("../server/dev-server.js");
      const server = new DevServer({
        port,
        host: host(options),
        cwd: root,
        app: railsApp,
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
  if (getEnv("TRAILS_ENV") === undefined) setEnv("TRAILS_ENV", options.environment);
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

/** @noRailsEquivalent PERMANENT */
async function watchViews(
  app: Awaited<ReturnType<typeof Trails.initialize>>,
  root: string,
): Promise<void> {
  const { config } = app;
  if (config?.actionView == null) return;
  const cacheTemplateLoading = config.actionView.cacheTemplateLoading;
  const enableCaching =
    cacheTemplateLoading == null ? !config.isReloadingEnabled() : cacheTemplateLoading;
  if (enableCaching) return;

  const { watchViews } = await import("@blazetrails/trails-tsc");
  await watchViews({
    cwd: root,
    onRebuild: () => DetailsKey.clear(),
    onError: (err, trigger) =>
      console.error(`trails-tsc-views: ${trigger ?? "build"}: ${err.message}`),
  });
}

async function hasViteConfig(root: string): Promise<boolean> {
  const fs = getFs();
  const p = getPath();
  return (
    (await fs.exists(p.join(root, "vite.config.ts"))) ||
    (await fs.exists(p.join(root, "vite.config.js")))
  );
}
