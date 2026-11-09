import "./constants.command.generated.js";
import { Trails } from "./trails.js";
import { presence } from "@blazetrails/activesupport";
import { Correctable, SpellChecker } from "@blazetrails/did-you-mean";
import {
  File,
  Pathname,
  StandardError,
  env,
  exit,
  prepend,
  rbArgv,
  rbAryReplace,
  rbInspect,
  rbObjDup,
  stdout,
} from "@blazetrails/ruby-compat";
import { APP_PATH, ENGINE_ROOT } from "./app-path.js";
import type { ThorClass } from "@blazetrails/thor";
import type { Base } from "./command/base.js";
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

export class UnrecognizedCommandError extends CorrectableNameError {
  constructor(name: string, commands: string[]) {
    super(`Unrecognized command ${rbInspect(name)}`, name, commands);
  }
}

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

export function applicationRoot(): Pathname | undefined {
  if (APP_PATH != null) return new Pathname(File.expandPath("../..", APP_PATH));
  return undefined;
}

/** @inventedArm replaceAll — PERMANENT */
export async function invoke(
  fullNamespace: string,
  args: string[] = [],
  config: Record<string, unknown> = {},
): Promise<void> {
  if (isTrailsNewWithNoPath(args)) args = ["--help"];

  const [namespace, commandName] = splitNamespace(fullNamespace);
  const command = await findByNamespace(namespace, commandName);
  const name = commandName.replaceAll("_", "-");

  try {
    await withArgv(args, async () => {
      if (command && Object.hasOwn((command as unknown as ThorClass).allCommands(), name)) {
        await command.perform(name, args, config);
      } else {
        await invokeRake(fullNamespace, args, config);
      }
    });
  } catch (error) {
    if (!(error instanceof UnrecognizedCommandError)) throw error;
    if (error.name === fullNamespace && command && commandName === fullNamespace) {
      await command.perform("help", [], config);
    } else {
      stdout.write(`${error.detailedMessage()}\n`);
    }
    exit(1);
  }
}

/** @inventedArm replaceAll — PERMANENT */
export async function findByNamespace(
  namespace: string,
  commandName?: string,
): Promise<typeof Base | undefined> {
  namespace = namespace.replaceAll("_", "-");
  const lookups = [namespace];
  if (commandName) lookups.push(`${namespace}:${commandName.replaceAll("_", "-")}`);
  lookups.push(...lookups.map((lookup) => `trails:${lookup}`));

  await lookup(lookups);

  const namespaces = new Map(subclasses().map((klass) => [klass.namespace(), klass]));
  const first = lookups.find((lookup) => namespaces.has(lookup));
  return first === undefined ? undefined : namespaces.get(first);
}

export async function printingCommands(): Promise<[string, string | null][]> {
  await lookupBang();
  const commands = await Promise.all(
    subclasses()
      .filter((klass) => !hiddenCommands().includes(klass))
      .map((klass) => klass.printingCommands()),
  );
  return commands.flat();
}

/** @internal */
function isTrailsNewWithNoPath(args: string[]): boolean {
  return args.length === 1 && args[0] === "new";
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
  const originalArgv = rbObjDup(rbArgv());
  rbAryReplace(rbArgv(), argv);
  try {
    await block();
  } finally {
    rbAryReplace(rbArgv(), originalArgv);
  }
}

/** @internal */
async function invokeRake(
  task: string,
  args: string[],
  config: Record<string, unknown>,
): Promise<void> {
  if (HELP_MAPPINGS.has(args[0])) args = ["--describe", task];
  await (await findByNamespace("rake"))!.perform(task, args, config);
}

Trails.Command = { invoke };

const EXTENSION = /\.[cm]?[tj]s$/.exec(import.meta.url)![0];

let _commandType: string | undefined;
let _lookupPaths: string[] | undefined;
let _fileLookupPaths: string[] | undefined;

export function commandType(): string {
  return (_commandType ??= "command");
}

export function lookupPaths(): string[] {
  return (_lookupPaths ??= ["trails/commands", "commands"]);
}

export function fileLookupPaths(): string[] {
  return (_fileLookupPaths ??= [`{${lookupPaths().join(",")}}`, "**", `*${EXTENSION}`]);
}
