import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Dir,
  File,
  OptionParser,
  RuntimeError,
  STDERR,
  STDOUT,
  SystemExit,
  env as ENV,
  setEnv,
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
