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

const VERBOSE_NOOP = ["verbose", "noop"] as const;

const commands = {
  cd: ["verbose"],
  chdir: ["verbose"],
  mkdir: VERBOSE_NOOP,
  mkdirP: VERBOSE_NOOP,
  mkpath: VERBOSE_NOOP,
  makedirs: VERBOSE_NOOP,
  rmdir: VERBOSE_NOOP,
  ln: VERBOSE_NOOP,
  link: VERBOSE_NOOP,
  lnS: VERBOSE_NOOP,
  symlink: VERBOSE_NOOP,
  lnSf: VERBOSE_NOOP,
  lnSr: VERBOSE_NOOP,
  cp: VERBOSE_NOOP,
  copy: VERBOSE_NOOP,
  cpR: VERBOSE_NOOP,
  cpLr: VERBOSE_NOOP,
  mv: VERBOSE_NOOP,
  move: VERBOSE_NOOP,
  rm: VERBOSE_NOOP,
  remove: VERBOSE_NOOP,
  rmF: VERBOSE_NOOP,
  safeUnlink: VERBOSE_NOOP,
  rmR: VERBOSE_NOOP,
  rmRf: VERBOSE_NOOP,
  rmtree: VERBOSE_NOOP,
  chmod: VERBOSE_NOOP,
  chmodR: VERBOSE_NOOP,
  chown: VERBOSE_NOOP,
  chownR: VERBOSE_NOOP,
  install: VERBOSE_NOOP,
  touch: VERBOSE_NOOP,
} as const;

type Commands = {
  [K in keyof typeof commands]: `${K}Async` extends keyof FU ? FU[`${K}Async`] : FU[K & keyof FU];
};

const fileUtilsExt = {
  verboseFlag: null as unknown,
  nowriteFlag: null as unknown,
  DEFAULT: {} as object,

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
for (const [name, opts] of Object.entries<readonly string[]>(commands)) {
  generated[name] = (...args) => {
    const block = typeof args.at(-1) === "function" ? [args.pop()] : [];
    const options = isPlainHash(args.at(-1)) ? (args.pop() as object) : {};
    const defaultOptions: Record<string, unknown> = {};
    if (opts.includes("verbose")) defaultOptions.verbose = FileUtilsExt.verboseFlag;
    if (opts.includes("noop")) defaultOptions.noop = FileUtilsExt.nowriteFlag;
    return (stdlib[`${name}Async`] ?? stdlib[name])(
      ...args,
      { ...defaultOptions, ...options },
      ...block,
    );
  };
}

include(FileUtilsExt, FileUtils);

extend(FileUtilsExt, FileUtilsExt);

Rake.FileUtilsExt = FileUtilsExt;
