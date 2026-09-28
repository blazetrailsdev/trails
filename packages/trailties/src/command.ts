import type { Command as Program } from "commander";
import { createProgram } from "./cli.js";

export const HELP_MAPPINGS: ReadonlySet<string> = new Set(["-h", "-?", "--help"]);
export const VERSION_MAPPINGS: ReadonlySet<string> = new Set(["-v", "--version"]);

/** @missingRailsArgs invoke_rake — PERMANENT */
export async function invoke(fullNamespace: string, args: string[] = []): Promise<void> {
  const [namespace, commandName] = splitNamespace(fullNamespace);
  const command = findByNamespace(namespace, commandName);

  if (command && command.name() === commandName) {
    await command.parent!.parseAsync([commandName, ...args], { from: "user" });
  } else if (command && command.commands.some((c) => c.name() === commandName)) {
    await command.parent!.parseAsync([command.name(), commandName, ...args], { from: "user" });
  } else {
    await invokeRake(fullNamespace, args);
  }
}

/** @missingRailsCall lookup — PERMANENT */
export function findByNamespace(namespace: string, commandName?: string): Program | undefined {
  const lookups = [namespace];
  if (commandName) lookups.push(`${namespace}:${commandName}`);
  lookups.push(...lookups.map((lookup) => `rails:${lookup}`));

  const namespaces = new Map(createProgram().commands.map((c) => [c.name(), c]));
  const found = lookups.find((lookup) => namespaces.has(lookup));
  return found === undefined ? undefined : namespaces.get(found);
}

/** @internal */
function splitNamespace(namespace: string): [string, string] {
  const m = /^(.+):(\w+)$/.exec(namespace);
  if (m) return [m[1], m[2]];
  if (namespace === "") return ["help", "help"];
  if (HELP_MAPPINGS.has(namespace) || namespace === "help") return ["help", "help_extended"];
  if (VERSION_MAPPINGS.has(namespace)) return ["version", "version"];
  return [namespace, namespace];
}

/** @internal */
async function invokeRake(task: string, args: string[]): Promise<void> {
  const program = createProgram();
  const colon = task.indexOf(":");
  if (colon > 0) {
    const command = program.commands.find((c) => c.name() === task.slice(0, colon));
    const subcommand = task.slice(colon + 1);
    if (command?.commands.some((c) => c.name() === subcommand)) {
      await program.parseAsync([command.name(), subcommand, ...args], { from: "user" });
      return;
    }
  }
  await program.parseAsync(task === "" ? args : [task, ...args], { from: "user" });
}
