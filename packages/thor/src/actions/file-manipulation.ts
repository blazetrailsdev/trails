import {
  bytes,
  fetch,
  File,
  FileUtils,
  getFs,
  Hash,
  last,
  rbObjIsKindOf,
  rbObjRespondTo,
  rbStrSend,
  rtest,
  strNew,
  toS,
} from "@blazetrails/ruby-compat";
import type { ActionsHost } from "../actions.js";
import type { insertIntoFile } from "./inject-into-file.js";

type GsubHost = ActionsHost & { gsubFile: typeof gsubFile };
type InsertHost = ActionsHost & { insertIntoFile: typeof insertIntoFile };

export async function chmod(
  this: ActionsHost,
  path: string,
  mode: number,
  config: Record<string, unknown> = {},
): Promise<void> {
  if (this.behavior !== "invoke") return;
  path = File.expandPath(path, this.destinationRoot);
  this.sayStatus(
    "chmod",
    this.relativeToOriginalDestinationRoot(path),
    fetch(config, "verbose", true),
  );
  if (!rtest(this.options["pretend"])) {
    await FileUtils.chmodRAsync(mode, path);
  }
}

export function prependToFile(this: InsertHost, path: string, ...args: unknown[]): unknown {
  const block = typeof last(args) === "function" ? args.pop() : undefined;
  const config = (rbObjIsKindOf(last(args), Hash) ? args.pop() : {}) as Record<string, unknown>;
  config["after"] = /^/;
  args.push(config);
  return this.insertIntoFile(path, ...args, ...(block ? [block] : []));
}
export const prependFile = prependToFile;

export function appendToFile(this: InsertHost, path: string, ...args: unknown[]): unknown {
  const block = typeof last(args) === "function" ? args.pop() : undefined;
  const config = (rbObjIsKindOf(last(args), Hash) ? args.pop() : {}) as Record<string, unknown>;
  config["before"] = /$/;
  args.push(config);
  return this.insertIntoFile(path, ...args, ...(block ? [block] : []));
}
export const appendFile = appendToFile;

export function injectIntoClass(
  this: InsertHost,
  path: string,
  klass: unknown,
  ...args: unknown[]
): unknown {
  const block = typeof last(args) === "function" ? args.pop() : undefined;
  const config = (rbObjIsKindOf(last(args), Hash) ? args.pop() : {}) as Record<string, unknown>;
  config["after"] = new RegExp(`class ${toS(klass)}\\n|class ${toS(klass)} .*\\n`);
  args.push(config);
  return this.insertIntoFile(path, ...args, ...(block ? [block] : []));
}

export function injectIntoModule(
  this: InsertHost,
  path: string,
  moduleName: unknown,
  ...args: unknown[]
): unknown {
  const block = typeof last(args) === "function" ? args.pop() : undefined;
  const config = (rbObjIsKindOf(last(args), Hash) ? args.pop() : {}) as Record<string, unknown>;
  config["after"] = new RegExp(`module ${toS(moduleName)}\\n|module ${toS(moduleName)} .*\\n`);
  args.push(config);
  return this.insertIntoFile(path, ...args, ...(block ? [block] : []));
}

export async function gsubFile(
  this: ActionsHost,
  path: string,
  flag: RegExp | string,
  ...args: unknown[]
): Promise<void> {
  const block = typeof last(args) === "function" ? args.pop() : undefined;
  const config = (rbObjIsKindOf(last(args), Hash) ? args.pop() : {}) as Record<string, unknown>;

  if (!(this.behavior === "invoke" || rtest(fetch(config, "force", false)))) return;

  path = File.expandPath(path, this.destinationRoot);
  this.sayStatus(
    "gsub",
    this.relativeToOriginalDestinationRoot(path),
    fetch(config, "verbose", true),
  );

  if (!rtest(this.options["pretend"])) {
    let content = strNew(Array.from(await getFs().readFile(path)));
    [, content] = rbStrSend(content, "gsubBang", flag, ...args, ...(block ? [block] : []));
    await File.writeAsync(path, Uint8Array.from(bytes(content)));
  }
}

export function uncommentLines(
  this: GsubHost,
  path: string,
  flag: RegExp | string,
  ...args: unknown[]
): Promise<void> {
  flag = rbObjRespondTo(flag, "source") ? (flag as RegExp).source : flag;

  return this.gsubFile(path, new RegExp(`^(\\s*)#[ \\t]?(.*${flag})`, "m"), "\\1\\2", ...args);
}

export function commentLines(
  this: GsubHost,
  path: string,
  flag: RegExp | string,
  ...args: unknown[]
): Promise<void> {
  flag = rbObjRespondTo(flag, "source") ? (flag as RegExp).source : flag;

  return this.gsubFile(path, new RegExp(`^(\\s*)([^#\\n]*${flag})`, "m"), "\\1# \\2", ...args);
}

export async function removeFile(
  this: ActionsHost,
  path: string,
  config: Record<string, unknown> = {},
): Promise<void> {
  if (this.behavior !== "invoke") return;
  path = File.expandPath(path, this.destinationRoot);

  this.sayStatus(
    "remove",
    this.relativeToOriginalDestinationRoot(path),
    fetch(config, "verbose", true),
  );
  if (
    !rtest(this.options["pretend"]) &&
    ((await File.isExistAsync(path)) || (await File.isSymlinkAsync(path)))
  ) {
    await FileUtils.rmRfAsync(path);
  }
}
export const removeDir = removeFile;
