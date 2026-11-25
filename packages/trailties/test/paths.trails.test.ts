import { Pathname } from "@blazetrails/ruby-compat";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { File, include, TopLevel, constSet } from "@blazetrails/ruby-compat";
import { BacktraceCleaner } from "../lib/backtrace-cleaner.js";
import { Application } from "../lib/application.js";
import { Engine } from "../lib/engine.js";
import { Root } from "../lib/paths.js";
import {
  Annotation,
  ParserExtractor,
  SourceAnnotationExtractor,
} from "../lib/source-annotation-extractor.js";

describe("Paths remaining surface", () => {
  it("edits a path's list and reads Root's hash surface", async () => {
    const root = new Root(new Pathname("/trails"));
    const path = root.add("app", { glob: "*.{rb,ts}" });
    path.concat(["lib"]);
    path.unshift("vendor");

    expect(path.toAry()).toEqual(["vendor", "app", "lib"]);
    expect(path.extensions()).toEqual(["rb", "ts"]);
    expect(path.absoluteCurrent()).toBe("/trails/app");
    expect(path.last()).toBe("/trails/lib");
    expect(root.keys()).toEqual(["app"]);
    expect(root.valuesAt("app")).toEqual(root.values());
  });
});

describe("BacktraceCleaner", () => {
  it("returns the raw backtrace when BACKTRACE is set", () => {
    const backtrace = ["/gem/a.rb:1"];
    vi.stubEnv("BACKTRACE", "1");
    try {
      expect(new BacktraceCleaner().clean(backtrace)).toBe(backtrace);
      expect(new BacktraceCleaner().cleanFrame("/gem/a.rb:1")).toBe("/gem/a.rb:1");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("ParserExtractor", () => {
  beforeAll(() => SourceAnnotationExtractor.enumerate(null, { dirs: [] }));

  const pattern = /(?:\/\/|\/\*|^\s*\*)\s*(TODO):?\s*(.*?)\s*(?:\*\/)?$/m;

  function annotations(source: string, file: string): Annotation[] {
    const read = vi.spyOn(File, "read").mockReturnValue(source);
    try {
      return new ParserExtractor(pattern).annotations(file);
    } finally {
      read.mockRestore();
    }
  }

  it("skips a // in a multi-line template and a regexp", () => {
    expect(
      annotations("const x = `a\n// TODO: no`;\nconst y = /\\/\\/ TODO: no/;\n", "a.ts"),
    ).toEqual([]);
  });

  it("reads comments and skips a // inside a string", () => {
    expect(annotations('const url = "http://x // TODO: no";\ny(); // TODO: yes\n', "a.ts")).toEqual(
      [new Annotation(2, "TODO", "yes")],
    );
  });

  it("reads block comments and skips JSX text", () => {
    const source = "/* TODO: one */\n/**\n * TODO: two\n */\nconst a = <p>// TODO: no</p>;\n";
    expect(annotations(source, "a.tsx")).toEqual([
      new Annotation(1, "TODO", "one"),
      new Annotation(2, "TODO", "two"),
    ]);
  });

  it("reads CRLF block comments and ignores a * inside a line comment", () => {
    expect(annotations("/*\r\n * TODO: one\r\n */\r\n// 2 * TODO no\r\n", "a.ts")).toEqual([
      new Annotation(1, "TODO", "one"),
    ]);
  });

  it("reports an error on an unterminated string", () => {
    expect(annotations('// TODO: x\nconst a = "b\n', "a.ts")).toEqual([]);
  });
});

describe("Annotation", () => {
  it("falls back to the regexp without typescript", async () => {
    vi.resetModules();
    vi.doMock("@blazetrails/ruby-compat", async (importOriginal) => {
      const original = await importOriginal<typeof import("@blazetrails/ruby-compat")>();
      return {
        ...original,
        rbFRequire: async (_loadPath: unknown, feature: string) => {
          throw new original.LoadError(`cannot load such file -- ${feature}`);
        },
      };
    });
    try {
      const { Annotation: Fallback, SourceAnnotationExtractor: Extractor } =
        await import("../lib/source-annotation-extractor.js");
      await Extractor.enumerate(null, { dirs: [] });
      const extension = [...Fallback.extensions].find(([regexp]) =>
        new RegExp(regexp).test("a.ts"),
      )!;
      expect(extension[1]("TODO")).toBeInstanceOf(RegExp);
    } finally {
      vi.doUnmock("@blazetrails/ruby-compat");
      vi.resetModules();
    }
  });

  it("registers a ParserExtractor for ts files", async () => {
    await SourceAnnotationExtractor.enumerate(null, { dirs: [] });
    const extension = [...Annotation.extensions].find(([regexp]) =>
      new RegExp(regexp).test("a.tsx"),
    )!;
    expect(extension[1]("TODO")).toBeInstanceOf(ParserExtractor);
  });
});

describe("Engine#helpers", () => {
  it("answers a memoized module, read from config.helpersPaths on an Application", async () => {
    class HelpersApp extends Application {}
    const app = new HelpersApp();
    const paths = await app.helpersPaths();
    expect(paths).toBe(app.config.helpersPaths);
    const helpers = await app.helpers();
    expect(await app.helpers()).toBe(helpers);
    (app as unknown as { _helpers?: object })._helpers = undefined;
    app.config.helpersPaths.push(`${import.meta.dirname}/fixtures/helpers`);
    constSet(TopLevel, "ShoutHelper", { shout: () => "HEY" });
    class Includer {}
    include(Includer, await app.helpers());
    expect((new Includer() as unknown as { shout(): string }).shout()).toBe("HEY");
    expect(app).toBeInstanceOf(Engine);
  });
});
