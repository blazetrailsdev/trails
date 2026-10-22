import { Benchmark } from "@blazetrails/activesupport";
import {
  rbCheckArrayType,
  Enumerator,
  rbEqual,
  rbInspect,
  stderr as $stderr,
  slice,
  update,
  rbObjAsString,
  Open3,
  Errno,
  IOError,
  first,
  format,
  rbModConstSet,
} from "@blazetrails/ruby-compat";
import { TimeoutError, Error } from "./mini-magick.js";
import { MiniMagick } from "./namespaces.js";

export class Shell {
  static toString(): string {
    return "MiniMagick::Shell";
  }

  run(
    command: unknown[],
    {
      errors = MiniMagick.errors,
      warnings = MiniMagick.warnings,
      ...options
    }: { errors?: unknown; warnings?: unknown } & Record<string, unknown> = {},
  ) {
    const [stdout, stderr, status] = ((x) => (x == null ? [] : (rbCheckArrayType(x) ?? [x])))(
      this.execute(command, { ...options }),
    );
    if (!rbEqual(status, 0)) {
      if (
        (stderr instanceof globalThis.Set ||
        stderr instanceof globalThis.Map ||
        stderr instanceof Enumerator
          ? [...stderr]
          : Object.getPrototypeOf(stderr) === Object.prototype
            ? Object.entries(stderr as object)
            : (stderr as unknown[])
        ).includes("time limit exceeded")
      ) {
        throw new TimeoutError(`\`${command.join(" ") ?? ""}\` has timed out`);
      } else if (errors != null && errors !== false) {
        throw new Error(
          `\`${command.join(" ") ?? ""}\` failed with status: ${rbInspect(status)} and error:\n${stderr ?? ""}`,
        );
      }
    }
    if (warnings != null && warnings !== false) {
      $stderr.print(stderr);
    }
    return [stdout, stderr, status];
  }

  execute(
    command: unknown[],
    { stdin = "", timeout = MiniMagick.timeout }: { stdin?: unknown; timeout?: unknown } = {},
  ) {
    let env: unknown, stdout, stderr, status;
    try {
      env =
        (MiniMagick.restrictedEnv ?? false) !== false
          ? slice(process.env, "HOME", "PATH", "LANG")
          : {};
      update(env, MiniMagick.cliEnv);
      if (timeout != null && timeout !== false) {
        env["MAGICK_TIME_LIMIT"] = rbObjAsString(timeout);
      }
      [stdout, stderr, status] = ((x) => (x == null ? [] : (rbCheckArrayType(x) ?? [x])))(
        this.log(command.join(" "), (): unknown =>
          Open3.capture3(
            env,
            ...(command == null ? [] : (rbCheckArrayType(command) ?? [command])),
            { stdinData: stdin, unsetenvOthers: MiniMagick.restrictedEnv },
          ),
        ),
      );
      return [stdout, stderr, status?.exitstatus()];
    } catch (error) {
      if (error instanceof Errno.ENOENT || error instanceof IOError) {
        return ["", `executable not found: "${first(command) ?? ""}"`, 127];
      } else {
        throw error;
      }
    }
  }

  /** @internal */
  protected log(command: unknown, block?: (...args: unknown[]) => unknown) {
    let value = null;
    const duration = Benchmark.realtime(() => {
      value = block();
      return value;
    });
    MiniMagick.logger.debug(format("[%.2fs] %s", ...[duration, command]));
    return value;
  }
}
rbModConstSet(MiniMagick, "Shell", Shell);
