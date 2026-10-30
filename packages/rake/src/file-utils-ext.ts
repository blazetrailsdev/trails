import {
  ArgumentError,
  FileUtils as StdlibFileUtils,
  extend,
  include,
  isPlainHash,
  puts,
  rbEnsure,
  rtest,
  stderr as $stderr,
} from "@blazetrails/ruby-compat";
import { FileUtils } from "./file-utils.js";
import { Rake } from "./rake-module.js";

type FU = typeof StdlibFileUtils;

const commands = [
  "mkdir",
  "mkdirP",
  "mkpath",
  "makedirs",
  "rmdir",
  "ln",
  "link",
  "lnS",
  "symlink",
  "lnSf",
  "cp",
  "copy",
  "cpR",
  "mv",
  "move",
  "rm",
  "remove",
  "rmF",
  "safeUnlink",
  "rmR",
  "rmRf",
  "rmtree",
  "chmod",
  "chmodR",
  "touch",
] as const;

type Commands = { [K in (typeof commands)[number]]: FU[`${K}Async`] } & {
  chdir: typeof fileUtilsExt.cd;
};

const fileUtilsExt = {
  verboseFlag: null as unknown,
  nowriteFlag: null as unknown,
  DEFAULT: {} as object,

  /** @inventedArm if — PERMANENT */
  cd<T>(
    dir: string,
    options: { verbose?: boolean | null } | ((dir: string) => T) = {},
    block?: (dir: string) => T,
  ) {
    if (typeof options === "function") [options, block] = [{}, options];
    const verbose = FileUtilsExt.verboseFlag as boolean;
    return StdlibFileUtils.cd(dir, { verbose, ...options }, block!);
  },

  /** @inventedArm if — PERMANENT */
  verbose(value: unknown = null, block?: () => unknown): unknown {
    const oldvalue = FileUtilsExt.verboseFlag;
    if (value != null) FileUtilsExt.verboseFlag = value;
    if (block != null) {
      const result = rbEnsure(block, () => {
        FileUtilsExt.verboseFlag = oldvalue;
      });
      if (result instanceof Promise) return result.then(() => FileUtilsExt.verboseFlag);
    }
    return FileUtilsExt.verboseFlag;
  },

  /** @inventedArm if — PERMANENT */
  nowrite(value: unknown = null, block?: () => unknown): unknown {
    const oldvalue = FileUtilsExt.nowriteFlag;
    if (value != null) FileUtilsExt.nowriteFlag = value;
    if (block != null) {
      const result = rbEnsure(block, () => {
        FileUtilsExt.nowriteFlag = oldvalue;
      });
      if (result instanceof Promise) return result.then(() => oldvalue);
    }
    return oldvalue;
  },

  whenWriting(msg: string | null = null, block?: () => unknown): unknown {
    if (rtest(FileUtilsExt.nowriteFlag)) {
      if (rtest(msg)) puts.call($stderr, `DRYRUN: ${msg}`);
    } else {
      return block!();
    }
  },

  rakeOutputMessage(message: string): void {
    puts.call($stderr, message);
  },

  rakeCheckOptions(options: Record<string, unknown>, ...optdecl: string[]): void {
    const h = { ...options };
    for (const name of optdecl) {
      delete h[name];
    }
    if (Object.keys(h).length !== 0)
      throw new ArgumentError(`no such option: ${Object.keys(h).join(" ")}`);
  },
};

export const FileUtilsExt = fileUtilsExt as typeof fileUtilsExt & Commands;

Object.defineProperties(FileUtilsExt, {
  verboseFlag: { enumerable: false },
  nowriteFlag: { enumerable: false },
});

FileUtilsExt.verboseFlag = FileUtilsExt.DEFAULT;
FileUtilsExt.nowriteFlag = false;

const generated = FileUtilsExt as unknown as Record<string, (...args: unknown[]) => unknown>;
const stdlib = StdlibFileUtils as unknown as typeof generated;
for (const name of commands) {
  generated[name] = (...args) => {
    const options = isPlainHash(args.at(-1)) ? (args.pop() as object) : {};
    return stdlib[`${name}Async`](...args, {
      verbose: FileUtilsExt.verboseFlag,
      noop: FileUtilsExt.nowriteFlag,
      ...options,
    });
  };
}

FileUtilsExt.chdir = FileUtilsExt.cd;

include(FileUtilsExt, FileUtils);

extend(FileUtilsExt, FileUtilsExt);

Rake.FileUtilsExt = FileUtilsExt;
