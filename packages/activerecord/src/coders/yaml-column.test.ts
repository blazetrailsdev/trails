import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Hash } from "@blazetrails/ruby-compat";
import { Psych } from "@blazetrails/ruby-compat/psych";
import { YAMLColumn } from "./yaml-column.js";
import { Time } from "@blazetrails/date";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { SerializationTypeMismatch } from "../errors.js";
import {
  setUseYamlUnsafeLoad,
  setYamlColumnPermittedClasses,
  useYamlUnsafeLoad,
  yamlColumnPermittedClasses,
} from "../active-record.js";

describe("YAMLColumn round-trip", () => {
  it("dumps and loads a plain hash", () => {
    const coder = new YAMLColumn("params");
    const dumped = coder.dump({ token: "abc", count: 3 });
    expect(typeof dumped).toBe("string");
    expect(coder.load(dumped)).toEqual(new Hash().set("token", "abc").set("count", 3));
  });

  it("dumps nil as null and loads nil/blank as null", () => {
    const coder = new YAMLColumn("params");
    expect(coder.dump(null)).toBeNull();
    expect(coder.load(null)).toBeNull();
    expect(coder.load("")).toBeNull();
  });

  it("round-trips nested structures", () => {
    const coder = new YAMLColumn("params");
    const value = { a: [1, 2, { b: "x" }], c: { d: true } };
    expect(coder.load(coder.dump(value))).toEqual(
      new Hash().set("a", [1, 2, new Hash().set("b", "x")]).set("c", new Hash().set("d", true)),
    );
  });

  describe("safe dump", () => {
    afterEach(() => setUseYamlUnsafeLoad(false));

    class Unpermitted {
      secret = "s3cret";
    }

    it("raises Psych.DisallowedClass when dumping an unpermitted class instance", () => {
      const coder = new YAMLColumn("params");
      expect(() => coder.dump(new Unpermitted())).toThrow(Psych.DisallowedClass);
      expect(() => coder.dump(new Unpermitted())).toThrow(
        /Tried to dump unspecified class: Unpermitted/,
      );
      expect(() => coder.dump({ nested: [new Unpermitted()] })).toThrow(Psych.DisallowedClass);
    });

    it("dumps unpermitted class instances when use_yaml_unsafe_load is set", () => {
      setUseYamlUnsafeLoad(true);
      const coder = new YAMLColumn("params");
      expect(coder.dump(new Unpermitted())).toContain("s3cret");
    });
  });
});

describe("YAMLColumnTest", () => {
  let useYamlUnsafeLoadWas: boolean;
  beforeEach(() => {
    useYamlUnsafeLoadWas = useYamlUnsafeLoad();
    setUseYamlUnsafeLoad(true);
  });
  afterEach(() => setUseYamlUnsafeLoad(useYamlUnsafeLoadWas));

  it("initialize takes class", () => {
    const coder = new YAMLColumn("attr_name", Object as never);
    expect(coder.objectClass).toBe(Object);
  });
  it("type mismatch on different classes on dump", () => {
    const coder = new YAMLColumn("tags", Array as never);
    expect(() => coder.dump("a")).toThrow(
      'can\'t dump `tags`: was supposed to be a Array, but was a String. -- "a"',
    );
  });
  it("type mismatch on different classes", () => {
    const coder = new YAMLColumn("tags", Array as never);
    expect(() => coder.load("--- foo")).toThrow(
      'can\'t load `tags`: was supposed to be a Array, but was a String. -- "foo"',
    );
  });
  it("nil is ok", () => {
    const coder = new YAMLColumn("attr_name");
    expect(coder.load("--- ")).toBeNull();
  });
  it("returns new with different class", () => {
    const coder = new YAMLColumn("attr_name", SerializationTypeMismatch as never);
    expect((coder.load("--- ") as object).constructor).toBe(SerializationTypeMismatch);
  });
  it("returns string unless starts with dash", () => {
    const coder = new YAMLColumn("attr_name");
    expect(coder.load("foo")).toBe("foo");
  });
  it("load raises on other classes", () => {
    const coder = new YAMLColumn("attr_name");
    expect(() => coder.load([])).toThrow(TypeError);
  });
  it("load doesnt swallow yaml exceptions", () => {
    const coder = new YAMLColumn("attr_name");
    const badYaml = "--- {";
    expect(() => coder.load(badYaml)).toThrow(Psych.SyntaxError);
  });
  it.skip("load doesnt handle undefined class or module", () => {
    // BLOCKED: psych-parse-accepts-trailing-text-after-flow-collection
    const coder = new YAMLColumn("attr_name");
    const missingClassYaml = "--- !ruby/object:DoesNotExistAndShouldntEver {}\\n";
    expect(() => coder.load(missingClassYaml)).toThrow(ArgumentError);
  });
});

