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

type Options = { verbose?: boolean; noop?: boolean; [key: string]: unknown };

export const FileUtilsExt = {
  DEFAULT: {} as object,

  verboseFlag: null as unknown,

  nowriteFlag: false as unknown,

  async mkdirP(list: string | string[], options: Options = {}): Promise<unknown> {
    return StdlibFileUtils.mkdirPAsync(list, {
      verbose: FileUtilsExt.verboseFlag as boolean,
      noop: FileUtilsExt.nowriteFlag as boolean,
      ...options,
    });
  },

  async ln(src: string | string[], dest: string, options: Options = {}): Promise<unknown> {
    return StdlibFileUtils.lnAsync(src, dest, {
      verbose: FileUtilsExt.verboseFlag as boolean,
      noop: FileUtilsExt.nowriteFlag as boolean,
      ...options,
    });
  },

  async cp(src: string | string[], dest: string, options: Options = {}): Promise<unknown> {
    return StdlibFileUtils.cpAsync(src, dest, {
      verbose: FileUtilsExt.verboseFlag as boolean,
      noop: FileUtilsExt.nowriteFlag as boolean,
      ...options,
    });
  },

  async rmR(list: string | string[], options: Options = {}): Promise<unknown> {
    return StdlibFileUtils.rmRAsync(list, {
      verbose: FileUtilsExt.verboseFlag as boolean,
      noop: FileUtilsExt.nowriteFlag as boolean,
      ...options,
    });
  },

  async rmRf(list: string | string[], options: Options = {}): Promise<unknown> {
    return StdlibFileUtils.rmRfAsync(list, {
      verbose: FileUtilsExt.verboseFlag as boolean,
      noop: FileUtilsExt.nowriteFlag as boolean,
      ...options,
    });
  },

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
      return block?.();
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
    if (!(Object.keys(h).length === 0))
      throw new ArgumentError(`no such option: ${Object.keys(h).join(" ")}`);
  },
};

include(FileUtilsExt, FileUtils);

Object.defineProperties(FileUtilsExt, {
  verboseFlag: { value: FileUtilsExt.DEFAULT, writable: true, enumerable: false },
  nowriteFlag: { value: false, writable: true, enumerable: false },
});

extend(FileUtilsExt, FileUtilsExt);
