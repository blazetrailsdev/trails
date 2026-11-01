import { describe, expect, it, vi } from "vitest";
import { BacktraceCleaner } from "./backtrace-cleaner.js";
import { Application } from "./application.js";
import { Engine } from "./engine.js";
import { Root } from "./paths.js";
import { Annotation, Parser } from "./source-annotation-extractor.js";

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
  it("skips a # in a multi-line string and stops at __END__", () => {
    const parser = new Parser('x = "a\n# TODO: no"\n__END__\n# TODO: data\n', {
      pattern: /#\s*(TODO):?\s*(.*)$/,
    });
    parser.parse();
    expect(parser.comments).toEqual([]);
    expect(parser.isError()).toBe(false);
  });

  it("reads comments and skips a # inside a string", () => {
    const parser = new Parser('x = "# TODO: no"\ny # TODO: yes\n', {
      pattern: /#\s*(TODO):?\s*(.*)$/,
    });
    parser.parse();
    expect(parser.comments).toEqual([new Annotation(2, "TODO", "yes")]);
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
    expect(app).toBeInstanceOf(Engine);
  });
});