describe("YAMLColumnTestWithSafeLoad", () => {
  let useYamlUnsafeLoadWas: boolean;
  let yamlColumnPermittedClassesDefault: unknown[];
  beforeEach(() => {
    useYamlUnsafeLoadWas = useYamlUnsafeLoad();
    yamlColumnPermittedClassesDefault = yamlColumnPermittedClasses();
    setUseYamlUnsafeLoad(false);
  });
  afterEach(() => {
    setUseYamlUnsafeLoad(useYamlUnsafeLoadWas);
    setYamlColumnPermittedClasses(yamlColumnPermittedClassesDefault);
  });

  it("yaml column permitted classes are consumed by safe load", () => {
    setYamlColumnPermittedClasses([Symbol, Time]);

    const coder = new YAMLColumn("attr_name");
    const timeYaml = Psych.dump(Time.new());
    const symbolYaml = Psych.dump(":somesymbol");

    expect(() => {
      coder.load(timeYaml);
      coder.load(symbolYaml);
    }).not.toThrow();
  });
  it("yaml column permitted classes are consumed by safe dump", () => {
    const coder = new YAMLColumn("attr_name");
    expect(() => coder.dump([Time.new()])).toThrow(Psych.DisallowedClass);
  });
  it("yaml column permitted classes option", () => {
    setYamlColumnPermittedClasses([Symbol]);

    const coder = new YAMLColumn("attr_name", undefined, { permittedClasses: [Time] });
    const timeYaml = Psych.dump(Time.new());
    const symbolYaml = Psych.dump(":somesymbol");

    expect(() => {
      coder.load(timeYaml);
      coder.load(symbolYaml);
    }).not.toThrow();
  });
  it("yaml column unsafe load option", () => {
    setUseYamlUnsafeLoad(false);
    setYamlColumnPermittedClasses([]);

    const coder = new YAMLColumn("attr_name", undefined, { unsafeLoad: true });
    const timeYaml = Psych.dump(Time.new());
    const symbolYaml = Psych.dump(":somesymbol");

    expect(() => {
      coder.load(timeYaml);
      coder.load(symbolYaml);
    }).not.toThrow();
  });
  it("yaml column override unsafe load option", () => {
    setUseYamlUnsafeLoad(true);
    setYamlColumnPermittedClasses([]);

    const coder = new YAMLColumn("attr_name", undefined, { unsafeLoad: false });
    const timeYaml = Psych.dump(Time.new());

    expect(() => coder.load(timeYaml)).toThrow(Psych.DisallowedClass);
  });
  it.skip("load doesnt handle undefined class or module", () => {
    // BLOCKED: psych-parse-accepts-trailing-text-after-flow-collection
    const coder = new YAMLColumn("attr_name");
    const missingClassYaml = "--- !ruby/object:DoesNotExistAndShouldntEver {}\\n";
    expect(() => coder.load(missingClassYaml)).toThrow(Psych.DisallowedClass);
  });
});
