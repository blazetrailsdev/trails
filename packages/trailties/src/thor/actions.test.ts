import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Dir,
  File,
  FileUtils,
  getChildProcess,
  getPath,
  include,
  isEmpty,
  setExitCode,
  stdout,
  SystemExit,
} from "@blazetrails/ruby-compat";
import { Actions, type ActionsHost } from "./actions.js";
import { Thor } from "./thor.js";
import { Group, type GroupClass } from "./group.js";
import * as Util from "./util.js";

vi.mock("./util.js", async (importOriginal) => ({ ...(await importOriginal<typeof Util>()) }));

let fixtures: string;
let destinationRoot: string;

type CounterInstance = ActionsHost & {
  apply(path: string, config?: { verbose?: unknown }): Promise<void>;
  foo?: string;
  inRoot<T>(block: () => T | Promise<T>): Promise<T>;
  relativeToOriginalDestinationRoot(path: string, removeDot?: boolean): string;
  runRubyScript(command: unknown, config?: Record<string, unknown>): Promise<unknown>;
  thor(command: unknown, ...args: unknown[]): Promise<unknown>;
};
type ActionsClass = Pick<GroupClass, "argument" | "removeArgument" | "classOptions"> & {
  addRuntimeOptionsBang(): void;
  sourcePaths(): string[];
  sourceRoot(path?: string): Promise<string | null>;
  sourcePathsForSearch(): Promise<string[]>;
} & (new (...args: unknown[]) => CounterInstance);
const MyCounter = class MyCounter extends Group {
  static {
    const klass = this as unknown as ActionsClass;
    include(this, Actions);
    klass.addRuntimeOptionsBang();
    klass.argument("first", { type: "numeric" });
    klass.argument("second", { type: "numeric", default: 2 });
  }
  static isExitOnFailure(): boolean {
    return false;
  }
} as unknown as ActionsClass;
const ClearCounter = class ClearCounter extends (MyCounter as unknown as typeof Group) {
  static {
    (this as unknown as ActionsClass).removeArgument("first", "second", { undefine: true });
  }
  static async sourceRoot(): Promise<string> {
    return File.expandPath(File.join(fixtures, "bundle"));
  }
} as unknown as ActionsClass;
class A extends Thor {
  static {
    include(this, Actions);
  }
}

function assertEmpty(obj: string): void {
  if (!isEmpty(obj)) throw new globalThis.Error(`Expected ${JSON.stringify(obj)} to be empty.`);
}

async function capture(_stream: string, block: () => unknown): Promise<string> {
  let result = "";
  const write = stdout.write;
  (stdout as { write: typeof write }).write = (chunk) => {
    result += chunk;
    return true;
  };
  try {
    await block();
  } finally {
    (stdout as { write: typeof write }).write = write;
  }
  return result;
}

beforeAll(async () => {
  fixtures = Dir.mktmpdir("thor-fixtures-");
  destinationRoot = Dir.mktmpdir("thor-sandbox-");
  for (const dir of ["doc", "bundle", "broken"]) FileUtils.mkdirP(File.join(fixtures, dir));
  File.write(File.join(fixtures, "doc", "README"), "");
  await MyCounter.sourceRoot(fixtures);
  MyCounter.sourcePaths().push(File.expandPath("broken", fixtures));
  ClearCounter.sourcePaths().unshift(File.expandPath(File.join(fixtures, "doc")));
});
afterAll(() => {
  FileUtils.rmRf(fixtures);
  FileUtils.rmRf(destinationRoot);
});

