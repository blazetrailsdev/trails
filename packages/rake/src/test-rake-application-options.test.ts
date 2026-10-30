import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Dir,
  Errno,
  File,
  LOAD_PATH,
  LoadError,
  OptionParser,
  STDERR,
  STDOUT,
  SystemExit,
  env as ENV,
  setEnv,
} from "@blazetrails/ruby-compat";
import { Application, CommandLineOptionError, type ApplicationOptions } from "./application.js";
import { FileUtilsExt } from "./file-utils-ext.js";
import { Rake } from "./rake-module.js";
import { captureOutput, useApplicationTestCase } from "./test-helpers/application.js";
import { VERSION } from "./version.js";

const globals = globalThis as unknown as { TESTING_REQUIRE: number[]; $xyzzy: unknown };

describe("TestRakeApplicationOptions", () => {
  const state = useApplicationTestCase();
  let app: Application;
  let tasks: string[];
  let exited: unknown;

  beforeEach(() => {
    globals.TESTING_REQUIRE = [];
  });
  afterEach(() => {
    delete (globals as Partial<typeof globals>).$xyzzy;
  });

  async function commandLine(...options: string[]): Promise<ApplicationOptions> {
    app = new Application();
    const args = await app.handleOptions(options);
    app.collectCommandLineTasks(args);
    tasks = app.topLevelTasks;
    return app.options;
  }

  async function flags(
    ...sets: (string | string[] | ((opts: ApplicationOptions) => unknown))[]
  ): Promise<void> {
    const block =
      typeof sets.at(-1) === "function"
        ? (sets.pop() as (opts: ApplicationOptions) => unknown)
        : null;
    for (const set of sets as (string | string[])[]) {
      exited = null;
      try {
        await commandLine(...[set].flat());
      } catch (e) {
        if (!(e instanceof SystemExit)) throw e;
        exited = "exit";
      }
      await block?.(app.options);
    }
  }

  it("default options", async () => {
    const opts = await commandLine();
    expect(opts.backtrace).toBe(false);
    expect(opts.dryrun).toBe(false);
    expect(opts.ignoreSystem).toBe(false);
    expect(opts.loadSystem).toBe(false);
    expect(opts.alwaysMultitask).toBe(false);
    expect(opts.nosearch).toBe(false);
    expect(opts.rakelib).toEqual(["rakelib"]);
    expect(opts.showPrereqs).toBe(false);
    expect(opts.showTaskPattern).toBeNull();
    expect(opts.showTasks).toBeNull();
    expect(opts.silent).toBe(false);
    expect(opts.trace).toBe(false);
    expect(opts.threadPoolSize).toBe(Rake.suggestedThreadCount());
    expect(opts.rakelib).toEqual(["rakelib"]);
    expect(FileUtilsExt.verboseFlag).toBeFalsy();
    expect(FileUtilsExt.nowriteFlag).toBeFalsy();
  });

  it("dry run", async () => {
    await flags("--dry-run", "-n", (opts) => {
      expect(opts.dryrun).toBeTruthy();
      expect(opts.trace).toBeTruthy();
      expect(FileUtilsExt.verboseFlag).toBeTruthy();
      expect(FileUtilsExt.nowriteFlag).toBeTruthy();
    });
  });

  it("describe", async () => {
    await flags("--describe", (opts) => {
      expect(opts.showTasks).toBe("describe");
      expect(opts.showTaskPattern!.source).toBe(new RegExp("").source);
    });
  });

  it("describe with pattern", async () => {
    await flags("--describe=X", (opts) => {
      expect(opts.showTasks).toBe("describe");
      expect(opts.showTaskPattern!.source).toBe("X");
    });
  });

  it("directory", async () => {
    const pwd = Dir.pwd();
    for (const flag of [["--directory"], "--directory=", ["-C"], "-C"]) {
      const dir = Dir.mktmpdir("test_rake_dir");
      const withDir = (d: string) => (typeof flag === "string" ? flag + d : [...flag, d]);
      try {
        await flags(withDir(dir), () => {
          expect(app.originalDir).toBe(File.realpath(dir));
        });
      } finally {
        Dir.chdir(pwd);
      }
      try {
        await expect(flags(withDir(`${dir}/nonexistent`))).rejects.toThrow(Errno.ENOENT);
      } finally {
        Dir.chdir(pwd);
      }
    }
  });

  it("execute", async () => {
    globals.$xyzzy = 0;
    await flags("--execute=$xyzzy=1", "-e $xyzzy=1", () => {
      expect(globals.$xyzzy).toBe(1);
      expect(exited).toBe("exit");
      globals.$xyzzy = 0;
    });
  });

  it("execute and continue", async () => {
    globals.$xyzzy = 0;
    await flags("--execute-continue=$xyzzy=1", "-E $xyzzy=1", () => {
      expect(globals.$xyzzy).toBe(1);
      expect(exited).not.toBe("exit");
      globals.$xyzzy = 0;
    });
  });

  it("execute and print", async () => {
    globals.$xyzzy = 0;
    const [out] = await captureOutput(() =>
      flags('--execute-print=$xyzzy="pugh"', '-p $xyzzy="pugh"', () => {
        expect(globals.$xyzzy).toBe("pugh");
        expect(exited).toBe("exit");
        globals.$xyzzy = 0;
      }),
    );

    expect(out).toMatch(/^pugh$/m);
  });

  it("help", async () => {
    const [out] = await captureOutput(() => flags("--help", "-H", "-h"));

    expect(out).toMatch(/^rake/);
    expect(out).toMatch(/\boptions\b/);
    expect(out).toMatch(/\btargets\b/);
    expect(exited).toBe("exit");
  });

  it("jobs", async () => {
    await flags([], (opts) => {
      expect(opts.threadPoolSize).toBe(Rake.suggestedThreadCount());
    });
    await flags(["--jobs", "0"], ["-j", "0"], (opts) => expect(opts.threadPoolSize).toBe(0));
    await flags(["--jobs", "1"], ["-j", "1"], (opts) => expect(opts.threadPoolSize).toBe(0));
    await flags(["--jobs", "4"], ["-j", "4"], (opts) => expect(opts.threadPoolSize).toBe(3));
    await flags(["--jobs", "asdas"], ["-j", "asdas"], (opts) => {
      expect(opts.threadPoolSize).toBe(Rake.suggestedThreadCount() - 1);
    });
    await flags("--jobs", "-j", (opts) => {
      expect(opts.threadPoolSize).toBeGreaterThan(1_000_000);
    });
  });

  it("libdir", async () => {
    try {
      await flags(["--libdir", "xx"], ["-I", "xx"], ["-Ixx"], () => {
        expect(LOAD_PATH).toContain("xx");
      });
    } finally {
      LOAD_PATH.splice(0, LOAD_PATH.length, ...LOAD_PATH.filter((p) => p !== "xx"));
    }
  });

  it("multitask", async () => {
    await flags("--multitask", "-m", (opts) => expect(opts.alwaysMultitask).toBe(true));
  });

  it("rakefile", async () => {
    await flags(["--rakefile", "RF"], ["--rakefile=RF"], ["-f", "RF"], ["-fRF"], () => {
      expect(app._rakefiles).toEqual(["RF"]);
    });
  });

  it("rakelib", async () => {
    const dirs = ["A", "B", "C"].join(File.PATH_SEPARATOR);
    await flags(
      ["--rakelibdir", dirs],
      [`--rakelibdir=${dirs}`],
      ["-R", dirs],
      [`-R${dirs}`],
      (opts) => expect(opts.rakelib).toEqual(["A", "B", "C"]),
    );
  });

  it("require", async () => {
    LOAD_PATH.unshift(state.tempdir);
    try {
      await File.writeAsync("reqfile.js", "globalThis.TESTING_REQUIRE.push(1)");
      await File.writeAsync("reqfile2.js", "globalThis.TESTING_REQUIRE.push(2)");
      await File.writeAsync("reqfile3.ts", "globalThis.TESTING_REQUIRE.push(3)");

      await flags(["--require", "reqfile"], "-rreqfile2", "-rreqfile3");

      expect(globals.TESTING_REQUIRE).toContain(1);
      expect(globals.TESTING_REQUIRE).toContain(2);
      expect(globals.TESTING_REQUIRE).toContain(3);

      expect(globals.TESTING_REQUIRE.length).toBe(3);
    } finally {
      LOAD_PATH.splice(LOAD_PATH.indexOf(state.tempdir), 1);
    }
  });

  it("missing require", async () => {
    const ex = (await flags(["--require", "test/missing"]).catch((e: unknown) => e)) as Error;
    expect(ex).toBeInstanceOf(LoadError);
    expect(ex.message).toMatch(/such file/);
    expect(ex.message).toMatch(/test\/missing/);
  });

  it("prereqs", async () => {
    await flags("--prereqs", "-P", (opts) => expect(opts.showPrereqs).toBeTruthy());
  });

  it("quiet", async () => {
    FileUtilsExt.verboseFlag = true;
    await flags("--quiet", "-q", (opts) => {
      expect(FileUtilsExt.verboseFlag).toBeFalsy();
      expect(opts.silent).toBeFalsy();
    });
  });

  it("no search", async () => {
    await flags("--nosearch", "--no-search", "-N", (opts) => expect(opts.nosearch).toBeTruthy());
  });

  it("silent", async () => {
    FileUtilsExt.verboseFlag = true;
    await flags("--silent", "-s", (opts) => {
      expect(FileUtilsExt.verboseFlag).toBeFalsy();
      expect(opts.silent).toBeTruthy();
    });
  });

  it("system", async () => {
    await flags("--system", "-g", (opts) => expect(opts.loadSystem).toBeTruthy());
  });

  it("no system", async () => {
    await flags("--no-system", "-G", (opts) => expect(opts.ignoreSystem).toBeTruthy());
  });

  function expectTrace(opts: ApplicationOptions, out: unknown): void {
    expect(opts.trace).toBeTruthy();
    expect(opts.backtrace).toBeTruthy();
    expect(opts.traceOutput).toBe(out);
    expect(FileUtilsExt.verboseFlag).toBeTruthy();
  }

  function expectBacktrace(opts: ApplicationOptions, out: unknown): void {
    expect(opts.backtrace).toBeTruthy();
    expect(opts.traceOutput).toBe(out);
    expect(opts.trace).toBeFalsy();
  }

  it("trace", async () => {
    await flags("--trace", "-t", (opts) => {
      expectTrace(opts, STDERR);
      expect(FileUtilsExt.nowriteFlag).toBeFalsy();
    });
  });

  it("trace with stdout", async () => {
    await flags("--trace=stdout", "-tstdout", (opts) => {
      expectTrace(opts, STDOUT);
      expect(FileUtilsExt.nowriteFlag).toBeFalsy();
    });
  });

  it("trace with stderr", async () => {
    await flags("--trace=stderr", "-tstderr", (opts) => {
      expectTrace(opts, STDERR);
      expect(FileUtilsExt.nowriteFlag).toBeFalsy();
    });
  });

  it("trace with error", async () => {
    const ex = (await flags("--trace=xyzzy").catch((e: unknown) => e)) as Error;
    expect(ex).toBeInstanceOf(CommandLineOptionError);
    expect(ex.message).toMatch(/un(known|recognized).*\btrace\b.*xyzzy/i);
  });

  it("trace with following task name", async () => {
    await flags(["--trace", "taskname"], ["-t", "taskname"], (opts) => {
      expectTrace(opts, STDERR);
      expect(app.topLevelTasks).toEqual(["taskname"]);
    });
  });

  it("backtrace", async () => {
    await flags("--backtrace", (opts) => expectBacktrace(opts, STDERR));
  });

  it("backtrace with stdout", async () => {
    await flags("--backtrace=stdout", (opts) => expectBacktrace(opts, STDOUT));
  });

  it("backtrace with stderr", async () => {
    await flags("--backtrace=stderr", (opts) => expectBacktrace(opts, STDERR));
  });

  it("backtrace with error", async () => {
    const ex = (await flags("--backtrace=xyzzy").catch((e: unknown) => e)) as Error;
    expect(ex).toBeInstanceOf(CommandLineOptionError);
    expect(ex.message).toMatch(/un(known|recognized).*\bbacktrace\b.*xyzzy/i);
  });

  it("backtrace with following task name", async () => {
    await flags(["--backtrace", "taskname"], (opts) => {
      expectBacktrace(opts, STDERR);
      expect(app.topLevelTasks).toEqual(["taskname"]);
    });
  });

  it("trace rules", async () => {
    await flags("--rules", (opts) => expect(opts.traceRules).toBeTruthy());
  });

  it("tasks", async () => {
    await flags("--tasks", "-T", (opts) => {
      expect(opts.showTasks).toBe("tasks");
      expect(opts.showTaskPattern!.source).toBe(new RegExp("").source);
      expect(opts.showAllTasks).toBe(false);
    });
    await flags(["--tasks", "xyz"], ["-Txyz"], (opts) => {
      expect(opts.showTasks).toBe("tasks");
      expect(opts.showTaskPattern!.source).toBe("xyz");
      expect(opts.showAllTasks).toBe(false);
    });
    await flags(["--tasks", "xyz", "--comments"], (opts) => {
      expect(opts.showTasks).toBe("tasks");
      expect(opts.showTaskPattern!.source).toBe("xyz");
      expect(opts.showAllTasks).toBe(false);
    });
  });

  it("where", async () => {
    await flags("--where", "-W", (opts) => {
      expect(opts.showTasks).toBe("lines");
      expect(opts.showTaskPattern!.source).toBe(new RegExp("").source);
      expect(opts.showAllTasks).toBe(true);
    });
    await flags(["--where", "xyz"], ["-Wxyz"], (opts) => {
      expect(opts.showTasks).toBe("lines");
      expect(opts.showTaskPattern!.source).toBe("xyz");
      expect(opts.showAllTasks).toBe(true);
    });
    await flags(["--where", "xyz", "--comments"], ["-Wxyz", "--comments"], (opts) => {
      expect(opts.showTasks).toBe("lines");
      expect(opts.showTaskPattern!.source).toBe("xyz");
      expect(opts.showAllTasks).toBe(false);
    });
  });

  it("no deprecated messages", async () => {
    await flags("--no-deprecation-warnings", "-X", (opts) =>
      expect(opts.ignoreDeprecate).toBeTruthy(),
    );
  });

  it("verbose", async () => {
    await captureOutput(() =>
      flags("--verbose", "-v", (opts) => {
        expect(FileUtilsExt.verboseFlag).toBeTruthy();
        expect(opts.silent).toBeFalsy();
      }),
    );
  });

  it("version", async () => {
    const [out] = await captureOutput(() => flags("--version", "-V"));

    expect(out).toMatch(/\bversion\b/);
    expect(out).toContain(VERSION);
    expect(exited).toBe("exit");
  });

  it("bad option", async () => {
    const [, err] = await captureOutput(async () => {
      const ex = (await flags("--bad-option").catch((e: unknown) => e)) as Error;
      expect(ex).toBeInstanceOf(OptionParser.InvalidOption);
      expect(ex.message).toMatch(/(invalid|unrecognized) option/i);
      expect(ex.message).toMatch(/--bad-option/);
    });

    expect(err).toBe("");
  });

  it("task collection", async () => {
    await commandLine("a", "b");
    expect([...tasks].sort()).toEqual(["a", "b"]);
  });

  it("default task collection", async () => {
    await commandLine();
    expect(tasks).toEqual(["default"]);
  });

  it("environment definition", async () => {
    setEnv("TESTKEY", undefined);
    await commandLine("TESTKEY=12");
    expect(ENV["TESTKEY"]).toBe("12");
  });

  it("multiline environment definition", async () => {
    setEnv("TESTKEY", undefined);
    await commandLine("TESTKEY=a\nb\n");
    expect(ENV["TESTKEY"]).toBe("a\nb\n");
  });

  it("environment and tasks together", async () => {
    setEnv("TESTKEY", undefined);
    await commandLine("a", "b", "TESTKEY=12");
    expect([...tasks].sort()).toEqual(["a", "b"]);
    expect(ENV["TESTKEY"]).toBe("12");
  });

  it("rake explicit task library", () => {
    Rake.addRakelib("app/task", "other");

    const libs = Rake.application!.options.rakelib!;

    expect(libs).toContain("app/task");
    expect(libs).toContain("other");
  });
});
