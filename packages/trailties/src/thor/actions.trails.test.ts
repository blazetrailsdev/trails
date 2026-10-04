import { afterEach, describe, expect, it, vi } from "vitest";
import { capture } from "@blazetrails/activesupport";
import { Dir, File, FileUtils, include } from "@blazetrails/ruby-compat";
import { Actions, type ActionsHost } from "./actions.js";
import { Shell } from "./shell.js";
import { Thor } from "./thor.js";

class Counter extends Thor {
  declare static sourcePaths: () => string[];
  static baseclass(): unknown {
    return Counter;
  }
  static {
    include(this, Shell);
    include(this, Actions);
  }
}

type CounterInstance = ActionsHost & { apply(path: string): Promise<void>; foo?: string };

describe("Thor::Actions#apply (trails)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches a URL and calls the module's default export against the instance", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          'export default function (g) { this.foo = "FOO"; g.sayStatus("cool", "padding"); }',
        ),
    );
    vi.stubGlobal("fetch", fetch);
    const r = new Counter([], {}, {}) as unknown as CounterInstance;

    const out = await capture(":stdout", () => r.apply("https://example.com/template.js"));

    expect(fetch).toHaveBeenCalledWith("https://example.com/template.js", {
      headers: { Accept: "application/x-thor-template" },
    });
    expect(r.foo).toBe("FOO");
    expect(out).toMatch(/ {7}apply {2}https:\/\/example.com\/template.js\n/);
    expect(out).toMatch(/cool {4}padding/);
    expect(r.shell.padding).toBe(0);
  });

  it("re-reads a local template on every apply", async () => {
    const dir = Dir.mktmpdir("thor-apply-");
    Counter.sourcePaths().push(dir);
    const file = File.join(dir, "template.mjs");
    const r = new Counter([], {}, {}) as unknown as CounterInstance;
    try {
      File.write(file, 'export default function () { this.foo = "FOO"; }');
      await capture(":stdout", () => r.apply(file));
      File.write(file, 'export default function () { this.foo = "BAR"; }');
      await capture(":stdout", () => r.apply(file));
      expect(r.foo).toBe("BAR");
    } finally {
      FileUtils.rmRf(dir);
    }
  });
});
