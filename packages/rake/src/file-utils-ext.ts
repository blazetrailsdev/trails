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

function defaultOptions(): Options {
  return {
    verbose: FileUtilsExt.verboseFlag as boolean,
    noop: FileUtilsExt.nowriteFlag as boolean,
  };
}

function flagBlock<T>(
  set: (value: unknown) => void,
  oldvalue: unknown,
  block: () => T,
  result: () => unknown,
): unknown {
  const value = rbEnsure(block, () => set(oldvalue));
  if (value instanceof Promise) return value.then(result);
  return result();
}

export const FileUtilsExt = {
  DEFAULT: {} as object,

  async mkdirP(list: string | string[], options: Options = {}): Promise<unknown> {
    return StdlibFileUtils.mkdirPAsync(list, { ...defaultOptions(), ...options });
  },

  async ln(src: string | string[], dest: string, options: Options = {}): Promise<unknown> {
    return StdlibFileUtils.lnAsync(src, dest, { ...defaultOptions(), ...options });
  },

  async cp(src: string | string[], dest: string, options: Options = {}): Promise<unknown> {
    return StdlibFileUtils.cpAsync(src, dest, { ...defaultOptions(), ...options });
  },

  async rmR(list: string | string[], options: Options = {}): Promise<unknown> {
    return StdlibFileUtils.rmRAsync(list, { ...defaultOptions(), ...options });
  },

  async rmRf(list: string | string[], options: Options = {}): Promise<unknown> {
    return StdlibFileUtils.rmRfAsync(list, { ...defaultOptions(), ...options });
  },

  verbose(value: unknown = null, block?: () => unknown): unknown {
    const oldvalue = FileUtilsExt.verboseFlag;
    if (value != null) FileUtilsExt.verboseFlag = value;
    if (block != null) {
      return flagBlock(
        (v) => (FileUtilsExt.verboseFlag = v),
        oldvalue,
        block,
        () => FileUtilsExt.verboseFlag,
      );
    }
    return FileUtilsExt.verboseFlag;
  },

  nowrite(value: unknown = null, block?: () => unknown): unknown {
    const oldvalue = FileUtilsExt.nowriteFlag;
    if (value != null) FileUtilsExt.nowriteFlag = value;
    if (block != null) {
      return flagBlock(
        (v) => (FileUtilsExt.nowriteFlag = v),
        oldvalue,
        block,
        () => oldvalue,
      );
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
} as FileUtilsExtModule;

interface FileUtilsExtModule {
  DEFAULT: object;
  verboseFlag: unknown;
  nowriteFlag: unknown;
  mkdirP(list: string | string[], options?: Options): Promise<unknown>;
  ln(src: string | string[], dest: string, options?: Options): Promise<unknown>;
  cp(src: string | string[], dest: string, options?: Options): Promise<unknown>;
  rmR(list: string | string[], options?: Options): Promise<unknown>;
  rmRf(list: string | string[], options?: Options): Promise<unknown>;
  verbose(value?: unknown, block?: () => unknown): unknown;
  nowrite(value?: unknown, block?: () => unknown): unknown;
  whenWriting(msg?: string | null, block?: () => unknown): unknown;
  rakeOutputMessage(message: string): void;
  rakeCheckOptions(options: Record<string, unknown>, ...optdecl: string[]): void;
  createShellRunner: typeof FileUtils.createShellRunner;
  shShowCommand: typeof FileUtils.shShowCommand;
  setVerboseOption: typeof FileUtils.setVerboseOption;
  sh: typeof FileUtils.sh;
  ruby: typeof FileUtils.ruby;
  safeLn: typeof FileUtils.safeLn;
  splitAll: typeof FileUtils.splitAll;
}

include(FileUtilsExt, FileUtils);

Object.defineProperties(FileUtilsExt, {
  verboseFlag: { value: FileUtilsExt.DEFAULT, writable: true, enumerable: false },
  nowriteFlag: { value: false, writable: true, enumerable: false },
});

extend(FileUtilsExt, FileUtilsExt);
