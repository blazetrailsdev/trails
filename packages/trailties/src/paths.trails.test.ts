import { describe, expect, it } from "vitest";
import { env } from "@blazetrails/ruby-compat";
import { BacktraceCleaner } from "./backtrace-cleaner.js";
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
    env.BACKTRACE = "1";
    try {
      expect(new BacktraceCleaner().clean(backtrace)).toBe(backtrace);
      expect(new BacktraceCleaner().cleanFrame("/gem/a.rb:1")).toBe("/gem/a.rb:1");
    } finally {
      delete env.BACKTRACE;
    }
  });
});

describe("Parser", () => {
  it("reads comments and skips a # inside a string", () => {
    const parser = new Parser('x = "# TODO: no"\ny # TODO: yes\n', {
      pattern: /#\s*(TODO):?\s*(.*)$/,
    });
    parser.parse();
    expect(parser.comments).toEqual([new Annotation(2, "TODO", "yes")]);
  });
});
