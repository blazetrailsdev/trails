import {
  Exception,
  File,
  IO,
  Marshal,
  Process,
  StandardError,
  Tempfile,
  env,
  excSetBacktrace,
  pack,
  include,
  rbCallSuper,
  rbFCaller,
  rbInspect,
  rbModName,
  rbObjDup,
  rbObjMethod,
  rbObjRespondTo,
  unpack1,
} from "@blazetrails/ruby-compat";
import { Assertion, Skip, UnexpectedError, type Test } from "./assertions.js";

type Status = InstanceType<typeof Process.Status>;
type SerializedFailure = [kind: string, message: string, backtrace: string[]];

export class SubprocessCrashed extends StandardError {}

export function isForkingEnv(): boolean {
  return env["NO_FORK"] == null && rbObjRespondTo(Process, "fork");
}

/** @missingRailsCall parallelize_me! — PERMANENT */
async function run(this: Test & typeof Subprocess): Promise<Test> {
  const [status, serialized] = await this.runInIsolation(() => rbCallSuper(this, run));

  if (status?.isSuccess() !== true) {
    const error = new SubprocessCrashed(
      `Subprocess exited with an error: ${rbInspect(status)}\noutput: ${rbInspect(serialized)}`,
    );
    excSetBacktrace(error, rbFCaller());
    this.failures.push(new UnexpectedError(error));
    return rbObjDup(this);
  }

  return load(this, serialized);
}

/** @noRailsEquivalent PERMANENT */
function dump(test: Test): string | Uint8Array {
  const failures: SerializedFailure[] = test.failures.map((e) => {
    const error = e instanceof UnexpectedError ? e.error : e;
    return [
      e instanceof UnexpectedError ? "error" : e instanceof Skip ? "skip" : "assertion",
      error.message,
      (error.stack ?? "").split("\n"),
    ];
  });
  return Marshal.dump([test.assertions, failures]) as string | Uint8Array;
}

/** @noRailsEquivalent PERMANENT */
function load(test: Test, serialized: unknown): Test {
  const [assertions, failures] = Marshal.load(serialized) as [number, SerializedFailure[]];
  const result = rbObjDup(test);
  result.assertions = assertions;
  result.failures = failures.map(([kind, message, backtrace]) => {
    if (kind === "error") {
      const ex = new Exception(message);
      excSetBacktrace(ex, backtrace);
      return new UnexpectedError(ex);
    }
    const failure = kind === "skip" ? new Skip(message) : new Assertion(message);
    failure.stack = backtrace.join("\n");
    return failure;
  });
  return result;
}

export const Subprocess = {
  /**
   * @missingRailsCall ORIG_ARGV — PERMANENT
   * @missingRailsCall exit! — PERMANENT
   * @missingRailsCall require — PERMANENT
   */
  async runInIsolation(this: Test, blk: () => unknown): Promise<[Status | null, unknown]> {
    if (env["ISOLATION_TEST"] != null) {
      await blk();
      const testResult = dump(this);
      await File.writeAsync(env["ISOLATION_OUTPUT"]!, pack([testResult], "m"));
      return [new Process.Status({ pid: 0, status: 0, signal: null }), testResult];
    } else {
      const tmpfile = Tempfile.new("isolation");
      try {
        const className = rbModName(this.constructor) ?? "";
        const childEnv = {
          ISOLATION_TEST: className,
          ISOLATION_OUTPUT: tmpfile.path(),
        };

        const description = this.name.slice("test_".length).split("_");
        const testName = [...className.split("::").filter(Boolean), ...description]
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join("[\\s_]+");
        const testOpts = `-t=^${testName}$`;

        const [file] = rbObjMethod(this, this.name).sourceLocation()!;

        await IO.popen([childEnv, "vitest", "run", file, testOpts], (child) => child.read());
        const status = Process.lastStatus;

        return [status, unpack1(await File.readAsync(tmpfile.path()!), "m")];
      } finally {
        tmpfile.close();
      }
    }
  },
};

export const Isolation = { SubprocessCrashed, Subprocess, run };
Object.defineProperty(Isolation, "isForkingEnv", { value: isForkingEnv });

include(Isolation, Subprocess);
