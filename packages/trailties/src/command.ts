import { presence } from "@blazetrails/activesupport";
import { Correctable, SpellChecker } from "@blazetrails/did-you-mean";
import { File, Pathname, StandardError, env, prepend, rbArgv } from "@blazetrails/ruby-compat";
import { APP_PATH, ENGINE_ROOT } from "./app-path.js";
import type { Command as Program } from "commander";
import type { ThorClass } from "@blazetrails/thor";
import type { Base } from "./command/base.js";
import { createProgram } from "./cli.js";
import { lookup, lookupBang, subclasses } from "./command/behavior.js";

export const HELP_MAPPINGS: ReadonlySet<string> = new Set(["-h", "-?", "--help"]);
export const VERSION_MAPPINGS: ReadonlySet<string> = new Set(["-v", "--version"]);

export class CorrectableNameError extends StandardError {
  readonly name: string;
  /** @internal */
  _alternatives: string[];
  /** @internal */
  _corrections?: string[];

  constructor(message: string, name: string, alternatives: string[]) {
    super(message);
    this.name = name;
    this._alternatives = alternatives;
  }

  get corrections(): string[] {
    return (this._corrections ??= new SpellChecker({ dictionary: this._alternatives }).correct(
      this.name,
    ));
  }
}

prepend(CorrectableNameError, Correctable);

let _hiddenCommands: (typeof Base)[] | undefined;

export function hiddenCommands(): (typeof Base)[] {
  return (_hiddenCommands ??= []);
}

export function environment(): string {
  return presence(env.TRAILS_ENV) ?? presence(env.NODE_ENV) ?? "development";
}

export function root(): Pathname | undefined {
  if (ENGINE_ROOT != null) {
    return new Pathname(ENGINE_ROOT);
  } else {
    return applicationRoot();
  }
}

/**
 * @inventedArm endsWith — CONVERGEABLE app-path-expands-to-the-application-root
 * @inventedArm dirname — CONVERGEABLE app-path-expands-to-the-application-root
 */
export function applicationRoot(): Pathname | undefined {
  if (APP_PATH != null) {
    const path = File.expandPath("../..", APP_PATH);
    return new Pathname(
      APP_PATH.endsWith("/dist/config/application.js") ? File.dirname(path) : path,
    );
  }
  return undefined;
}

/**
 * @missingRailsArgs invoke_rake — PERMANENT
 * @inventedArm replaceAll — PERMANENT
 */
export async function invoke(
  fullNamespace: string,
  args: string[] = [],
  config: Record<string, unknown> = {},
): Promise<void> {
  const [namespace, commandName] = splitNamespace(fullNamespace);
  const command = await findByNamespace(namespace, commandName);
  const name = commandName.replaceAll("_", "-");

  await withArgv(args, async () => {
    if (command && "perform" in command) {
      if (Object.hasOwn((command as unknown as ThorClass).allCommands(), name)) {
        await command.perform(name, args, config);
      } else {
        await invokeRake(fullNamespace, args);
      }
    } else if (command && command.name() === name) {
      await command.parent!.parseAsync([name, ...args], { from: "user" });
    } else if (command && command.commands.some((c) => c.name() === name)) {
      await command.parent!.parseAsync([command.name(), name, ...args], { from: "user" });
    } else {
      await invokeRake(fullNamespace, args);
    }
  });
}

/** @inventedArm replaceAll — PERMANENT */
export async function findByNamespace(
  namespace: string,
  commandName?: string,
): Promise<Program | typeof Base | undefined> {
  namespace = namespace.replaceAll("_", "-");
  const lookups = [namespace];
  if (commandName) lookups.push(`${namespace}:${commandName.replaceAll("_", "-")}`);
  lookups.push(...lookups.map((lookup) => `rails:${lookup}`));

  await lookup(lookups);

  const klasses = new Map(subclasses().map((klass) => [klass.namespace(), klass]));
  const first = lookups.find((lookup) => klasses.has(lookup));
  if (first !== undefined) return klasses.get(first);

  const namespaces = new Map(createProgram().commands.map((c) => [c.name(), c]));
  const found = lookups.find((lookup) => namespaces.has(lookup));
  return found === undefined ? undefined : namespaces.get(found);
}

export async function printingCommands(): Promise<[string, string | null][]> {
  await lookupBang();
  return subclasses()
    .filter((klass) => !hiddenCommands().includes(klass))
    .flatMap((klass) => klass.printingCommands());
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
async function withArgv(argv: string[], block: () => Promise<void>): Promise<void> {
  const originalArgv = [...rbArgv()];
  rbArgv().splice(0, rbArgv().length, ...argv);
  try {
    await block();
  } finally {
    rbArgv().splice(0, rbArgv().length, ...originalArgv);
  }
}

/** @internal */
async function invokeRake(task: string, args: string[]): Promise<void> {
  await lookupBang();
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
