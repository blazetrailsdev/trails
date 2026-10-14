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

describe("Psych.load and Psych.safe_load", () => {
  it("permits Symbol under load but not under safe_load", async () => {
    const { Psych } = await import("./psych.js");
    expect(Psych.load("--- :foo\n")).toBe(":foo");
    expect(() => Psych.safeLoad("--- :foo\n")).toThrow(Psych.DisallowedClass);
    expect(
      Psych.safeLoad("--- :foo\n", { permittedSymbols: ["foo"], permittedClasses: ["Symbol"] }),
    ).toBe(":foo");
  });

  it("raises on the first alias unless aliases is true", async () => {
    const { Psych } = await import("./psych.js");
    const yaml = "a: &x 1\nb: *x\n";
    expect(() => Psych.load(yaml)).toThrow(Psych.AliasesNotEnabled);
    expect(Psych.load(yaml, { aliases: true })).toEqual({ a: 1, b: 1 });
  });

  it("answers fallback only for an empty document", async () => {
    const { Psych } = await import("./psych.js");
    expect(Psych.load("", { fallback: {} })).toEqual({});
    expect(Psych.load("", { fallback: null })).toBeNull();
    expect(Psych.load("--- 1\n", { fallback: {} })).toBe(1);
  });

  it("honours symbolize_names and freeze", async () => {
    const { Psych } = await import("./psych.js");
    expect(Psych.load("foo: bar\n", { symbolizeNames: true })).toEqual({ ":foo": "bar" });
    const frozen = Psych.load("a: [1]\n", { freeze: true }) as { a: unknown[] };
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.a)).toBe(true);
  });
});

const nodeProcess = (
  globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }
).process;

describe("Psych load_tags, dump_tags and domain_types", () => {
  it("are reachable and writable with no backend registered", async () => {
    vi.resetModules();
    vi.spyOn(nodeProcess, "getBuiltinModule").mockImplementation(() => {
      throw new Error("no module");
    });
    try {
      const { Psych } = await import("./psych.js");
      Psych.loadTags["!x"] = "X";
      Psych.loadTags = {};
      Psych.dumpTags = new Map();
      Psych.domainTypes = Object.create(null);
      Psych.addBuiltinType("x", (_tag, value) => value);
      expect(Object.keys(Psych.domainTypes)).toEqual(["tag:yaml.org,2002:x"]);
      expect(() => Psych.dump(1)).toThrow("cannot load such file -- yaml");
    } finally {
      vi.restoreAllMocks();
      vi.resetModules();
    }
  });

  it("revives a load-tagged mapping and dumps under a dump tag", async () => {
    const { Psych } = await import("./psych.js");
    const { registerConstant } = await import("./variable.js");
    class PsychTrailsTagged {}
    registerConstant("PsychTrailsTagged", PsychTrailsTagged);
    Psych.loadTags["!tagged"] = "PsychTrailsTagged";
    Psych.dumpTags.set(PsychTrailsTagged, "!tagged");
    try {
      expect(Psych.unsafeLoad("--- !tagged\na: 1\n")).toBeInstanceOf(PsychTrailsTagged);
      expect(Psych.dump(new PsychTrailsTagged())).toBe("--- !tagged {}\n");
    } finally {
      delete Psych.loadTags["!tagged"];
      Psych.dumpTags.delete(PsychTrailsTagged);
    }
  });

  it("calls an add_builtin_type block with the key and the loaded value", async () => {
    const { Psych } = await import("./psych.js");
    Psych.addBuiltinType("point", (tag, value) => ({ tag, value }));
    try {
      expect(Psych.unsafeLoad("--- !!point [1, 2]\n")).toEqual({
        tag: "tag:yaml.org,2002:point",
        value: [1, 2],
      });
    } finally {
      delete Psych.domainTypes["tag:yaml.org,2002:point"];
    }
  });
});

describe("Psych.dump of a tagged root", () => {
  it("puts the root tag on the document-start line", async () => {
    const { Psych } = await import("./psych.js");
    const { registerConstant } = await import("./variable.js");
    class PsychTrailsRoot {
      a = 1;
    }
    registerConstant("PsychTrailsRoot", PsychTrailsRoot);
    expect(Psych.dump(new PsychTrailsRoot())).toBe("--- !ruby/object:PsychTrailsRoot\na: 1\n");
  });
});

describe("ToRuby sequences and keys", () => {
  it("revives !omap as a Psych::Omap and !ruby/array:Klass as that class", async () => {
    const { Psych } = await import("./psych.js");
    const { Omap } = await import("./psych/omap.js");
    const { registerConstant } = await import("./variable.js");
    const omap = Psych.unsafeLoad("--- !omap\n- a: 1\n- b: 2\n") as InstanceType<typeof Omap>;
    expect(omap).toBeInstanceOf(Omap);
    expect([...omap.entries()]).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
    class PsychTrailsList extends Array {}
    registerConstant("PsychTrailsList", PsychTrailsList);
    const list = Psych.unsafeLoad("--- !ruby/array:PsychTrailsList\n- 1\n- 2\n");
    expect(list).toBeInstanceOf(PsychTrailsList);
    expect([...(list as number[])]).toEqual([1, 2]);
  });

  it("symbolizes only String keys", async () => {
    const { Psych } = await import("./psych.js");
    expect(Psych.load("1: a\nb: c\n", { symbolizeNames: true })).toEqual({ "1": "a", ":b": "c" });
  });

  it("hands a load-tagged scalar's value to init_with through Coder#scalar", async () => {
    const { Psych } = await import("./psych.js");
    const { registerConstant } = await import("./variable.js");
    class PsychTrailsScalar {
      value: unknown;
      initWith(coder: InstanceType<typeof Psych.Coder>) {
        this.value = coder.scalar();
      }
    }
    registerConstant("PsychTrailsScalar", PsychTrailsScalar);
    Psych.loadTags["!scalarish"] = "PsychTrailsScalar";
    try {
      expect((Psych.unsafeLoad("--- !scalarish hello\n") as PsychTrailsScalar).value).toBe("hello");
    } finally {
      delete Psych.loadTags["!scalarish"];
    }
  });
});

describe("Psych.dump options", () => {
  it("passes indentation and line_width to the emitter", async () => {
    const { Psych } = await import("./psych.js");
    expect(Psych.dump({ a: { b: 1 } }, { indentation: 4 })).toBe("---\na:\n    b: 1\n");
    expect(Psych.dump({ a: { b: 1 } })).toBe("---\na:\n  b: 1\n");
    expect(Psych.Omap).toBeDefined();
  });
});

describe("Psych.dump canonical", () => {
  it("raises NotImplementedError for the canonical emitter option", async () => {
    const { Psych } = await import("./psych.js");
    const { NotImplementedError } = await import("./not-implemented-error.js");
    expect(() => Psych.dump({ a: 1 }, { canonical: true })).toThrow(NotImplementedError);
    expect(Psych.dump({ a: 1 }, { canonical: false })).toBe("---\na: 1\n");
  });
});
