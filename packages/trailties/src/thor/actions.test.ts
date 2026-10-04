import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertRaises, capture } from "@blazetrails/activesupport";
import { Dir, File, FileUtils, include } from "@blazetrails/ruby-compat";
import { Actions, type ActionsHost } from "./actions.js";
import { Shell } from "./shell.js";
import { Thor } from "./thor.js";
import { GeneratorBase } from "../generators/base.js";
import { Error as ThorError } from "./error.js";

let fixtures: string;
let destinationRoot: string;

class MyCounter extends GeneratorBase {}
class ClearCounter extends MyCounter {
  static override async sourceRoot(): Promise<string> {
    return File.expandPath(File.join(fixtures, "bundle"));
  }
}
class A extends GeneratorBase {}

type CounterInstance = ActionsHost & {
  inRoot<T>(block: () => T | Promise<T>): Promise<T>;
  relativeToOriginalDestinationRoot(path: string, removeDot?: boolean): string;
};
class Counter extends Thor {
  declare static addRuntimeOptionsBang: () => void;
  static baseclass(): unknown {
    return Counter;
  }
  declare static classOptions: () => Record<string, unknown>;
  static {
    include(this, Shell);
    include(this, Actions);
    this.addRuntimeOptionsBang();
  }
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
  const runner = () => new MyCounter({ cwd: destinationRoot, output: () => {} });

  const counter = (options: Record<string, unknown> = {}) =>
    new Counter([1], options, { destinationRoot }) as unknown as CounterInstance;
  const file = () => File.join(destinationRoot, "foo");

  describe("on include", () => {
    it("adds runtime options to the base class", () => {
      expect(Object.keys(Counter.classOptions())).toContain("pretend");
      expect(Object.keys(Counter.classOptions())).toContain("force");
      expect(Object.keys(Counter.classOptions())).toContain("quiet");
      expect(Object.keys(Counter.classOptions())).toContain("skip");
    });
  });

  describe("#initialize", () => {
    it("has default behavior invoke", () => {
      expect(counter().behavior).toBe("invoke");
    });

    it("can have behavior revoke", () => {
      expect(
        (new Counter([1], {}, { behavior: "revoke" }) as unknown as CounterInstance).behavior,
      ).toBe("revoke");
    });

    it("when behavior is set to force, overwrite options", () => {
      const runner = new Counter([1], { force: false, skip: true }, { behavior: "force" });
      expect((runner as unknown as CounterInstance).behavior).toBe("invoke");
      expect((runner as unknown as CounterInstance).options["force"]).toBe(true);
      expect((runner as unknown as CounterInstance).options["skip"]).not.toBe(true);
    });

    it("when behavior is set to skip, overwrite options", () => {
      const runner = new Counter([1], ["--force"], { behavior: "skip" });
      expect((runner as unknown as CounterInstance).behavior).toBe("invoke");
      expect((runner as unknown as CounterInstance).options["force"]).not.toBe(true);
      expect((runner as unknown as CounterInstance).options["skip"]).toBe(true);
    });
  });

  describe("accessors", () => {
    describe("#destination_root=", () => {
      it("gets the current directory and expands the path to set the root", () => {
        const base = new Counter([1]) as unknown as CounterInstance;
        base.destinationRoot = "here";
        expect(base.destinationRoot).toBe(File.expandPath(File.join(Dir.pwd(), "here")));
      });

      it("does not use the current directory if one is given", () => {
        const root = File.expandPath("/");
        const base = new Counter([1]) as unknown as CounterInstance;
        base.destinationRoot = root;
        expect(base.destinationRoot).toBe(root);
      });

      it("uses the current directory if none is given", () => {
        const base = new Counter([1]) as unknown as CounterInstance;
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
        await assertRaises([ThorError], { match: /Currently you have no source paths/ }, () =>
          new A({ cwd: destinationRoot, output: () => {} }).findInSourcePaths("foo"),
        );
      });

      it("finds a template inside the source path", async () => {
        const r = runner();
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
});
