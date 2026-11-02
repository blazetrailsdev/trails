import { describe, expect, it, vi } from "vitest";
import { include, registerConstant } from "@blazetrails/ruby-compat";
import { BacktraceCleaner } from "./backtrace-cleaner.js";
import { Application } from "./application.js";
import { Engine } from "./engine.js";
import { Root } from "./paths.js";
import { Annotation, Parser, ParserExtractor } from "./source-annotation-extractor.js";

describe("Paths remaining surface", () => {
  it("edits a path's list and reads Root's hash surface", async () => {
    const root = new Root("/rails");
    const path = root.add("app", { glob: "*.{rb,ts}" });
    path.concat(["lib"]);
    path.unshift("vendor");

    expect(path.toAry()).toEqual(["vendor", "app", "lib"]);
    expect(path.extensions()).toEqual(["rb", "ts"]);
    expect(path.absoluteCurrent()).toBe("/rails/app");
    expect(await path.last()).toBe("/rails/lib");
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

describe("Parser", () => {
  const pattern = /(?:\/\/|\/\*|^\s*\*)\s*(TODO):?\s*(.*?)\s*(?:\*\/)?$/;

  it("skips a // in a multi-line template and a regexp", () => {
    const parser = new Parser("const x = `a\n// TODO: no`;\nconst y = /\\/\\/ TODO: no/;\n", {
      pattern,
      file: "a.ts",
    });
    parser.parse();
    expect(parser.comments).toEqual([]);
    expect(parser.isError()).toBe(false);
  });

  it("reads comments and skips a // inside a string", () => {
    const parser = new Parser('const url = "http://x // TODO: no";\ny(); // TODO: yes\n', {
      pattern,
      file: "a.ts",
    });
    parser.parse();
    expect(parser.comments).toEqual([new Annotation(2, "TODO", "yes")]);
  });

  it("reads block comments and skips JSX text", () => {
    const source = "/* TODO: one */\n/**\n * TODO: two\n */\nconst a = <p>// TODO: no</p>;\n";
    const parser = new Parser(source, { pattern, file: "a.tsx" });
    parser.parse();
    expect(parser.comments).toEqual([
      new Annotation(1, "TODO", "one"),
      new Annotation(3, "TODO", "two"),
    ]);
  });

  it("reads CRLF block comments and ignores a * inside a line comment", () => {
    const parser = new Parser("/*\r\n * TODO: one\r\n */\r\n// 2 * TODO no\r\n", {
      pattern,
      file: "a.ts",
    });
    parser.parse();
    expect(parser.comments).toEqual([new Annotation(2, "TODO", "one")]);
  });

  it("reports an error on an unterminated string", () => {
    const parser = new Parser('// TODO: x\nconst a = "b\n', { pattern, file: "a.ts" });
    parser.parse();
    expect(parser.isError()).toBe(true);
  });
});

describe("Annotation", () => {
  it("falls back to the regexp without typescript", async () => {
    const missing = () => {
      throw new Error("missing");
    };
    vi.resetModules();
    vi.doMock("typescript/unstable/sync", missing);
    try {
      const { Annotation: Fallback } = await import("./source-annotation-extractor.js");
      const extension = Fallback.extensions.find((e) => e.test.test("a.ts"))!;
      expect(extension.builder("TODO")).toBeInstanceOf(RegExp);
    } finally {
      vi.doUnmock("typescript/unstable/sync");
      vi.resetModules();
    }
  });

  it("registers a ParserExtractor for ts files", () => {
    const extension = Annotation.extensions.find((e) => e.test.test("a.tsx"))!;
    expect(extension.builder("TODO")).toBeInstanceOf(ParserExtractor);
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
    app.config.helpersPaths.push(`${import.meta.dirname}/__fixtures__/helpers`);
    registerConstant("ShoutHelper", { shout: () => "HEY" });
    class Includer {}
    include(Includer, await app.helpers());
    expect((new Includer() as unknown as { shout(): string }).shout()).toBe("HEY");
    expect(app).toBeInstanceOf(Engine);
  });
});
