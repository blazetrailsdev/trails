import { getEnv, presence } from "@blazetrails/activesupport";
import { setEnv } from "@blazetrails/ruby-compat";
import type { HttpServer } from "@blazetrails/ruby-compat";
import { Handler, type RackEnv } from "@blazetrails/rack";
import { requireApplicationBang } from "../command/actions.js";
import { Trails } from "../rails.js";

/** @noRailsEquivalent PERMANENT */
export interface ServeOptions {
  port?: number | string;
  binding?: string;
  environment?: string;
  banner?: boolean;
}

/** @noRailsEquivalent PERMANENT */
export function serverEnvironment(options: ServeOptions = {}): string {
  return (
    presence(options.environment) ||
    presence(getEnv("TRAILS_ENV")) ||
    presence(getEnv("NODE_ENV")) ||
    "development"
  );
}

/** @noRailsEquivalent PERMANENT */
export function serverHost(options: ServeOptions = {}): string {
  if (options.binding) return options.binding;
  const fallback = serverEnvironment(options) === "development" ? "localhost" : "0.0.0.0";

  return getEnv("BINDING", fallback);
}

/** @noRailsEquivalent PERMANENT */
export function serverPort(options: ServeOptions = {}): number {
  const given = options.port ?? presence(getEnv("PORT")) ?? 3000;

  return typeof given === "number" ? given : parseInt(given, 10);
}

/** @noRailsEquivalent PERMANENT */
export async function serve(options: ServeOptions = {}): Promise<HttpServer> {
  if (getEnv("TRAILS_ENV") === undefined) setEnv("TRAILS_ENV", serverEnvironment(options));

  await requireApplicationBang();
  const app = await Trails.initialize();
  const host = serverHost(options);
  const port = serverPort(options);
  const server = await Handler.Node.run((env: RackEnv) => app.call(env), {
    Port: port,
    Host: host,
  });

  if (options.banner !== false) {
    const address = server.address();
    const bound = address && typeof address === "object" ? address.port : port;
    console.log(`=> Trails application starting in ${Trails.env} on http://${host}:${bound}`);
    console.log(`=> Ctrl+C to stop`);
    console.log("");
  }

  return server;
}