describe("Thor::Actions", () => {
  const counter = (options: Record<string, unknown> = {}) =>
    new MyCounter([1], options, { destinationRoot });
  const file = () => File.join(destinationRoot, "foo");

  describe("on include", () => {
    it("adds runtime options to the base class", () => {
      expect(Object.keys(MyCounter.classOptions())).toContain("pretend");
      expect(Object.keys(MyCounter.classOptions())).toContain("force");
      expect(Object.keys(MyCounter.classOptions())).toContain("quiet");
      expect(Object.keys(MyCounter.classOptions())).toContain("skip");
    });
  });

  describe("#initialize", () => {
    it("has default behavior invoke", () => {
      expect(counter().behavior).toBe("invoke");
    });

    it("can have behavior revoke", () => {
      expect(new MyCounter([1], {}, { behavior: "revoke" }).behavior).toBe("revoke");
    });

    it("when behavior is set to force, overwrite options", () => {
      const runner = new MyCounter([1], { force: false, skip: true }, { behavior: "force" });
      expect(runner.behavior).toBe("invoke");
      expect(runner.options["force"]).toBe(true);
      expect(runner.options["skip"]).not.toBe(true);
    });

    it("when behavior is set to skip, overwrite options", () => {
      const runner = new MyCounter([1], ["--force"], { behavior: "skip" });
      expect(runner.behavior).toBe("invoke");
      expect(runner.options["force"]).not.toBe(true);
      expect(runner.options["skip"]).toBe(true);
    });
  });

  describe("accessors", () => {
    describe("#destination_root=", () => {
      it("gets the current directory and expands the path to set the root", () => {
        const base = new MyCounter([1]);
        base.destinationRoot = "here";
        expect(base.destinationRoot).toBe(File.expandPath(File.join(Dir.pwd(), "here")));
      });

      it("does not use the current directory if one is given", () => {
        const root = File.expandPath("/");
        const base = new MyCounter([1]);
        base.destinationRoot = root;
        expect(base.destinationRoot).toBe(root);
      });

      it("uses the current directory if none is given", () => {
        const base = new MyCounter([1]);
        expect(base.destinationRoot).toBe(File.expandPath(Dir.pwd()));
      });
    });

    describe("#relative_to_original_destination_root", () => {
      it("returns the path relative to the absolute root", () => {
        expect(counter().relativeToOriginalDestinationRoot(file())).toBe("foo");
      });

      it("does not remove dot if required", () => {
        expect(counter().relativeToOriginalDestinationRoot(file(), false)).toBe("./foo");
      });

      it("always use the absolute root", async () => {
        const r = counter();
        await r.inside("foo", {}, () => {
          expect(r.relativeToOriginalDestinationRoot(file())).toBe("foo");
        });
      });

      it("creates proper relative paths for absolute file location", () => {
        expect(counter().relativeToOriginalDestinationRoot("/test/file")).toBe("/test/file");
      });

      it("doesn't remove the root path from the absolute path if it is not at the beginning", () => {
        const r = counter();
        r.destinationRoot = "/app";
        expect(r.relativeToOriginalDestinationRoot("/something/app/project")).toBe(
          "/something/app/project",
        );
      });

      describe("#source_paths_for_search", () => {
        it("add source_root to source_paths_for_search", async () => {
          expect(await MyCounter.sourcePathsForSearch()).toContain(fixtures);
        });

        it("keeps only current source root in source paths", async () => {
          expect(await ClearCounter.sourcePathsForSearch()).toContain(
            File.join(fixtures, "bundle"),
          );
          expect(await ClearCounter.sourcePathsForSearch()).not.toContain(fixtures);
        });

        it("customized source paths should be before source roots", async () => {
          expect((await ClearCounter.sourcePathsForSearch())[0]).toBe(File.join(fixtures, "doc"));
          expect((await ClearCounter.sourcePathsForSearch())[1]).toBe(
            File.join(fixtures, "bundle"),
          );
        });

        it("keeps inherited source paths at the end", async () => {
          expect((await ClearCounter.sourcePathsForSearch()).at(-1)).toBe(
            File.join(fixtures, "broken"),
          );
        });
      });
    });

    describe("#find_in_source_paths", () => {
      it("raises an error if source path is empty", async () => {
        await expect(
          (new A() as unknown as CounterInstance).findInSourcePaths("foo"),
        ).rejects.toThrow(/Currently you have no source paths/);
      });

      it("finds a template inside the source path", async () => {
        const r = counter();
        expect(await r.findInSourcePaths("doc")).toBe(File.expandPath("doc", fixtures));
        await expect(r.findInSourcePaths("README")).rejects.toThrow(
          /Could not find "README" in any of your source paths./,
        );

        const newPath = File.join(fixtures, "doc");
        r._sourcePaths = undefined;
        (await r.sourcePaths()).unshift(newPath);
        expect(await r.findInSourcePaths("README")).toBe(File.expandPath("README", newPath));
      });
    });
  });

  describe("#inside", () => {
    it("executes the block inside the given folder", async () => {
      await counter().inside("foo", {}, () => {
        expect(Dir.pwd()).toBe(file());
      });
    });

    it("changes the base root", async () => {
      const r = counter();
      await r.inside("foo", {}, () => {
        expect(r.destinationRoot).toBe(file());
      });
    });

    it("creates the directory if it does not exist", async () => {
      await counter().inside("foo", {}, () => {
        expect(File.isExist(file())).toBe(true);
      });
    });

    it("returns the value yielded by the block", async () => {
      expect(await counter().inside("foo", {}, () => 123)).toBe(123);
    });

    describe("when pretending", () => {
      it("no directories should be created", async () => {
        await counter({ pretend: true }).inside("bar", {}, () => {});
        expect(File.isExist(File.join(destinationRoot, "bar"))).toBe(false);
      });

      it("returns the value yielded by the block", async () => {
        expect(await counter().inside("foo", {}, () => 123)).toBe(123);
      });
    });

    describe("when verbose", () => {
      it("logs status", async () => {
        const r = counter();
        expect(
          await capture(":stdout", () => r.inside("foo", { verbose: true }, () => {})),
        ).toMatch(/inside {2}foo/);
      });

      it("uses padding in next status", async () => {
        const r = counter();
        expect(
          await capture(":stdout", () =>
            r.inside("foo", { verbose: true }, () => {
              r.sayStatus("cool", "padding");
            }),
          ),
        ).toMatch(/cool {4}padding/);
      });

      it("removes padding after block", async () => {
        const r = counter();
        expect(
          await capture(":stdout", async () => {
            await r.inside("foo", { verbose: true }, () => {});
            r.sayStatus("no", "padding");
          }),
        ).toMatch(/no {2}padding/);
      });
    });
  });

  describe("#in_root", () => {
    it("executes the block in the root folder", async () => {
      const r = counter();
      await r.inside("foo", {}, () =>
        r.inRoot(() => {
          expect(Dir.pwd()).toBe(destinationRoot);
        }),
      );
    });

    it("changes the base root", async () => {
      const r = counter();
      await r.inside("foo", {}, () =>
        r.inRoot(() => {
          expect(r.destinationRoot).toBe(destinationRoot);
        }),
      );
    });

    it("returns to the previous state", async () => {
      const r = counter();
      await r.inside("foo", {}, async () => {
        await r.inRoot(() => {});
        expect(r.destinationRoot).toBe(file());
      });
    });
  });

  describe("#apply", () => {
    let template: string;
    let file: string;

    beforeAll(() => {
      (MyCounter as unknown as { sourcePaths(): string[] }).sourcePaths().push(fixtures);
      template =
        'export default function (g) { this.foo = "FOO"; g.sayStatus("cool", "padding"); }\n';
      file = File.join(fixtures, "template.mjs");
      File.write(file, template);
    });

    const action = (r: CounterInstance, ...args: Parameters<CounterInstance["apply"]>) =>
      capture(":stdout", () => r.apply(...args));

    it("accepts a URL as the path", async () => {
      file = "http://gist.github.com/103208.txt";
      const r = counter();
      const apply = vi.spyOn(r, "apply").mockResolvedValue(undefined);
      await action(r, file);
      expect(apply).toHaveBeenCalledWith(file);
      file = File.join(fixtures, "template.mjs");
    });

    it("accepts a secure URL as the path", async () => {
      file = "https://gist.github.com/103208.txt";
      const r = counter();
      const apply = vi.spyOn(r, "apply").mockResolvedValue(undefined);
      await action(r, file);
      expect(apply).toHaveBeenCalledWith(file);
      file = File.join(fixtures, "template.mjs");
    });

    it("accepts a local file path with spaces", async () => {
      const spaced = File.join(fixtures, "path with spaces.mjs");
      File.write(spaced, template);
      const open = vi.spyOn(getPath() as Required<ReturnType<typeof getPath>>, "pathToFileURL");
      await action(counter(), spaced);
      expect(open).toHaveBeenCalledWith(spaced);
      open.mockRestore();
    });

    it("opens a file and executes its content in the instance binding", async () => {
      const r = counter();
      await action(r, file);
      expect(r.foo).toBe("FOO");
    });

    it("applies padding to the content inside the file", async () => {
      expect(await action(counter(), file)).toMatch(/cool {4}padding/);
    });

    it("logs its status", async () => {
      expect(await action(counter(), file)).toMatch(new RegExp(` {7}apply {2}${file}\n`));
    });

    it("does not log status", async () => {
      const content = await action(counter(), file, { verbose: false });
      expect(content).toMatch(/cool {2}padding/);
      expect(content).not.toMatch(/apply http/);
    });
  });

  type Adapter = Required<ReturnType<typeof getChildProcess>>;
  const receiveSystem = () =>
    vi
      .spyOn(getChildProcess() as Adapter, "system")
      .mockResolvedValue({ pid: 1, status: 0, signal: null });

  describe("#run", () => {
    const action = (r: CounterInstance, ...args: Parameters<CounterInstance["run"]>) =>
      capture(":stdout", () => r.run(...args));

    afterEach(() => {
      vi.restoreAllMocks();
      setExitCode(0);
    });

    describe("when not pretending", () => {
      let system: ReturnType<typeof receiveSystem>;
      beforeEach(() => {
        system = receiveSystem();
      });
      afterEach(() => {
        expect(system).toHaveBeenCalledWith("ls", expect.anything(), null, {});
      });

      it("executes the command given", async () => {
        await action(counter(), "ls");
      });

      it("logs status", async () => {
        expect(await action(counter(), "ls")).toBe('         run  ls from "."\n');
      });

      it("does not log status if required", async () => {
        assertEmpty(await action(counter(), "ls", { verbose: false }));
      });

      it("accepts a color as status", async () => {
        const r = counter();
        const sayStatus = vi.spyOn(r.shell, "sayStatus").mockImplementation(() => {});
        await action(r, "ls", { verbose: ":yellow" });
        expect(sayStatus).toHaveBeenCalledWith("run", 'ls from "."', ":yellow");
      });
    });

    describe("when pretending", () => {
      it("doesn't execute the command", async () => {
        const r = new MyCounter([1], ["--pretend"], {
          destinationRoot,
        });
        const system = receiveSystem();
        await r.run("ls", { verbose: false });
        expect(system).not.toHaveBeenCalled();
      });
    });

    describe("when not capturing", () => {
      it("aborts when abort_on_failure is given and command fails", async () => {
        await expect(action(counter(), "false", { abortOnFailure: true })).rejects.toThrow(
          SystemExit,
        );
      });

      it("succeeds when abort_on_failure is given and command succeeds", async () => {
        await expect(action(counter(), "true", { abortOnFailure: true })).resolves.not.toThrow();
      });

      it("supports env option", async () => {
        const system = vi.spyOn(getChildProcess() as Adapter, "system");
        await action(counter(), "echo $BAR", { env: { BAR: "foo" } });
        expect(system).toHaveBeenCalledWith(
          "echo $BAR",
          expect.objectContaining({ BAR: "foo" }),
          null,
          {},
        );
      });
    });

    describe("when capturing", () => {
      it("aborts when abort_on_failure is given, capture is given and command fails", async () => {
        await expect(
          action(counter(), "false", { abortOnFailure: true, capture: true }),
        ).rejects.toThrow(SystemExit);
      });

      it("succeeds when abort_on_failure is given and command succeeds", async () => {
        await expect(
          action(counter(), "true", { abortOnFailure: true, capture: true }),
        ).resolves.not.toThrow();
      });

      it("supports env option", async () => {
        await capture(":stdout", async () => {
          expect(await counter().run("echo $BAR", { env: { BAR: "foo" }, capture: true })).toBe(
            "foo\n",
          );
        });
      });
    });

    describe("exit_on_failure? is true", () => {
      beforeEach(() => {
        vi.spyOn(
          MyCounter as unknown as { isExitOnFailure(): boolean },
          "isExitOnFailure",
        ).mockReturnValue(true);
      });

      it("aborts when command fails even if abort_on_failure is not given", async () => {
        await expect(action(counter(), "false")).rejects.toThrow(SystemExit);
      });

      it("does not abort when abort_on_failure is false even if the command fails", async () => {
        await expect(action(counter(), "false", { abortOnFailure: false })).resolves.not.toThrow();
      });
    });
  });

  describe("#run_ruby_script", () => {
    let system: ReturnType<typeof receiveSystem>;
    const action = (r: CounterInstance, ...args: Parameters<CounterInstance["runRubyScript"]>) =>
      capture(":stdout", () => r.runRubyScript(...args));

    beforeEach(() => {
      vi.spyOn(Util, "rubyCommand").mockReturnValue("/opt/jruby");
      system = receiveSystem();
    });
    afterEach(() => {
      expect(system).toHaveBeenCalledWith("/opt/jruby script.rb", expect.anything(), null, {});
      vi.restoreAllMocks();
    });

    it("executes the ruby script", async () => {
      await action(counter(), "script.rb");
    });

    it("logs status", async () => {
      expect(await action(counter(), "script.rb")).toBe('         run  jruby script.rb from "."\n');
    });

    it("does not log status if required", async () => {
      assertEmpty(await action(counter(), "script.rb", { verbose: false }));
    });
  });

  describe("#thor", () => {
    const action = (r: CounterInstance, ...args: Parameters<CounterInstance["thor"]>) =>
      capture(":stdout", () => r.thor(...args));

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("executes the thor command", async () => {
      const system = receiveSystem();
      await action(counter(), "list", { verbose: true });
      expect(system).toHaveBeenCalledWith("thor list", expect.anything(), null, {});
    });

    it("converts extra arguments to command arguments", async () => {
      const system = receiveSystem();
      await action(counter(), "list", "foo", "bar");
      expect(system).toHaveBeenCalledWith("thor list foo bar", expect.anything(), null, {});
    });

    it("converts options hash to switches", async () => {
      const system = receiveSystem();
      await action(counter(), "list", "foo", "bar", { foo: true });
      expect(system).toHaveBeenCalledWith("thor list foo bar --foo", expect.anything(), null, {});

      system.mockClear();
      await action(counter(), "list", { foo: [1, 2, 3] });
      expect(system).toHaveBeenCalledWith("thor list --foo 1 2 3", expect.anything(), null, {});
    });

    it("logs status", async () => {
      const system = receiveSystem();
      expect(await action(counter(), "list")).toBe('         run  thor list from "."\n');
      expect(system).toHaveBeenCalledWith("thor list", expect.anything(), null, {});
    });

    it("does not log status if required", async () => {
      const system = receiveSystem();
      assertEmpty(await action(counter(), "list", { foo: [1, 2, 3], verbose: false }));
      expect(system).toHaveBeenCalledWith("thor list --foo 1 2 3", expect.anything(), null, {});
    });

    it("captures the output when :capture is given", async () => {
      const r = counter();
      const run = vi.spyOn(r, "run").mockResolvedValue(undefined);
      await action(r, "list", { capture: true });
      expect(run).toHaveBeenCalledWith("list", expect.objectContaining({ capture: true }));
    });
  });
});
