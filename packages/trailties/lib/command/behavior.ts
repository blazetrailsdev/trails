import { LoadError, regexpEscape } from "@blazetrails/ruby-compat";
import { Base as ThorBase } from "@blazetrails/thor/shell";
import { Basic } from "@blazetrails/thor/shell/basic";
import type { Base } from "./base.js";

const LOAD_PATH: Readonly<Record<string, () => Promise<unknown>>> = {
  generate: async () => await import("../commands/generate.js"),
  server: async () => await import("../commands/server.js"),
  routes: async () => await import("../commands/routes.js"),
  "unused-routes": async () => await import("../commands/unused-routes.js"),
  console: async () => await import("../commands/console.js"),
  dbconsole: async () => await import("../commands/dbconsole.js"),
  destroy: async () => await import("../commands/destroy.js"),
  runner: async () => await import("../commands/runner.js"),
  notes: async () => await import("../commands/notes.js"),
  stats: async () => await import("../commands/stats.js"),
  credentials: async () => await import("../commands/credentials.js"),
  encrypted: async () => await import("../commands/encrypted.js"),
  dev: async () => await import("../commands/dev.js"),
  test: async () => await import("../commands/test.js"),
  build: async () => await import("../commands/build.js"),
  rake: async () => await import("../commands/rake.js"),
  application: async () => await import("../commands/application.js"),
  plugin: async () => await import("../commands/plugin.js"),
  help: async () => await import("../commands/help.js"),
  version: async () => await import("../commands/version.js"),
  "gem-help": async () => await import("../commands/gem-help.js"),
  "app/update": async () => await import("../commands/app/update-command.js"),
  "db/system/change/change": async () =>
    await import("../commands/db/system/change/change-command.js"),
};

export function noColorBang(): void {
  ThorBase.shell = Basic;
}

let _subclasses: (typeof Base)[] | undefined;

export function subclasses(): (typeof Base)[] {
  return (_subclasses ??= []);
}

/**
 * @internal
 * @inventedArm if — PERMANENT
 */
export async function lookup(namespaces: string[]): Promise<void> {
  const paths = namespacesToPaths(namespaces);

  for (const rawPath of paths) {
    const path = rawPath;

    try {
      if (!Object.hasOwn(LOAD_PATH, path)) throw new LoadError(`cannot load such file -- ${path}`);
      await LOAD_PATH[path]();
      return;
    } catch (e) {
      if (e instanceof LoadError) {
        if (!new RegExp(`${regexpEscape(path)}$`).test(e.message)) throw e;
      } else {
        const error = e as Error;
        console.warn(
          `[WARNING] Could not load command ${JSON.stringify(path)}. Error: ${error.message}.\n${error.stack}`,
        );
      }
    }
  }
}

/**
 * @internal
 * @inventedArm if — PERMANENT
 */
export async function lookupBang(): Promise<void> {
  for (const load of Object.values(LOAD_PATH)) {
    try {
      await load();
    } catch {
      continue;
    }
  }
}

/** @internal */
function namespacesToPaths(namespaces: string[]): string[] {
  const paths: string[] = [];
  for (const namespace of namespaces) {
    const pieces = namespace.split(":");
    const path = pieces.join("/");
    paths.push(`${path}/${pieces.at(-1)}`);
    paths.push(path);
  }
  return [...new Set(paths)];
}
