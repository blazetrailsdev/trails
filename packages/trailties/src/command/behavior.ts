import { dasherize } from "@blazetrails/activesupport";
import type { Command as Program } from "commander";

type CommandFactory = () => Program;

const LOAD_PATH: Readonly<Record<string, () => Promise<CommandFactory>>> = {
  new: async () => (await import("../commands/new.js")).newCommand,
  generate: async () => (await import("../commands/generate.js")).generateCommand,
  server: async () => (await import("../commands/server.js")).serverCommand,
  db: async () => (await import("../commands/db.js")).dbCommand,
  routes: async () => (await import("../commands/routes.js")).routesCommand,
  "unused-routes": async () => (await import("../commands/unused-routes.js")).unusedRoutesCommand,
  console: async () => (await import("../commands/console.js")).consoleCommand,
  dbconsole: async () => (await import("../commands/dbconsole.js")).dbconsoleCommand,
  destroy: async () => (await import("../commands/destroy.js")).destroyCommand,
  app: async () => (await import("../commands/app.js")).appTemplateCommand,
  notes: async () => (await import("../commands/notes.js")).notesCommand,
  stats: async () => (await import("../commands/stats.js")).statsCommand,
  credentials: async () => (await import("../commands/credentials.js")).credentialsCommand,
  encrypted: async () => (await import("../commands/encrypted.js")).encryptedCommand,
  dev: async () => (await import("../commands/dev.js")).devCommand,
};

let _subclasses: CommandFactory[] | undefined;

export function subclasses(): CommandFactory[] {
  return (_subclasses ??= []);
}

/** @internal */
export async function lookup(namespaces: string[]): Promise<void> {
  const paths = namespacesToPaths(namespaces);

  for (const rawPath of paths) {
    const load = LOAD_PATH[dasherize(rawPath)];
    if (load === undefined) continue;
    const factory = await load();
    if (!subclasses().includes(factory)) subclasses().push(factory);
    return;
  }
}

/** @internal */
export async function lookupBang(): Promise<void> {
  for (const load of Object.values(LOAD_PATH)) {
    const factory = await load();
    if (!subclasses().includes(factory)) subclasses().push(factory);
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
