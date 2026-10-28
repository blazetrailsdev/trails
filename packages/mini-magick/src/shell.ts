import {
  Benchmark,
  env as ENV,
  STDERR as $stderr,
  slice,
  rbInspect,
  Open3,
  Errno,
  IOError,
  format,
} from "@blazetrails/ruby-compat";
import { TimeoutError, Error } from "./mini-magick.js";
import { MiniMagick } from "./mini-magick.js";

type ShellResult = [stdout: string, stderr: string, status: number | null];

export class Shell {
  static toString(): string {
    return "MiniMagick::Shell";
  }

  async run(
    command: string[],
    {
      errors = MiniMagick.errors,
      warnings = MiniMagick.warnings,
      ...options
    }: {
      errors?: unknown;
      warnings?: unknown;
      stdin?: string | Uint8Array;
      timeout?: unknown;
    } = {},
  ): Promise<ShellResult> {
    const [stdout, stderr, status] = await this.execute(command, options);

    if (status !== 0) {
      if (stderr.includes("time limit exceeded")) {
        throw new TimeoutError(`\`${command.join(" ")}\` has timed out`);
      } else if (errors != null && errors !== false) {
        throw new Error(
          `\`${command.join(" ")}\` failed with status: ${rbInspect(status)} and error:\n${stderr}`,
        );
      }
    }

    if (warnings != null && warnings !== false) $stderr.print(stderr);

    return [stdout, stderr, status];
  }

  async execute(
    command: string[],
    {
      stdin = "",
      timeout = MiniMagick.timeout,
    }: { stdin?: string | Uint8Array; timeout?: unknown } = {},
  ): Promise<ShellResult> {
    try {
      const env: Record<string, string | null | undefined> =
        MiniMagick.restrictedEnv != null && MiniMagick.restrictedEnv !== false
          ? slice(ENV, "HOME", "PATH", "LANG")
          : {};
      Object.assign(env, MiniMagick.cliEnv);
      if (timeout != null && timeout !== false) env["MAGICK_TIME_LIMIT"] = String(timeout);

      const [stdout, stderr, status] = await this.log(command.join(" "), () =>
        Open3.capture3(env, ...command, {
          stdinData: stdin,
          unsetenvOthers: MiniMagick.restrictedEnv,
        }),
      );

      return [stdout, stderr, status?.exitstatus() ?? null];
    } catch (error) {
      if (error instanceof Errno.ENOENT || error instanceof IOError) {
        return ["", `executable not found: "${command[0]}"`, 127];
      }
      throw error;
    }
  }

  /** @internal */
  private async log<T>(command: string, block: () => Promise<T>): Promise<T> {
    let value!: T;
    const duration = await Benchmark.realtime(async () => {
      value = await block();
    });
    MiniMagick.logger!.debug(format("[%.2fs] %s", duration, command));
    return value;
  }
}
