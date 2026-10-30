import {
  File,
  NotImplementedError,
  Process,
  RbConfig,
  RuntimeError,
  StandardError,
  env as ENV,
  isPlainHash,
  rbBlockGivenP,
  rbFSystem,
  rtest,
} from "@blazetrails/ruby-compat";
import { FileUtilsExt } from "./file-utils-ext.js";
import { PseudoStatus } from "./pseudo-status.js";

type Options = Record<string, unknown>;
type ShellRunner = (ok: boolean | null, status: { exitstatus(): number | null }) => unknown;

interface FileUtilsHost {
  createShellRunner(cmd: unknown[]): ShellRunner;
  shShowCommand(cmd: unknown[]): string;
  setVerboseOption(options: Options): void;
  sh(...cmd: unknown[]): Promise<unknown>;
  ln(...args: unknown[]): Promise<unknown>;
  cp(...args: unknown[]): Promise<unknown>;
}

export const FileUtils = {
  RUBY:
    ENV["RUBY"] ??
    File.join(
      RbConfig.CONFIG["bindir"],
      RbConfig.CONFIG["ruby_install_name"] + RbConfig.CONFIG["EXEEXT"],
    ).replace(/^[\s\S]*\s[\s\S]*/, '"$&"'),

  async sh(
    this: Pick<FileUtilsHost, "createShellRunner" | "shShowCommand" | "setVerboseOption">,
    ...cmd: unknown[]
  ): Promise<unknown> {
    const block = rbBlockGivenP(cmd.at(-1)) ? (cmd.pop() as ShellRunner) : null;
    const options = isPlainHash(cmd.at(-1)) ? (cmd.pop() as Options) : {};
    const shellRunner = block != null ? block : this.createShellRunner(cmd);

    this.setVerboseOption(options);
    const verbose = options.verbose;
    delete options.verbose;
    const noopOption = options.noop;
    delete options.noop;
    const noop = rtest(noopOption) ? noopOption : FileUtilsExt.nowriteFlag;

    if (rtest(verbose)) FileUtilsExt.rakeOutputMessage(this.shShowCommand(cmd));

    if (!rtest(noop)) {
      const argv = cmd as Parameters<typeof rbFSystem>;
      const res = isPlainHash(cmd.at(-1))
        ? await rbFSystem(...argv)
        : await rbFSystem(...argv, options as Parameters<typeof rbFSystem>[0]);
      let status: { exitstatus(): number | null } | null = Process.lastStatus;
      if (!rtest(res) && status == null) status = new PseudoStatus(1);
      return shellRunner(res, status!);
    }
  },

  /** @internal */
  createShellRunner(this: Pick<FileUtilsHost, "shShowCommand">, cmd: unknown[]): ShellRunner {
    const showCommand = this.shShowCommand(cmd);
    return (ok, status) => {
      if (!rtest(ok)) {
        throw new RuntimeError(
          `Command failed with status (${status.exitstatus()}): ` + `[${showCommand}]`,
        );
      }
      return ok;
    };
  },

  /** @internal */
  shShowCommand(cmd: unknown[]): string {
    cmd = [...cmd];

    if (isPlainHash(cmd[0])) {
      let env: unknown = cmd[0];
      env = Object.entries(env as Options)
        .map(([name, value]) => `${name}=${value}`)
        .join(" ");
      cmd[0] = env;
    }

    return cmd.join(" ");
  },

  /** @internal */
  setVerboseOption(options: Options): void {
    if (!Object.hasOwn(options, "verbose")) {
      options.verbose =
        FileUtilsExt.verboseFlag === FileUtilsExt.DEFAULT || FileUtilsExt.verboseFlag;
    }
  },

  async ruby(this: Pick<FileUtilsHost, "sh">, ...args: unknown[]): Promise<unknown> {
    const block = rbBlockGivenP(args.at(-1)) ? [args.pop()] : [];
    const options = isPlainHash(args.at(-1)) ? (args.pop() as Options) : {};
    if (args.length > 1) {
      return this.sh(FileUtils.RUBY, ...args, options, ...block);
    } else {
      return this.sh(`${FileUtils.RUBY} ${args[0]}`, options, ...block);
    }
  },

  LN_SUPPORTED: [true],

  async safeLn(this: Pick<FileUtilsHost, "ln" | "cp">, ...args: unknown[]): Promise<unknown> {
    const options = isPlainHash(args.at(-1)) ? (args.pop() as Options) : {};
    if (FileUtils.LN_SUPPORTED[0]) {
      try {
        return Object.keys(options).length === 0
          ? await this.ln(...args)
          : await this.ln(...args, options);
      } catch (error) {
        if (!(error instanceof StandardError || error instanceof NotImplementedError)) throw error;
        FileUtils.LN_SUPPORTED[0] = false;
      }
    }
    return Object.keys(options).length === 0 ? this.cp(...args) : this.cp(...args, options);
  },

  splitAll(path: string): string[] {
    const [head, tail] = [File.dirname(path), File.basename(path)];
    if (head === "." || tail === "/") return [tail];
    if (head === "/") return [head, tail];
    return [...FileUtils.splitAll(head), tail];
  },
};
