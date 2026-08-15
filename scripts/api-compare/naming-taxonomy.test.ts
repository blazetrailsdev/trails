import { describe, it, expect } from "vitest";
import {
  classifyPair,
  classifyRow,
  refName,
  JS_RESERVED_WORDS,
  NAMING_CLASSES,
} from "./naming-taxonomy.js";

describe("classifyPair", () => {
  // postgresql_adapter.rb:781's second parameter is `default`.
  it("names a Ruby identifier JS will not accept", () => {
    expect(classifyPair("default", "defaultValue")).toBe("js-reserved-word");
    expect(classifyPair("class", "klass")).toBe("js-reserved-word");
  });

  // `size` → `length` is the construct; `size` → `n` is somebody not carrying
  // the Rails name, which is free fidelity and stays burndown work.
  it("names a Ruby construct spelled as its JS builtin, and only that spelling", () => {
    expect(classifyPair("inject", "reduce")).toBe("no-js-equivalent");
    expect(classifyPair("last", "at")).toBe("no-js-equivalent");
    expect(classifyPair("size", "n")).toBe("burndown");
  });

  // The recorder camelCases a plain Ruby `ref:` identifier, so a multi-word
  // key only ever reaches here in its camel spelling (abstract-adapter.ts's
  // `object_id` records as `objectId`) — matching snake_case alone missed the
  // whole `to_*` family and read four permanent rows as burndown work.
  it("names a Ruby construct under the camelCased spelling the recorder gives it", () => {
    expect(classifyPair("objectId", "this")).toBe("no-js-equivalent");
    expect(classifyPair("toI", "parseInt")).toBe("no-js-equivalent");
    expect(classifyPair("toS", "toString")).toBe("no-js-equivalent");
    expect(classifyPair("toS", "fetchValue")).toBe("burndown");
  });

  it("names what the conventions table itself produces", () => {
    expect(classifyPair("primary_class?", "primaryClassQ")).toBe("conventions-rename");
    expect(classifyPair("@callbacks", "_callbacks")).toBe("conventions-rename");
  });

  // The recorder normalizes Ruby `self` to `this` before it reaches the row.
  it("names the mixin receiver Ruby writes as self", () => {
    expect(classifyPair("self", "target")).toBe("module-mixin-receiver");
    expect(classifyPair("this", "target")).toBe("module-mixin-receiver");
    expect(classifyPair("options", "opts")).toBe("burndown");
  });

  // migration.rb:1422 `migration.migrate(@direction)` vs migration.ts:2575
  // `migrate(this._direction)`; attribute_methods.rb:47 `include
  // @generated_attribute_methods` vs attribute-methods.ts:285
  // `include(this, this._generatedAttributeMethods)`.
  it("names a Ruby ivar the TS side spells with a leading underscore", () => {
    expect(classifyPair("direction", "_direction")).toBe("ivar-underscore");
    expect(classifyPair("generated_attribute_methods", "_generatedAttributeMethods")).toBe(
      "ivar-underscore",
    );
    expect(classifyPair("direction", "_dir")).toBe("burndown");
  });

  // model_schema.rb:433 `columns_hash.values` vs model-schema.ts:775
  // `Object.values(columnsHash.call(this))`.
  it("names the mixin call the module-mixin idiom records as the outermost callee", () => {
    const thisTyped = new Set(["columnsHash", "viewPaths"]);
    expect(classifyPair("columns_hash", "call", thisTyped)).toBe("module-mixin-call");
    expect(classifyPair("_view_paths", "call", thisTyped)).toBe("module-mixin-call");
    // A TS `call` the Ruby name cannot account for stays convergeable: the class
    // is permanent, so an unqualified `ref:call` must never fall into it.
    expect(classifyPair("some_method", "call", thisTyped)).toBe("burndown");
    expect(classifyPair("columns_hash", "call")).toBe("burndown");
  });

  // belongs_to_association.rb:47 `writer(owner.instance_exec(&block))` vs
  // belongs-to-association.ts:76 `await this.writer(await block(this.owner))`.
  it("names the block idiom Ruby writes as instance_exec", () => {
    expect(classifyPair("instance_exec", "block")).toBe("block-idiom");
    expect(classifyPair("instanceExec", "block")).toBe("block-idiom");
    expect(classifyPair("instance_exec", "proc")).toBe("burndown");
  });
});

describe("classifyRow", () => {
  it("classifies the one pair that differs, ignoring matches and non-ref arguments", () => {
    expect(classifyRow(["ref:a", "const:Hash"], ["ref:a", "const:Hash"])).toBe("burndown");
    expect(classifyRow(["ref:a", "ref:inject"], ["ref:a", "ref:reduce"])).toBe("no-js-equivalent");
  });

  // A row is only closeable when EVERY identifier it differs on is, so one
  // convergeable pair keeps the whole row out of any baseline.
  it("reports a mixed row by its convergeable pair, never as permanent", () => {
    expect(classifyRow(["ref:inject", "ref:options"], ["ref:reduce", "ref:opts"])).toBe("burndown");
  });
});

describe("the taxonomy itself", () => {
  // The split IS the story: a permanent class earns one shared reviewed reason,
  // a convergeable one is never baselined (CLAUDE.md — converge, never ratify).
  it("gives every class a distinct name, a reviewed reason, and the right permanence", () => {
    expect(new Set(NAMING_CLASSES.map((c) => c.name)).size).toBe(NAMING_CLASSES.length);
    for (const c of NAMING_CLASSES) expect(c.reason.length).toBeGreaterThan(40);
    expect(NAMING_CLASSES.filter((c) => c.permanent).map((c) => c.name)).toEqual([
      "js-reserved-word",
      "no-js-equivalent",
      "conventions-rename",
      "ivar-underscore",
      "module-mixin-call",
      "block-idiom",
    ]);
  });

  it("reads a bare ref name and leaves other argument forms alone", () => {
    expect(refName("ref:foo")).toBe("foo");
    expect(refName("const:Foo")).toBeUndefined();
    expect(JS_RESERVED_WORDS.has("default")).toBe(true);
  });
});
