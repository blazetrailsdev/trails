import { describe, it } from "vitest";
import { Concern, assertEqual } from "@blazetrails/activesupport";
import { Module, extend, include } from "@blazetrails/ruby-compat";
import { Base } from "./index.js";
import { fixtures } from "./test-fixtures.js";

type SchemaLoadCounted = typeof Base & { loadSchemaCalls?: number };

const SchemaLoadCounter = Object.assign(new Module(), {
  ClassMethods: {
    loadSchemaBang(this: SchemaLoadCounted): void {
      this.loadSchemaCalls ??= 0;
      this.loadSchemaCalls += 1;
      return (Object.getPrototypeOf(this) as typeof Base).loadSchemaBang.call(this);
    },
  },
});
extend(SchemaLoadCounter, Concern);

describe("SchemaLoadingTest", () => {
  fixtures([]);

  it("basic model is loaded once", () => {
    const klass = defineModel();
    klass.new();
    assertEqual(1, klass.loadSchemaCalls);
  });

  it("model with custom lock is loaded once", () => {
    const klass = defineModel((c) => {
      c.tableName = "lock_without_defaults_cust";
      c.lockingColumn = "custom_lock_version";
    });
    klass.new();
    assertEqual(1, klass.loadSchemaCalls);
  });

  it("model with changed custom lock is loaded twice", () => {
    const klass = defineModel((c) => {
      c.tableName = "lock_without_defaults_cust";
    });
    klass.new();
    klass.lockingColumn = "custom_lock_version";
    klass.new();
    assertEqual(2, klass.loadSchemaCalls);
  });

  function defineModel(block?: (klass: SchemaLoadCounted) => void): SchemaLoadCounted {
    const klass: SchemaLoadCounted = class extends Base {};
    include(klass, SchemaLoadCounter);
    klass.tableName = "lock_without_defaults";
    if (block) block(klass);
    return klass;
  }
});
