import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Dir,
  File,
  OptionParser,
  RuntimeError,
  STDERR,
  STDOUT,
  StandardError,
  SystemExit,
  env as ENV,
  excSetBacktrace,
  puts,
  setEnv,
  stdout as $stdout,
} from "@blazetrails/ruby-compat";
import { Application } from "./application.js";
import { Rake } from "./rake-module.js";
import { Task } from "./task.js";
import {
  captureOutput,
  rakeSystemDir,
  rakefileDefault,
  rakefileUnittest,
  useApplicationTestCase,
} from "./test-helpers/application.js";

function utilLoader() {
  return {
    loadCalled: false,
    makeDummyCalled: false,
    load(arg: string) {
      if (arg !== "x.dummy") throw new Error(arg);
      this.loadCalled = true;
    },
    makeDummy() {
      this.makeDummyCalled = true;
    },
  };
}

describe("TestRakeApplication", () => {
  const state = useApplicationTestCase();
  let app: Application;

  beforeEach(() => {
    app = Rake.application!;
    app.options.rakelib = [];
  });

  it("class with application", async () => {
    const origApp = Rake.application;

    const returnApp = await Rake.withApplication((yieldApp) => {
      expect(yieldApp).not.toBe(origApp);

      expect(Rake.application).toBe(yieldApp);
    });

    expect(returnApp).not.toBe(origApp);
    expect(Rake.application).toBe(origApp);
  });

  it("class with application user defined", async () => {
    const origApp = Rake.application;

    const userApp = new Application();

    const returnApp = await Rake.withApplication(userApp, (yieldApp) => {
      expect(yieldApp).toBe(userApp);

      expect(Rake.application).toBe(userApp);
    });

    expect(returnApp).toBe(userApp);
    expect(Rake.application).toBe(origApp);
  });

  it("finding rakefile", async () => {
    await rakefileDefault();

    expect(await app.haveRakefile()).toMatch(/Rakefile/i);
  });

  it("not finding rakefile", async () => {
    app._rakefiles = ["NEVER_FOUND"];
    expect(!(await app.haveRakefile())).toBeTruthy();
    expect(app.rakefile).toBeNull();
  });

  it("load rakefile", async () => {
    await rakefileUnittest();

    await app.handleOptions([]);
    app.options.silent = true;
    await app.loadRakefile();

    expect(app.rakefile!.toLowerCase()).toBe("rakefile.ts");
    expect(Dir.pwd()).toBe(state.tempdir);
  });

  it("load rakefile doesnt print rakefile directory from same dir", async () => {
    await rakefileUnittest();

    const [, err] = await captureOutput(async () => {
      app.originalDir = File.expandPath(".");
      await app.rawLoadRakefile();
    });

    expect(err).toBeEmpty();
  });

  it("load rakefile from subdir", async () => {
    await rakefileUnittest();
    Dir.chdir("subdir");

    await app.handleOptions([]);
    app.options.silent = true;
    await app.loadRakefile();

    expect(app.rakefile!.toLowerCase()).toBe("rakefile.ts");
    expect(Dir.pwd()).toBe(state.tempdir);
  });

  it("load rakefile prints rakefile directory from subdir", async () => {
    await rakefileUnittest();
    Dir.chdir("subdir");

    const app = new Application();
    Rake.application = app;
    app.options.rakelib = [];

    const [, err] = await captureOutput(() => app.rawLoadRakefile());

    expect(err).toBe(`(in ${state.tempdir})\n`);
  });

  it("load rakefile doesnt print rakefile directory from subdir if silent", async () => {
    await rakefileUnittest();
    Dir.chdir("subdir");

    const [, err] = await captureOutput(async () => {
      await app.handleOptions([]);
      app.options.silent = true;
      await app.rawLoadRakefile();
    });

    expect(err).toBeEmpty();
  });

  it("load rakefile not found", async () => {
    Dir.chdir(state.tempdir);
    setEnv("RAKE_SYSTEM", "not_exist");

    await app.handleOptions([]);
    app.options.silent = true;

    const promise = app.rawLoadRakefile();
    await expect(promise).rejects.toThrow(RuntimeError);
    const ex = (await promise.catch((e: unknown) => e)) as Error;
    expect(ex.message).toMatch(/no rakefile found/i);
  });

  it("load from system rakefile", async () => {
    const systemDir = await rakeSystemDir();

    await app.handleOptions([]);
    app.options.silent = true;
    app.options.loadSystem = true;
    app.options.rakelib = [];
    await app.loadRakefile();

    expect(app.systemDir()).toBe(systemDir);
    expect(app.rakefile).toBeNull();
  });

  it("load from calculated system rakefile", async () => {
    await rakefileDefault();
    vi.spyOn(
      app as unknown as { standardSystemDir(): string },
      "standardSystemDir",
    ).mockReturnValue("__STD_SYS_DIR__");

    setEnv("RAKE_SYSTEM", undefined);

    await app.handleOptions([]);
    app.options.silent = true;
    app.options.loadSystem = true;
    app.options.rakelib = [];
    await app.loadRakefile();

    expect(app.systemDir()).toBe("__STD_SYS_DIR__");
  });

  it("terminal columns", () => {
    const oldRakeColumns = ENV["RAKE_COLUMNS"];

    setEnv("RAKE_COLUMNS", "42");

    try {
      expect(new Application().terminalColumns).toBe(42);
    } finally {
      setEnv("RAKE_COLUMNS", oldRakeColumns);
    }
  });

  it("loading imports", async () => {
    const loader = utilLoader();

    app.addLoader("dummy", loader);
    app.addImport("x.dummy");
    await app.loadImports();
  });

  it("building imported files on demand", async () => {
    const loader = utilLoader();

    app.intern(Task, "x.dummy").enhance(null, () => loader.makeDummy());
    app.addLoader("dummy", loader);
    app.addImport("x.dummy");
    await app.loadImports();
  });

  it("handle options should not strip options from argv", async () => {
    expect(!app.options.trace).toBeTruthy();

    const argv = ["--trace"];
    await app.handleOptions(argv);

    expect(argv).toContain("--trace");
    expect(app.options.trace).toBeTruthy();
  });

  it("handle options trace default is stderr", async () => {
    await app.handleOptions(["--trace"]);

    expect(app.options.traceOutput).toBe(STDERR);
    expect(app.options.trace).toBeTruthy();
  });

  it("handle options trace overrides to stdout", async () => {
    await app.handleOptions(["--trace=stdout"]);

    expect(app.options.traceOutput).toBe(STDOUT);
    expect(app.options.trace).toBeTruthy();
  });

  it("handle options trace does not eat following task names", async () => {
    expect(!app.options.trace).toBeTruthy();

    const argv = ["--trace", "sometask"];
    await app.handleOptions(argv);

    expect(argv.includes("sometask")).toBeTruthy();
    expect(app.options.trace).toBeTruthy();
  });

  it("display exception details", async () => {
    const ex = new RuntimeError("test");
    excSetBacktrace(ex, ["ruby:1:in 'test_display_exception_details'"]);

    const [out, err] = await captureOutput(() => {
      app.setDefaultOptions();
      app.displayErrorMessage(ex);
    });

    expect(out).toBeEmpty();

    expect(err).toMatch("rake aborted!");
    expect(err).toMatch("test_display_exception_details");
  });

  it("display exception details with detailed message", async () => {
    class ErrorClass extends StandardError {
      detailedMessage() {
        return "detailed_message!!";
      }
    }
    const ex = new ErrorClass();
    excSetBacktrace(ex, ["ruby:1:in 'test_display_exception_details_with_detailed_message'"]);

    const [out, err] = await captureOutput(() => {
      app.setDefaultOptions();
      app.displayErrorMessage(ex);
    });

    expect(out).toBeEmpty();

    expect(err).toMatch("rake aborted!");
    expect(err).toMatch("detailed_message!!");
    expect(err).toMatch("test_display_exception_details_with_detailed_message");
  });

  it("display exception details bad encoding", async () => {
    const ex = new RuntimeError("El Niño is coming!");

    const [out, err] = await captureOutput(() => {
      app.setDefaultOptions();
      app.displayErrorMessage(ex);
    });

    expect(out).toBeEmpty();
    expect(err).toMatch("El Niño is coming!");
  });

  it("display exception details cause", async () => {
    const ex = new RuntimeError("cause b", { cause: new RuntimeError("cause a") });

    const [out, err] = await captureOutput(() => {
      app.setDefaultOptions();
      app.displayErrorMessage(ex);
    });

    expect(out).toBeEmpty();

    expect(err).toMatch("Caused by:");
    expect(err).toMatch("cause a");
    expect(err).toMatch("cause b");
  });

  it("display tasks", async () => {
    app.options.showTasks = "tasks";
    app.options.showTaskPattern = /(?:)/;
    app.lastDescription = "COMMENT";
    app.defineTask(Task, "t");
    const [out] = await captureOutput(() => app.displayTasksAndComments());
    expect(out).toMatch(/^rake t/m);
    expect(out).toMatch(/# COMMENT/);
  });

  it("display tasks with long comments", async () => {
    app.terminalColumns = 80;
    app.options.showTasks = "tasks";
    app.options.showTaskPattern = /(?:)/;
    const numbers = "1234567890".repeat(8);
    app.lastDescription = numbers;
    app.defineTask(Task, "t");

    const [out] = await captureOutput(() => app.displayTasksAndComments());

    expect(out).toMatch(/^rake t/m);
    expect(out).toMatch(`# ${numbers.slice(0, 65)}...`);
  });

  it("display tasks with task name wider than tty display", async () => {
    app.terminalColumns = 80;
    app.options.showTasks = "tasks";
    app.options.showTaskPattern = /(?:)/;
    const taskName = "task name".repeat(80);
    app.lastDescription = "something short";
    app.defineTask(Task, taskName);

    const [out] = await captureOutput(() => app.displayTasksAndComments());

    expect(out).toMatch(`rake ${taskName}  # ...`);
  });

  it("display tasks with very long task name to a non tty shows name and comment", async () => {
    app.options.showTasks = "tasks";
    app.options.showTaskPattern = /(?:)/;
    app.ttyOutput = false;
    const taskName = "task name".repeat(80);
    app.lastDescription = "something short";
    app.defineTask(Task, taskName);

    const [out] = await captureOutput(() => app.displayTasksAndComments());

    expect(out).toMatch(`rake ${taskName}  # something short`);
  });

  it("display tasks with long comments to a non tty shows entire comment", async () => {
    app.options.showTasks = "tasks";
    app.options.showTaskPattern = /(?:)/;
    app.ttyOutput = false;
    const comment = "1234567890".repeat(8);
    app.lastDescription = comment;
    app.defineTask(Task, "t");
    const [out] = await captureOutput(() => app.displayTasksAndComments());
    expect(out).toMatch(/^rake t/m);
    expect(out).toMatch(`# ${comment}`);
  });

  it("truncating comments to a non tty", async () => {
    app.terminalColumns = 80;
    app.options.showTasks = "tasks";
    app.options.showTaskPattern = /(?:)/;
    app.ttyOutput = false;
    const numbers = "1234567890".repeat(8);
    app.lastDescription = numbers;
    app.defineTask(Task, "t");

    const [out] = await captureOutput(() => app.displayTasksAndComments());

    expect(out).toMatch(/^rake t/m);
    expect(out).toMatch(`# ${numbers.slice(0, 65)}...`);
  });

  it("describe tasks", async () => {
    app.options.showTasks = "describe";
    app.options.showTaskPattern = /(?:)/;
    app.lastDescription = "COMMENT";
    app.defineTask(Task, "t");
    const [out] = await captureOutput(() => app.displayTasksAndComments());
    expect(out).toMatch(/^rake t$/m);
    expect(out).toMatch(/^ {4}COMMENT$/m);
  });

  it("show lines", async () => {
    app.options.showTasks = "lines";
    app.options.showTaskPattern = /(?:)/;
    app.lastDescription = "COMMENT";
    app.defineTask(Task, "t");
    (await app.get("t")).locations.push("HERE:1");
    const [out] = await captureOutput(() => app.displayTasksAndComments());
    expect(out).toMatch(/^rake t +[^:]+:\d+ *$/m);
  });

  it("windows", () => {
    expect(!(app.isWindows() && app.isUnix())).toBeTruthy();
  });

  it("good run", async () => {
    let ran = false;

    app.options.silent = true;

    app.intern(Task, "default").enhance(null, () => {
      ran = true;
      puts.call($stdout, "DEFAULT");
    });

    await rakefileDefault();
    const [out, err] = await captureOutput(() => app.run(['--rakelib=""']));

    expect(ran).toBeTruthy();
    expect(err).toBeEmpty();
    expect(out).toBe("DEFAULT\n");
  });

  it("display task run", async () => {
    const ran = false;
    app.lastDescription = "COMMENT";
    app.defineTask(Task, "default");
    const [out] = await captureOutput(() => app.run(["-f", "-s", "--tasks", '--rakelib=""']));
    expect(app.options.showTasks).toBeTruthy();
    expect(!ran).toBeTruthy();
    expect(out).toMatch(/rake default/);
    expect(out).toMatch(/# COMMENT/);
  });

  it("display prereqs", async () => {
    const ran = false;
    app.lastDescription = "COMMENT";
    const t = app.defineTask(Task, "default");
    t.enhance(["a", "b"]);
    app.defineTask(Task, "a");
    app.defineTask(Task, "b");
    const [out] = await captureOutput(() => app.run(["-f", "-s", "--prereqs", '--rakelib=""']));
    expect(app.options.showPrereqs).toBeTruthy();
    expect(!ran).toBeTruthy();
    expect(out).toMatch(/rake a$/m);
    expect(out).toMatch(/rake b$/m);
    expect(out).toMatch(/rake default\n( *(a|b)\n){2}/m);
  });

  const fail = () => {
    throw new RuntimeError("unhandled exception");
  };

  it("bad run", async () => {
    app.intern(Task, "default").enhance(null, fail);
    const [, err] = await captureOutput(async () => {
      await expect(app.run(["-f", "-s", '--rakelib=""'])).rejects.toThrow(SystemExit);
    });
    expect(err).toMatch(/see full trace/i);
  });

  it("bad run with trace", async () => {
    app.intern(Task, "default").enhance(null, fail);
    const [, err] = await captureOutput(async () => {
      app.setDefaultOptions();
      await expect(app.run(["-f", "-s", "-t"])).rejects.toThrow(SystemExit);
    });
    expect(err).not.toMatch(/see full trace/i);
  });

  it("bad run with backtrace", async () => {
    app.intern(Task, "default").enhance(null, fail);
    const [, err] = await captureOutput(async () => {
      await expect(app.run(["-f", "-s", "--backtrace"])).rejects.toThrow(SystemExit);
    });
    expect(err).not.toMatch(/see full trace/);
  });

  class CustomError extends RuntimeError {}

  it("bad run includes exception name", async () => {
    app.intern(Task, "default").enhance(null, () => {
      throw new CustomError("intentional");
    });
    const [, err] = await captureOutput(async () => {
      await expect(app.run(["-f", "-s"])).rejects.toThrow(SystemExit);
    });
    expect(err).toMatch(/CustomError: intentional/);
  });

  it("rake error excludes exception name", async () => {
    app.intern(Task, "default").enhance(null, () => {
      throw new RuntimeError("intentional");
    });
    const [, err] = await captureOutput(async () => {
      await expect(app.run(["-f", "-s"])).rejects.toThrow(SystemExit);
    });
    expect(err).not.toMatch(/RuntimeError/);
    expect(err).toMatch(/intentional/);
  });

  it("printing original exception cause", async () => {
    class CustomError extends StandardError {}
    app.intern(Task, "default").enhance(null, () => {
      throw new CustomError("Secondary Error", { cause: new CustomError("Original Error") });
    });
    const [, err] = await captureOutput(async () => {
      await expect(app.run(["-f", "-s"])).rejects.toThrow(SystemExit);
    });
    expect(err).toMatch(/Original Error/);
    expect(err).toMatch(/Secondary Error/);
  });

  it("run with bad options", async () => {
    app.intern(Task, "default").enhance(null, fail);
    await captureOutput(async () => {
      await expect(app.run(["-f", "-s", "--xyzzy"])).rejects.toThrow(SystemExit);
    });
  });

  it("standard exception handling other", async () => {
    const [out, err] = await captureOutput(async () => {
      app.setDefaultOptions();

      const promise = app.standardExceptionHandling(() => {
        throw new RuntimeError("blah");
      });
      await expect(promise).rejects.toThrow(SystemExit);
      const e = (await promise.catch((ex: unknown) => ex)) as SystemExit;

      expect(e.status).toBe(1);
    });

    expect(out).toBeEmpty();
    expect(err).toMatch("rake aborted!\n");
    expect(err).toMatch("blah\n");
  });

  it("standard exception handling invalid option", async () => {
    const [out, err] = await captureOutput(async () => {
      const promise = app.standardExceptionHandling(() => {
        throw new OptionParser.InvalidOption("blah");
      });
      await expect(promise).rejects.toThrow(SystemExit);
      const e = (await promise.catch((ex: unknown) => ex)) as SystemExit;

      expect(e.status).toBe(1);
    });

    expect(out).toBeEmpty();
    expect(err).toBe("invalid option: blah\n");
  });

  it("standard exception handling system exit", async () => {
    const [out, err] = await captureOutput(async () => {
      const promise = app.standardExceptionHandling(() => {
        throw new SystemExit(0);
      });
      await expect(promise).rejects.toThrow(SystemExit);
      const e = (await promise.catch((ex: unknown) => ex)) as SystemExit;

      expect(e.status).toBe(0);
    });

    expect(out).toBeEmpty();
    expect(err).toBeEmpty();
  });

  it("standard exception handling system exit nonzero", async () => {
    const [out, err] = await captureOutput(async () => {
      const promise = app.standardExceptionHandling(() => {
        throw new SystemExit(5);
      });
      await expect(promise).rejects.toThrow(SystemExit);
      const e = (await promise.catch((ex: unknown) => ex)) as SystemExit;

      expect(e.status).toBe(5);
    });

    expect(out).toBeEmpty();
    expect(err).toBeEmpty();
  });
});
