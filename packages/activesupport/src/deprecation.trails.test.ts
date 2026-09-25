import { beforeEach, describe, it, expect, vi } from "vitest";
import { Thread, stderr } from "@blazetrails/ruby-compat";
import { Deprecation, DeprecationException, callerLocations } from "./deprecation.js";
import type { CallerLocation } from "./deprecation.js";
import { deprecator } from "./deprecator.js";

describe("Deprecation#allow (trails)", () => {
  it("scopes the allow-list to one logical task", async () => {
    const dep = new Deprecation("2.0", "Test");
    dep.behavior = [];
    dep.disallowedWarnings = ":all";

    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const inside = new Thread(() =>
      dep.allow(":all", {}, async () => {
        await held;
        dep.warn("allowed inside the block");
      }),
    ).value();

    expect(() => dep.warn("disallowed outside the block")).toThrow(DeprecationException);

    release();
    await inside;
  });
});

describe("DeprecationTest", () => {
  let dep: Deprecation;

  beforeEach(() => {
    dep = new Deprecation();
  });

  it(":stderr behavior writes to stderr", () => {
    dep.behavior = "stderr";
    const spy = vi.spyOn(stderr, "write").mockImplementation(() => true);
    dep.warn("fubar");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("fubar"));
    spy.mockRestore();
  });

  it("silenced=true suppresses all warnings", () => {
    dep.silenced = true;
    const spy = vi.spyOn(stderr, "write").mockImplementation(() => true);
    dep.warn("should be silent");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("deprecateMethod wraps method with warning", () => {
    const spy = vi.spyOn(stderr, "write").mockImplementation(() => true);
    const obj = { greet: () => "hello" };
    dep.behavior = "stderr";
    dep.deprecateMethod(obj, "greet", "greet is deprecated");
    const result = obj.greet();
    expect(result).toBe("hello");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("greet is deprecated"));
    spy.mockRestore();
  });

  it("behavior as function callback", () => {
    const messages: string[] = [];
    dep.behavior = (msg: unknown) => {
      messages.push(String(msg));
    };
    dep.warn("fubar");
    expect(messages.some((m) => m.includes("fubar"))).toBe(true);
  });

  it("behavior as array of behaviors", () => {
    const spy = vi.spyOn(stderr, "write").mockImplementation(() => true);
    dep.behavior = ["stderr", "silence"];
    dep.warn("multi");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("warn with no message produces default message", () => {
    const spy = vi.spyOn(stderr, "write").mockImplementation(() => true);
    dep.warn();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("DEPRECATION WARNING"));
    spy.mockRestore();
  });

  it("deprecator singleton is a Deprecation instance", () => {
    expect(deprecator()).toBeInstanceOf(Deprecation);
  });

  it("gem option stored on instance", () => {
    const d = new Deprecation("8.1", "MyGem");
    expect(d.gemName).toBe("MyGem");
  });

  it("horizon option stored on instance", () => {
    const d = new Deprecation("3.0");
    expect(d.deprecationHorizon).toBe("3.0");
  });

  it("silenced option in constructor", () => {
    const d = new Deprecation();
    d.silenced = true;
    expect(d.silenced).toBe(true);
  });
});

describe("callerLocations (trails)", () => {
  it("leaves absolutePath nil for an eval-compiled frame, as Ruby's absolute_path is", () => {
    const generated = (0, eval)(
      `(callerLocations) => function generated() { return callerLocations(0, 1); }
//# sourceURL=/path/to/template.html.tse`,
    )(callerLocations) as () => CallerLocation[];
    const [frame] = generated();
    expect(frame.path).toEqual("/path/to/template.html.tse");
    expect(frame.absolutePath).toBeUndefined();
    expect(callerLocations(0, 1)[0].absolutePath).toEqual(new URL(import.meta.url).pathname);
  });
});
