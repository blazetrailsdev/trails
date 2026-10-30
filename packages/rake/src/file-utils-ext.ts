import {
  ArgumentError,
  FileUtils as StdlibFileUtils,
  extend,
  include,
  puts,
  rbEnsure,
  rtest,
  stderr as $stderr,
} from "@blazetrails/ruby-compat";
import { FileUtils } from "./file-utils.js";
import { Rake } from "./rake-module.js";

type FU = typeof StdlibFileUtils;

export const FileUtilsExt = {
  verboseFlag: null as unknown,
  nowriteFlag: null as unknown,
  DEFAULT: {} as object,

  async mkdirP(list: string | string[], options: Parameters<FU["mkdirPAsync"]>[1] = {}) {
    return StdlibFileUtils.mkdirPAsync(list, {
      verbose: FileUtilsExt.verboseFlag as boolean,
      noop: FileUtilsExt.nowriteFlag as boolean,
      ...options,
    });
  },

  async ln(src: string | string[], dest: string, options: Parameters<FU["lnAsync"]>[2] = {}) {
    return StdlibFileUtils.lnAsync(src, dest, {
      verbose: FileUtilsExt.verboseFlag as boolean,
      noop: FileUtilsExt.nowriteFlag as boolean,
      ...options,
    });
  },

  async cp(src: string | string[], dest: string, options: Parameters<FU["cpAsync"]>[2] = {}) {
    return StdlibFileUtils.cpAsync(src, dest, {
      verbose: FileUtilsExt.verboseFlag as boolean,
      noop: FileUtilsExt.nowriteFlag as boolean,
      ...options,
    });
  },

  async rmR(list: string | string[], options: Parameters<FU["rmRAsync"]>[1] = {}) {
    return StdlibFileUtils.rmRAsync(list, {
      verbose: FileUtilsExt.verboseFlag as boolean,
      noop: FileUtilsExt.nowriteFlag as boolean,
      ...options,
    });
  },

  async rmRf(list: string | string[], options: Parameters<FU["rmRfAsync"]>[1] = {}) {
    return StdlibFileUtils.rmRfAsync(list, {
      verbose: FileUtilsExt.verboseFlag as boolean,
      noop: FileUtilsExt.nowriteFlag as boolean,
      ...options,
    });
  },

  async chmodR(
    mode: number,
    list: string | string[],
    options: Parameters<FU["chmodRAsync"]>[2] = {},
  ) {
    return StdlibFileUtils.chmodRAsync(mode, list, {
      verbose: FileUtilsExt.verboseFlag as boolean,
      noop: FileUtilsExt.nowriteFlag as boolean,
      ...options,
    });
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

Object.defineProperties(FileUtilsExt, {
  verboseFlag: { enumerable: false },
  nowriteFlag: { enumerable: false },
});

FileUtilsExt.verboseFlag = FileUtilsExt.DEFAULT;
FileUtilsExt.nowriteFlag = false;

include(FileUtilsExt, FileUtils);

extend(FileUtilsExt, FileUtilsExt);

Rake.FileUtilsExt = FileUtilsExt;
