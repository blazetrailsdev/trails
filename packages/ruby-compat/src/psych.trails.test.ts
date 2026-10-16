import { beforeEach, describe, it, expect, vi } from "vitest";
import type { ArgumentError as ArgumentErrorClass } from "./argument-error.js";
import type { Hash } from "./hash.js";
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
    expect(Object.fromEntries(Psych.unsafeLoad(yaml) as Map<string, unknown>)).toEqual({
      a: [1, "x", null],
    });
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
    expect(Psych.safeDump({ a: [1, "x"] }, { aliases: true })).toBe("---\na:\n- 1\n- x\n");
    expect(() => Psych.safeLoad("--- !ruby/object:Widget {}\n")).toThrow(Psych.DisallowedClass);
    expect(Object.fromEntries(Psych.safeLoad("--- {a: 1}\n") as Map<string, unknown>)).toEqual({
      a: 1,
    });
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
    const { SyntaxError: PsychSyntaxError } = await import("./psych/syntax-error.js");
    const load = parse as (src: unknown) => unknown;
    expect(load(new TextEncoder().encode("a: é\n"))).toEqual({ a: "é" });
    expect(() => load(Uint8Array.from([0x61, 0x3a, 0x20, 0xff]))).toThrow(PsychSyntaxError);
    expect(() => load("a: [b\n")).toThrow(PsychSyntaxError);
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
    expect(Object.fromEntries(Psych.load(yaml, { aliases: true }) as Map<string, unknown>)).toEqual(
      { a: 1, b: 1 },
    );
  });

  it("answers fallback only for an empty document", async () => {
    const { Psych } = await import("./psych.js");
    expect(Psych.load("", { fallback: {} })).toEqual({});
    expect(Psych.load("", { fallback: null })).toBeNull();
    expect(Psych.load("--- 1\n", { fallback: {} })).toBe(1);
  });

  it("honours symbolize_names and freeze", async () => {
    const { Psych } = await import("./psych.js");
    expect([
      ...(Psych.load("foo: bar\n", { symbolizeNames: true }) as Map<unknown, unknown>),
    ]).toEqual([[":foo", "bar"]]);
    const frozen = Psych.load("a: [1]\n", { freeze: true }) as Hash<string, unknown[]>;
    expect(frozen.isFrozen()).toBe(true);
    expect(Object.isFrozen(frozen.get("a"))).toBe(true);
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

  it('keeps an Integer key an Integer, as ruby -ryaml loads 1: a as {1=>"a"}', async () => {
    const { Psych } = await import("./psych.js");
    expect([...(Psych.unsafeLoad("1: a\n") as Map<unknown, unknown>)]).toEqual([[1, "a"]]);
  });

  it("stores a << value that is not a Hash under <<, as ruby -ryaml does", async () => {
    const { Psych } = await import("./psych.js");
    const aliased = Psych.unsafeLoad("a: &a 1\nb:\n  <<: *a\n  c: 2\n") as Map<string, unknown>;
    expect([...(aliased.get("b") as Map<unknown, unknown>)]).toEqual([
      ["<<", 1],
      ["c", 2],
    ]);
    const sequence = Psych.unsafeLoad("a: &a {x: 1}\nb:\n  <<: [*a, 3]\n") as Map<string, unknown>;
    const merged = sequence.get("b") as Map<unknown, unknown>;
    expect([...merged.keys()]).toEqual(["<<"]);
    expect(merged.get("<<")).toEqual([sequence.get("a"), 3]);
  });

  it("symbolizes only String keys", async () => {
    const { Psych } = await import("./psych.js");
    const hash = Psych.load("1: a\nb: c\n", { symbolizeNames: true }) as Map<unknown, unknown>;
    expect([...hash]).toEqual([
      [1, "a"],
      [":b", "c"],
    ]);
  });

  it("revives a self-aliased mapping with a non-String key as one Hash", async () => {
    const { Psych } = await import("./psych.js");
    const hash = Psych.unsafeLoad("&a\nx: *a\n1: y\n") as Map<unknown, unknown>;
    expect(hash.get("x")).toBe(hash);
    expect(hash.get(1)).toBe("y");
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

describe("Psych.dump document marker and io", () => {
  it("writes a scalar root on the --- line as libyaml does", async () => {
    const { Psych } = await import("./psych.js");
    expect(Psych.dump("str")).toBe("--- str\n");
    expect(Psych.dump("")).toBe("--- ''\n");
    expect(Psych.dump(null)).toBe("---\n");
    expect(Psych.dump(1.5)).toBe("--- 1.5\n");
    expect(Psych.dump("true")).toBe("--- 'true'\n");
    expect(Psych.dump("x".repeat(100))).toBe(`--- ${"x".repeat(100)}\n`);
    expect(Psych.dump("a\nb")).toBe("--- |-\n  a\n  b\n");
    expect(Psych.dump(["ok"])).toBe("---\n- ok\n");
  });

  it("writes to an io and answers it", async () => {
    const { Psych } = await import("./psych.js");
    const { StringIO } = await import("./string-io.js");
    const io = new StringIO();
    expect(Psych.dump(["ok"], io)).toBe(io);
    expect(Psych.safeDump("str", io, {})).toBe(io);
    expect(io.string()).toBe("---\n- ok\n--- str\n");
  });
});

describe("Psych.safe_dump", () => {
  it("permits the default classes and refuses an alias unless aliases is true", async () => {
    const { Psych } = await import("./psych.js");
    expect(Psych.safeDump({ a: [1, 1.5, "x", true, null] })).toBe(
      "---\na:\n- 1\n- 1.5\n- x\n- true\n-\n",
    );
    const shared = ["x"];
    expect(() => Psych.safeDump([shared, shared])).toThrow(Psych.BadAlias);
    expect(Psych.safeDump([shared, shared], { aliases: true })).toContain("*");
  });
});

describe("Psych::Omap", () => {
  it("dumps as !!omap pairs and revives both !omap shapes", async () => {
    const { Psych } = await import("./psych.js");
    const o = new Psych.Omap<string, number>();
    o.set("a", 1);
    o.set("b", 2);
    expect(Psych.dump(o)).toBe("--- !!omap\n- a: 1\n- b: 2\n");
    const back = Psych.unsafeLoad(Psych.dump(o));
    expect(back).toBeInstanceOf(Psych.Omap);
    expect([...(back as Map<string, number>)]).toEqual([...o]);
    const mapped = Psych.unsafeLoad("--- !omap\na: 1\nb: 2\n");
    expect(mapped).toBeInstanceOf(Psych.Omap);
    expect([...(mapped as Map<string, number>)]).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });
});

describe("Object#to_yaml", () => {
  it("dumps with the options it is given", async () => {
    const { toYaml } = await import("./psych/core-ext.js");
    expect(toYaml({ a: { b: 1 } }, { indentation: 4 })).toBe("---\na:\n    b: 1\n");
    expect(toYaml("str")).toBe("--- str\n");
  });
});

describe("Psych.load_file and Psych.unsafe_load_file", () => {
  it("read the file, strip a BOM and answer each fallback for an empty file", async () => {
    const { Psych } = await import("./psych.js");
    const { File } = await import("./file.js");
    const { Dir } = await import("./dir.js");
    await Dir.mktmpdir("psych", null, {}, async (dir: string) => {
      const yamlPath = File.join(dir, "a.yml");
      const emptyPath = File.join(dir, "empty.yml");
      File.write(yamlPath, "\uFEFFa: 1\n");
      File.write(emptyPath, "");
      expect([...(Psych.loadFile(yamlPath) as Map<unknown, unknown>)]).toEqual([["a", 1]]);
      expect([
        ...(Psych.unsafeLoadFile(yamlPath, { symbolizeNames: true }) as Map<unknown, unknown>),
      ]).toEqual([[":a", 1]]);
      expect(Psych.unsafeLoadFile(emptyPath)).toBe(false);
      expect(Psych.loadFile(emptyPath)).toBeNull();
    });
  });
});

describe("Psych::SyntaxError and a Struct subclass", () => {
  it("raises Psych::SyntaxError carrying the file and mark for a malformed document", async () => {
    const { Psych } = await import("./psych.js");
    let error: InstanceType<typeof Psych.SyntaxError> | undefined;
    try {
      Psych.unsafeLoad("a: b\n  c: d\n", { filename: "bad.yml" });
    } catch (e) {
      error = e as InstanceType<typeof Psych.SyntaxError>;
    }
    expect(error).toBeInstanceOf(Psych.SyntaxError);
    expect(error).toBeInstanceOf(Psych.Exception);
    expect(error!.file).toBe("bad.yml");
    expect(error!.message).toMatch(/^\(bad\.yml\): .* at line \d+ column \d+$/);
  });

  it("dumps a class that extends Struct.new under its own name", async () => {
    const { Psych } = await import("./psych.js");
    const { Struct } = await import("./struct.js");
    class PsychTrailsPair extends Struct.new("a") {}
    expect(Psych.dump(new PsychTrailsPair(1))).toBe("--- !ruby/struct:PsychTrailsPair\na: 1\n");
  });
});

describe("Psych.dump string scalar style", () => {
  it("single-quotes a string libyaml cannot write plain, doubling its quotes", async () => {
    const { Psych } = await import("./psych.js");
    expect(Psych.dump("a: b")).toBe("--- 'a: b'\n");
    expect(Psych.dump("it's: x")).toBe("--- 'it''s: x'\n");
    expect(Psych.dump("x #y")).toBe("--- 'x #y'\n");
    expect(Psych.dump("<<")).toBe("--- !!str '<<'\n");
    expect(Psych.dump("x\n")).toBe("--- 'x\n\n  '\n");
    expect(Psych.dump({ "a: b": 1 })).toBe("---\n'a: b': 1\n");
    expect(Psych.dump("'x")).toBe('--- "\'x"\n');
    expect(Psych.dump(" lead")).toBe('--- " lead"\n');
    expect(Psych.dump("a\tb")).toBe('--- "a\\tb"\n');
    expect(Psych.dump("y")).toBe('--- "y"\n');
  });

  it("folds a single-quoted scalar past 80 columns as libyaml does", async () => {
    const { Psych } = await import("./psych.js");
    expect(Psych.dump("a b ".repeat(30))).toBe(
      "--- 'a b a b a b a b a b a b a b a b a b a b a b a b a b a b a b a b a b a b a b a\n  b a b a b a b a b a b a b a b a b a b a b '\n",
    );
    expect(Psych.dump(`${"x".repeat(90)} y: z`)).toBe(`--- '${"x".repeat(90)}\n  y: z'\n`);
    expect(Psych.dump(["a b ".repeat(30)])).toBe(
      "---\n- 'a b a b a b a b a b a b a b a b a b a b a b a b a b a b a b a b a b a b a b a b\n  a b a b a b a b a b a b a b a b a b a b '\n",
    );
    expect(Psych.dump({ n: { m: `it's: ${"x y ".repeat(25)}` } })).toBe(
      "---\n\"n\":\n  m: 'it''s: x y x y x y x y x y x y x y x y x y x y x y x y x y x y x y x y x y x\n    y x y x y x y x y x y x y x y '\n",
    );
  });
});

describe("Psych.dump empty root collection and explicit keys", () => {
  it("writes an empty root collection on the document line", async () => {
    const { Psych } = await import("./psych.js");
    const { Hash } = await import("./hash.js");
    expect(Psych.dump(new Hash())).toBe("--- {}\n");
    expect(Psych.dump({})).toBe("--- {}\n");
    expect(Psych.dump([])).toBe("--- []\n");
  });

  it("writes a key longer than 128 bytes or spanning lines as an explicit key", async () => {
    const { Psych } = await import("./psych.js");
    expect(Psych.dump({ ["a".repeat(129)]: 1 })).toBe(`---\n? ${"a".repeat(129)}\n: 1\n`);
    expect(Psych.dump({ ["a".repeat(128)]: 1 })).toBe(`---\n${"a".repeat(128)}: 1\n`);
    expect(Psych.dump({ "a\nb": 1 })).toBe("---\n? |-\n  a\n  b\n: 1\n");
  });
});

describe("Psych.parse stops at the end of the first document", () => {
  it("ignores text after a closed flow or quoted root", async () => {
    const { Psych } = await import("./psych.js");
    expect(Psych.unsafeLoad("--- [1] foo bar")).toEqual([1]);
    expect(Psych.unsafeLoad('--- "a" x')).toBe("a");
    expect(Psych.parse("--- !ruby/object:X {}\\n")).toBeTruthy();
    expect(() => Psych.parse("--- {")).toThrow(Psych.SyntaxError);
  });
});
