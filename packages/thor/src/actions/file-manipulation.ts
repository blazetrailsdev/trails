import {
  ArgumentError,
  bytes,
  File,
  FileUtils,
  getFs,
  Hash,
  hashDelete,
  last,
  OpenURI,
  rbFBinding,
  rbObjIsKindOf,
  rbObjRespondTo,
  rbStrSend,
  rtest,
  strNew,
  StringIO,
  toS,
  TSE,
  type TSECompiler,
} from "@blazetrails/ruby-compat";
import type { ActionsHost } from "../actions.js";
import { TEMPLATE_EXTNAME } from "../base.js";
import type { createFile } from "./create-file.js";
import type { createLink } from "./create-link.js";
import type { insertIntoFile } from "./inject-into-file.js";

type ContentBlock = (content: string | Uint8Array) => unknown;
type FileHost = ActionsHost & {
  createFile: typeof createFile;
  createLink: typeof createLink;
  chmod: typeof chmod;
};
type BufferHost = { outputBuffer: StringIO | null; _outputBuffer?: StringIO | null };

export async function copyFile(this: FileHost, source: string, ...args: unknown[]): Promise<void> {
  const block = (typeof last(args) === "function" ? args.pop() : undefined) as
    | ContentBlock
    | undefined;
  const config = (rbObjIsKindOf(last(args), Hash) ? args.pop() : {}) as Record<string, unknown>;
  const destination = (args[0] as string | undefined) || source;
  source = File.expandPath(await this.findInSourcePaths(toS(source)));

  const resultingDestination = (await this.createFile(destination, null, config, async () => {
    let content: unknown = await getFs().readFile(source);
    if (block) content = await block(content as Uint8Array);
    return content;
  })) as string;
  if (config["mode"] === "preserve") {
    const mode = (await getFs().stat!(source)).mode;
    await this.chmod(resultingDestination, mode, config);
  }
}

export async function linkFile(
  this: FileHost,
  source: string,
  ...args: unknown[]
): Promise<unknown> {
  const config = (rbObjIsKindOf(last(args), Hash) ? args.pop() : {}) as Record<string, unknown>;
  const destination = (args[0] as string | undefined) || source;
  source = File.expandPath(await this.findInSourcePaths(toS(source)));

  return this.createLink(destination, source, config);
}

/**
 * @inventedArm if — PERMANENT
 * @inventedArm throw — PERMANENT
 */
export async function get(this: FileHost, source: string, ...args: unknown[]): Promise<unknown> {
  const block = (typeof last(args) === "function" ? args.pop() : undefined) as
    | ((render?: Uint8Array) => unknown)
    | undefined;
  const config = (rbObjIsKindOf(last(args), Hash) ? args.pop() : {}) as Record<string, unknown>;
  let destination = args[0] as string | undefined;

  let render: Uint8Array;
  if (/^https?:\/\//.test(source)) {
    const input = await globalThis.fetch(source, {
      headers: fetch(config, "httpHeaders", {}) as Record<string, string>,
    });
    if (!input.ok) throw new OpenURI.HTTPError(`${input.status} ${input.statusText}`, input);
    render = await input.bytes();
  } else {
    source = File.expandPath(await this.findInSourcePaths(toS(source)));
    render = await getFs().readFile(source);
  }

  destination ||= (
    block ? (block.length === 1 ? await block(render) : await block()) : File.basename(source)
  ) as string;

  return this.createFile(destination, render, config);
}

/** @missingRailsArgs new — PERMANENT */
export async function template(
  this: FileHost,
  source: string,
  ...args: unknown[]
): Promise<unknown> {
  const block = (typeof last(args) === "function" ? args.pop() : undefined) as
    | ContentBlock
    | undefined;
  const config = (rbObjIsKindOf(last(args), Hash) ? args.pop() : {}) as Record<string, unknown>;
  const destination =
    (args[0] as string | undefined) || source.replace(RegExp(`${TEMPLATE_EXTNAME}$`), "");

  source = File.expandPath(await this.findInSourcePaths(toS(source)));
  const context = (hashDelete(config, "context") || rbFBinding(this)) as object;

  return this.createFile(destination, null, config, async () => {
    const capturableErb = new CapturableERB(strNew(Array.from(await getFs().readFile(source))), {
      trimMode: "-",
      eoutvar: "@output_buffer",
    });
    capturableErb.filename = source;
    let content: unknown = await capturableErb.result(context);
    if (block) content = await block(content as string);
    return content;
  });
}

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
    Object.hasOwn(config, "verbose") ? config.verbose : true,
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

  if (!(this.behavior === "invoke" || rtest(Object.hasOwn(config, "force") ? config.force : false)))
    return;

  path = File.expandPath(path, this.destinationRoot);
  this.sayStatus(
    "gsub",
    this.relativeToOriginalDestinationRoot(path),
    Object.hasOwn(config, "verbose") ? config.verbose : true,
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
    Object.hasOwn(config, "verbose") ? config.verbose : true,
  );
  if (
    !rtest(this.options["pretend"]) &&
    ((await File.isExistAsync(path)) || (await File.isSymlinkAsync(path)))
  ) {
    await FileUtils.rmRfAsync(path);
  }
}
export const removeDir = removeFile;

export function outputBuffer(this: BufferHost): StringIO | null {
  return this._outputBuffer ?? null;
}

export function setOutputBuffer(this: BufferHost, outputBuffer: StringIO | null): void {
  this._outputBuffer = outputBuffer;
}

export function concat(this: BufferHost, string: string): void {
  this.outputBuffer!.append(string);
}

export function capture(this: BufferHost, ...args: unknown[]): string {
  const block = args.pop() as (...args: unknown[]) => unknown;
  return withOutputBuffer.call(this, undefined, () => block(...args));
}

export function withOutputBuffer(
  this: BufferHost,
  buf: StringIO = new StringIO(),
  block: () => unknown,
): string {
  let oldBuffer: StringIO | null = null;
  try {
    if (Object.isFrozen(buf)) throw new ArgumentError("Buffer can not be a frozen object");
    oldBuffer = this.outputBuffer;
    this.outputBuffer = buf;
    block();
    return this.outputBuffer.string();
  } finally {
    this.outputBuffer = oldBuffer;
  }
}

export class CapturableERB extends TSE {
  override setEoutvar(compiler: TSECompiler, eoutvar: string = "_erbout"): void {
    compiler.putCmd = `${eoutvar}.concat`;
    compiler.insertCmd = `${eoutvar}.concat`;
    compiler.preCmd = [`${eoutvar} = ''.dup`];
    compiler.postCmd = [eoutvar];
  }
}
