import {
  bytes,
  File,
  getFs,
  hashDelete,
  hasKey,
  last,
  merge,
  rbEqual,
  rbFSend,
  rbStrSend,
  regexpEscape,
  rtest,
  strNew,
  toS,
} from "@blazetrails/ruby-compat";
import type { ActionsHost } from "../actions.js";
import { Error } from "../error.js";
import { EmptyDirectory, type EmptyDirectoryBase } from "./empty-directory.js";

type Data = unknown | (() => unknown);

export const WARNINGS = {
  unchangedNoFlag:
    "File unchanged! Either the supplied flag value not found or the content has already been inserted!",
};

export function insertIntoFile(
  this: ActionsHost,
  destination: string,
  ...args: unknown[]
): unknown {
  const block = typeof last(args) === "function" ? args.pop() : undefined;
  const data = block ? block : args.shift();

  const config = (args.shift() || {}) as Record<string, unknown>;
  if (!(hasKey(config, "before") || hasKey(config, "after"))) config["after"] = /$/;

  return this.action(new InjectIntoFile(this, destination, data, config));
}
export const injectIntoFile = insertIntoFile;

export class InjectIntoFile extends EmptyDirectory {
  replacement: string | Promise<string>;
  flag: RegExp | string;
  behavior: string;
  /** @internal */
  private _content?: string;

  constructor(
    base: EmptyDirectoryBase,
    destination: string | null | undefined,
    data: Data,
    config: Record<string, unknown>,
  ) {
    super(base, destination, merge({ verbose: true }, config));

    [this.behavior, this.flag] = (
      hasKey(this.config, "after")
        ? ["after", hashDelete(this.config, "after")]
        : ["before", hashDelete(this.config, "before")]
    ) as [string, RegExp | string];

    this.replacement = (typeof data === "function" ? data() : data) as string | Promise<string>;
    if (!(this.flag instanceof RegExp)) this.flag = regexpEscape(this.flag);
  }

  override async invokeBang(): Promise<void> {
    const content = (
      this.behavior === "after"
        ? rbFSend("\\0", "plus", await this.replacement)
        : rbFSend(await this.replacement, "plus", "\\0")
    ) as string;

    if (await this.isExists()) {
      if (
        rtest(await this.replaceBang(new RegExp(toS(this.flag)), content, this.config["force"]))
      ) {
        this.sayStatus("invoke");
      } else if (await this.isReplacementPresent()) {
        this.sayStatus("unchanged", { color: ":blue" });
      } else {
        this.sayStatus("unchanged", { warning: WARNINGS.unchangedNoFlag, color: ":red" });
      }
    } else {
      if (!rtest(this.isPretend())) {
        throw new Error(`The file ${this.destination} does not appear to exist`);
      }
    }
  }

  override async revokeBang(): Promise<unknown> {
    this.sayStatus("revoke");

    let content: string;
    let regexp: RegExp;
    if (this.behavior === "after") {
      content = "\\1\\2";
      regexp = new RegExp(`(${toS(this.flag)})(.*)(${regexpEscape(await this.replacement)})`, "s");
    } else {
      content = "\\2\\3";
      regexp = new RegExp(`(${regexpEscape(await this.replacement)})(.*)(${toS(this.flag)})`, "s");
    }

    return this.replaceBang(regexp, content, true);
  }

  /** @internal */
  protected override sayStatus(
    behavior: string,
    { warning = null, color = null }: { warning?: string | null; color?: string | null } = {},
  ): void {
    let status: string;
    if (behavior === "invoke") {
      if (rbEqual(this.flag, /^/)) {
        status = "prepend";
      } else if (rbEqual(this.flag, /$/)) {
        status = "append";
      } else {
        status = "insert";
      }
    } else if (rtest(warning)) {
      status = warning!;
    } else if (behavior === "unchanged") {
      status = "unchanged";
    } else {
      status = "subtract";
    }

    super.sayStatus(status, rtest(color) ? color : this.config["verbose"]);
  }

  /** @internal */
  protected async content(): Promise<string> {
    return (this._content ??= strNew(Array.from(await getFs().readFile(this.destination))));
  }

  /** @internal */
  protected async isReplacementPresent(): Promise<boolean> {
    return rbStrSend(await this.content(), "isInclude", await this.replacement)[0] as boolean;
  }

  /** @internal */
  protected async replaceBang(regexp: RegExp, string: string, force: unknown): Promise<unknown> {
    if (rtest(force) || !(await this.isReplacementPresent())) {
      let success: unknown;
      [success, this._content] = rbStrSend(await this.content(), "gsubBang", regexp, string);

      if (!rtest(this.isPretend())) {
        await File.writeAsync(this.destination, Uint8Array.from(bytes(await this.content())));
      }
      return success;
    }
  }
}
