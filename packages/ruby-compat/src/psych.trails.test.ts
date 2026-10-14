import { beforeEach, describe, it, expect, vi } from "vitest";
import type { ArgumentError as ArgumentErrorClass } from "./argument-error.js";
import type { Psych as PsychModule } from "./psych.js";

describe("Psych with Date, DateTime and Time unseated", () => {
  let Psych: typeof PsychModule;
  let ArgumentError: typeof ArgumentErrorClass;

  // `ClassLoader::CACHE` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/class_loader.rb:58-65`)
  beforeEach(async () => {
    vi.resetModules();
    ({ Psych } = await import("./psych.js"));
    ({ ArgumentError } = await import("./argument-error.js"));
  });

  it("keeps a date-shaped or time-shaped scalar a String", () => {
    expect(Psych.unsafeLoad("--- 2024-01-02")).toBe("2024-01-02");
    expect(Psych.unsafeLoad("--- 2024-01-02 03:04:05 Z")).toBe("2024-01-02 03:04:05 Z");
  });

  it("raises ArgumentError for a !ruby/object:DateTime scalar", () => {
    const load = () => Psych.unsafeLoad("--- !ruby/object:DateTime 2024-01-02 03:04:05 Z");
    expect(load).toThrow(ArgumentError);
    expect(load).toThrow("undefined class/module DateTime");
  });

  it("emits a coder's represent_seq as a sequence", () => {
    class Seq {
      encodeWith(coder: PsychModule.Coder): void {
        coder.representSeq(null, [1, "a"]);
      }
    }
    expect(Psych.dump(new Seq())).toBe("---\n- 1\n- a\n");
  });

  it("round-trips plain data", () => {
    const yaml = Psych.dump({ a: [1, "x", null] });
    expect(Psych.unsafeLoad(yaml)).toEqual({ a: [1, "x", null] });
  });
});

describe("Psych with a Struct and the safe paths", () => {
  it("dumps a named Struct by its members and revives it", async () => {
    const { Psych } = await import("./psych.js");
    const { Struct } = await import("./struct.js");
    const { registerConstant } = await import("./variable.js");
    const Point = Struct.new("x", "y");
    registerConstant("PsychTrailsPoint", Point);
    const yaml = Psych.dump(new Point(1, "a"));
    expect(yaml).toContain("!ruby/struct:PsychTrailsPoint\nx: 1\ny: a\n");
    const point = Psych.unsafeLoad(yaml) as InstanceType<typeof Point>;
    expect(point).toBeInstanceOf(Point);
    expect(point.equals(new Point(1, "a"))).toBe(true);
  });

  it("revives an untagged-class struct as an anonymous Struct", async () => {
    const { Psych } = await import("./psych.js");
    const s = Psych.unsafeLoad("--- !ruby/struct\nx: 1\n") as { x: unknown; members(): string[] };
    expect(s.members()).toEqual(["x"]);
    expect(s.x).toBe(1);
  });

  it("safe_dump refuses a class that is not permitted and safe_load a tag that is not", async () => {
    const { Psych } = await import("./psych.js");
    class Widget {}
    expect(() => Psych.safeDump(new Widget())).toThrow(Psych.DisallowedClass);
    expect(Psych.safeDump({ a: [1, "x"] }, { aliases: true })).toBe("---\na:\n  - 1\n  - x\n");
    expect(() => Psych.safeLoad("--- !ruby/object:Widget {}\n")).toThrow(Psych.DisallowedClass);
    expect(Psych.safeLoad("--- {a: 1}\n")).toEqual({ a: 1 });
  });

  it("answers the fallback for an empty document", async () => {
    const { Psych } = await import("./psych.js");
    expect(Psych.parse("")).toBe(false);
    expect(Psych.unsafeLoad("")).toBe(false);
    expect(Psych.safeLoad("")).toBeNull();
  });
});

describe("psych-adapter parse on a source held as its bytes", () => {
  it("decodes UTF-8 and raises SyntaxError for malformed bytes", async () => {
    const { parse } = await import("./psych-adapter.js");
    const load = parse as (src: unknown) => unknown;
    expect(load(new TextEncoder().encode("a: é\n"))).toEqual({ a: "é" });
    expect(() => load(Uint8Array.from([0x61, 0x3a, 0x20, 0xff]))).toThrow(SyntaxError);
  });
});
