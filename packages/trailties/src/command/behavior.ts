import { LoadError, regexpEscape } from "@blazetrails/ruby-compat";
import { Base as ThorBase } from "@blazetrails/thor/shell";
import { Basic } from "@blazetrails/thor/shell/basic";
import type { Command as Program } from "commander";
import type { Base } from "./base.js";

type CommandFactory = () => Program;

const LOAD_PATH: Readonly<Record<string, () => Promise<CommandFactory | null>>> = {
  new: async () => (await import("../commands/new.js")).newCommand,
  generate: async () => (await import("../commands/generate.js"), null),
  server: async () => (await import("../commands/server.js"), null),
  db: async () => (await import("../commands/db.js")).dbCommand,
  routes: async () => (await import("../commands/routes.js"), null),
  "unused-routes": async () => (await import("../commands/unused-routes.js"), null),
  console: async () => (await import("../commands/console.js"), null),
  dbconsole: async () => (await import("../commands/dbconsole.js")).dbconsoleCommand,
  destroy: async () => (await import("../commands/destroy.js"), null),
  app: async () => (await import("../commands/app.js")).appTemplateCommand,
  notes: async () => (await import("../commands/notes.js"), null),
  stats: async () => (await import("../commands/stats.js"), null),
  credentials: async () => (await import("../commands/credentials.js"), null),
  encrypted: async () => (await import("../commands/encrypted.js"), null),
  dev: async () => (await import("../commands/dev.js"), null),
  test: async () => (await import("../commands/test.js"), null),
  build: async () => (await import("../commands/build.js"), null),
};

export function noColorBang(): void {
  ThorBase.shell = Basic;
}

let _subclasses: (typeof Base)[] | undefined;

export function subclasses(): (typeof Base)[] {
  return (_subclasses ??= []);
}

const _commanderFactories: CommandFactory[] = [];

/** @noRailsEquivalent CONVERGEABLE retire-commander-cli-onto-rails-command-invoke */
export function commanderFactories(): CommandFactory[] {
  return _commanderFactories;
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
      const factory = await LOAD_PATH[path]();
      if (factory && !commanderFactories().includes(factory)) commanderFactories().push(factory);
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
      const factory = await load();
      if (factory && !commanderFactories().includes(factory)) commanderFactories().push(factory);
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
