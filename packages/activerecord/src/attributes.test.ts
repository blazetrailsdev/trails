import { describe, it, expect, beforeAll, vi } from "vitest";
import { Base } from "./index.js";
import {
  typeRegistry,
  ValueType,
  StringType,
  IntegerType,
  UserProvidedDefault,
} from "@blazetrails/activemodel";
import { Array as OidArray } from "./connection-adapters/postgresql/oid/array.js";
import { RangeType } from "./connection-adapters/postgresql/oid/range.js";
import { BigDecimal } from "@blazetrails/activesupport";

import { registerModel } from "./associations.js";
import { loadSchemaFromAdapter } from "./model-schema.js";
import { fixtures } from "./test-fixtures.js";
import { inTimeZone } from "./cases/helper.js";
import { adapterType } from "./test-adapter.js";

vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- a generated attribute member is an accessor pair (read.rb:35 / write.rb:36 cast asymmetry); the class/interface merge is how it surfaces on the type side.
class OverloadedType extends Base {
  static {
    this.tableName = "overloaded_types";
    this.attribute("overloaded_float", "integer");
    this.attribute("overloaded_string_with_limit", "string", { limit: 50 });
    this.attribute("non_existent_decimal", "decimal");
    this.attribute("string_with_default", "string", { default: "the overloaded default" });
    registerModel(this);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- a generated attribute member is an accessor pair (read.rb:35 / write.rb:36 cast asymmetry); the class/interface merge is how it surfaces on the type side.
interface OverloadedType {
  get non_existent_decimal(): BigDecimal | null;
  set non_existent_decimal(value: unknown);
  get overloaded_float(): number | null;
  set overloaded_float(value: unknown);
}

class ChildOfOverloadedType extends OverloadedType {}

class GrandchildOfOverloadedType extends ChildOfOverloadedType {
  static {
    this.attribute("overloaded_float", "float");
  }
}

class UnoverloadedType extends Base {
  static {
    this.tableName = "overloaded_types";
    registerModel(this);
  }
}

describe("CustomPropertiesTest", () => {
  fixtures([]);
  beforeAll(async () => {
    await loadSchemaFromAdapter.call(OverloadedType);
    await loadSchemaFromAdapter.call(UnoverloadedType);
  });

  const withImmutableStrings = async (fn: () => void): Promise<void> => {
    const old = Base.immutableStringsByDefault;
    Base.immutableStringsByDefault = true;
    try {
      void OverloadedType.resetColumnInformation();
      await loadSchemaFromAdapter.call(OverloadedType);
      fn();
    } finally {
      Base.immutableStringsByDefault = old;
      void OverloadedType.resetColumnInformation();
      await loadSchemaFromAdapter.call(OverloadedType);
    }
  };

  it("overloading types", () => {
    const data = new OverloadedType();

    data.overloaded_float = "1.1";
    (data as any).unoverloaded_float = "1.1";

    expect(data.overloaded_float).toBe(1);
    expect((data as any).unoverloaded_float).toBe(1.1);
  });

  it("overloaded properties save", async () => {
    const data = new OverloadedType();

    data.overloaded_float = "2.2";
    await data.save();
    await data.reload();

    expect(data.overloaded_float).toBe(2);
    const lastOverloaded = await OverloadedType.last();
    expect(Number.isInteger(lastOverloaded!.overloaded_float)).toBe(true);
    expect(((await UnoverloadedType.last()) as any).overloaded_float).toBe(2.0);
  });

  it("properties assigned in constructor", () => {
    const data = new OverloadedType({ overloaded_float: "3.3" });

    expect(data.overloaded_float).toBe(3);
  });

  it(".type_for_attribute supports attribute aliases", () => {
    class WithAlias extends OverloadedType {
      static {
        this.aliasAttribute("overloaded_float", "x");
      }
    }

    expect(WithAlias.typeForAttribute("overloaded_float")).toEqual(WithAlias.typeForAttribute("x"));
  });

  it("overloaded properties with limit", () => {
    expect(OverloadedType.typeForAttribute("overloaded_string_with_limit")!.limit).toBe(50);
    expect(UnoverloadedType.typeForAttribute("overloaded_string_with_limit")!.limit).toBe(255);
  });

  it("overloaded default but keeping its own type", () => {
    class WithDefault extends UnoverloadedType {
      static {
        this.attribute("overloaded_string_with_limit", {
          default: "the overloaded default",
        });
      }
    }

    expect(
      (UnoverloadedType.columnsHash() as Record<string, { limit?: number }>)
        .overloaded_string_with_limit.limit,
    ).toBe(255);
    expect(
      (WithDefault.columnsHash() as Record<string, { limit?: number }>).overloaded_string_with_limit
        .limit,
    ).toBe(255);

    expect((new UnoverloadedType() as any).overloaded_string_with_limit).toBeNull();
    expect((new WithDefault() as any).overloaded_string_with_limit).toBe("the overloaded default");
  });

  it("attributes with overridden types keep their type when a default value is configured separately", () => {
    class Child extends OverloadedType {
      static {
        this.attribute("overloaded_float", { default: "123" });
      }
    }

    expect(Child.typeForAttribute("overloaded_float")).toEqual(
      OverloadedType.typeForAttribute("overloaded_float"),
    );
    expect(new Child().overloaded_float).toBe(123);
  });

  it("extra options are forwarded to the type caster constructor", () => {
    class WithStartsAt extends OverloadedType {
      static {
        this.attribute("starts_at", "datetime", { default: () => new Date() });
      }
    }

    const startsAtType = WithStartsAt.typeForAttribute("starts_at")!;
    expect(startsAtType.constructor.name).toMatch(/DateTime/);
    expect((new WithStartsAt() as any).starts_at).toBeDefined();
  });

  it("time zone aware attribute", async () => {
    await inTimeZone("Pacific Time (US & Canada)", async () => {
      class WithTimes extends OverloadedType {
        static {
          this.attribute("starts_at", "datetime", { default: () => new Date() });
          this.attribute("ends_at", "datetime", { default: () => new Date() });
        }
      }

      const startsAtType = WithTimes.typeForAttribute("starts_at")!;
      const endsAtType = WithTimes.typeForAttribute("ends_at")!;

      expect(startsAtType.constructor.name).toMatch(/TimeZoneConverter/);
      expect(endsAtType.constructor.name).toMatch(/TimeZoneConverter/);
      expect((new WithTimes() as any).starts_at).toBeDefined();
      expect((new WithTimes() as any).ends_at).toBeDefined();
    });
  });

  it("nonexistent attribute", () => {
    const data = new OverloadedType({ non_existent_decimal: 1 });

    expect(data.non_existent_decimal).toEqual(new BigDecimal(1));
    expect(() => new UnoverloadedType({ non_existent_decimal: 1 } as any)).toThrow(
      "unknown attribute 'non_existent_decimal'",
    );
  });

  it("model with nonexistent attribute with default value can be saved", async () => {
    class WithNonexistentDefault extends OverloadedType {
      static {
        this.attribute("non_existent_string_with_default", "string", { default: "nonexistent" });
      }
    }

    const model = new WithNonexistentDefault();
    expect(await model.save()).toBe(true);
  });

  it("changing defaults", () => {
    const data = new OverloadedType();
    const unoverloadedData = new UnoverloadedType();

    expect((data as any).string_with_default).toBe("the overloaded default");
    expect((unoverloadedData as any).string_with_default).toBe("the original default");
  });

  it("defaults are not touched on the columns", () => {
    expect(
      (OverloadedType.columnsHash() as Record<string, { default?: unknown }>).string_with_default
        .default,
    ).toBe("the original default");
  });

  it("children inherit custom properties", () => {
    const data = new ChildOfOverloadedType({ overloaded_float: "4.4" });

    expect(data.overloaded_float).toBe(4);
  });

  it("children can override parents", () => {
    const data = new GrandchildOfOverloadedType({ overloaded_float: "4.4" });

    expect(data.overloaded_float).toBe(4.4);
  });

  it("overloading properties does not attribute method order", () => {
    const attributeNames = OverloadedType.attributeNames();
    expect(attributeNames).toEqual([...OverloadedType.columnNames(), "non_existent_decimal"]);
  });

  it("caches are cleared", async () => {
    class Klass extends OverloadedType {}
    await loadSchemaFromAdapter.call(Klass);
    const columnCount = Klass.columns().length;

    expect(Object.keys(Klass.attributeTypes()).length).toBe(columnCount + 1);
    expect(Object.keys(Klass.columnDefaults).length).toBe(columnCount + 1);
    expect(Klass.attributeNames().length).toBe(columnCount + 1);
    expect(Object.keys(Klass.attributeTypes())).not.toContain("wibble");
    expect(Klass.attributeNames()).not.toContain("wibble");

    Klass.attribute("wibble", new ValueType());

    expect(Object.keys(Klass.attributeTypes()).length).toBe(columnCount + 2);
    expect(Object.keys(Klass.columnDefaults).length).toBe(columnCount + 2);
    expect(Klass.attributeNames().length).toBe(columnCount + 2);
    expect(Object.keys(Klass.attributeTypes())).toContain("wibble");
    expect(Klass.attributeNames()).toContain("wibble");
  });

  it("the given default value is cast from user", () => {
    class CustomType extends ValueType {
      cast(): unknown {
        return "from user";
      }
      deserialize(): unknown {
        return "from database";
      }
    }

    class Klass extends OverloadedType {
      static {
        this.attribute("wibble", new CustomType() as any, { default: "default" });
      }
    }
    const model = new Klass();

    expect((model as any).wibble).toBe("from user");
  });

  it("procs for default values", () => {
    let counter = 0;
    class Klass extends OverloadedType {
      static {
        this.attribute("counter", "integer", { default: () => (counter += 1) });
      }
    }

    expect((new Klass() as any).counter).toBe(1);
    expect((new Klass() as any).counter).toBe(2);
  });

  it("procs for default values are evaluated even after column_defaults is called", () => {
    let counter = 0;
    class Klass extends OverloadedType {
      static {
        this.attribute("counter", "integer", { default: () => (counter += 1) });
      }
    }

    expect((new Klass() as any).counter).toBe(1);

    void Klass.columnDefaults;

    expect((new Klass() as any).counter).toBe(3);
  });

  it("procs are memoized before type casting", () => {
    let counter = 0;
    class Klass extends OverloadedType {
      static {
        this.attribute("counter", "integer", { default: () => (counter += 1) });
      }
    }

    const model = new Klass();
    expect((model as any).readAttributeBeforeTypeCast("counter")).toBe(1);
    expect((model as any).readAttributeBeforeTypeCast("counter")).toBe(1);
  });

  it("user provided defaults are persisted even if unchanged", async () => {
    const model = await OverloadedType.create();

    expect(((await model.reload()) as any).string_with_default).toBe("the overloaded default");
  });

  it.skipIf(adapterType !== "postgres")("array types can be specified", () => {
    class Klass extends OverloadedType {
      static {
        this.attribute("my_array", "string", { limit: 50, array: true });
        this.attribute("my_int_array", "integer", { array: true });
      }
    }

    const stringArray = Klass.typeForAttribute("my_array") as OidArray;
    const intArray = Klass.typeForAttribute("my_int_array") as OidArray;
    expect(stringArray).not.toEqual(intArray);
    expect(stringArray).toBeInstanceOf(OidArray);
    expect(stringArray.subtype).toBeInstanceOf(StringType);
    expect(stringArray.subtype.limit).toBe(50);
    expect(intArray).toBeInstanceOf(OidArray);
    expect(intArray.subtype).toBeInstanceOf(IntegerType);
  });

  it.skipIf(adapterType !== "postgres")("range types can be specified", () => {
    class Klass extends OverloadedType {
      static {
        this.attribute("my_range", "string", { limit: 50, range: true });
        this.attribute("my_int_range", "integer", { range: true });
      }
    }

    const stringRange = Klass.typeForAttribute("my_range") as RangeType;
    const intRange = Klass.typeForAttribute("my_int_range") as RangeType;
    expect(stringRange).not.toEqual(intRange);
    expect(stringRange).toBeInstanceOf(RangeType);
    expect(stringRange.subtype).toBeInstanceOf(StringType);
    expect((stringRange.subtype as StringType).limit).toBe(50);
    expect(intRange).toBeInstanceOf(RangeType);
    expect(intRange.subtype).toBeInstanceOf(IntegerType);
  });

  it("attributes added after subclasses load are inherited", () => {
    class Parent extends Base {
      static {
        this.tableName = "topics";
        registerModel(this);
      }
    }

    class Child extends Parent {}
    new Child();

    Parent.attribute("foo", new ValueType());

    expect((new Child({ foo: "bar" } as any) as any).foo).toBe("bar");
  });

  it("attributes not backed by database columns are not dirty when unchanged", () => {
    expect((new OverloadedType() as any).attributeChanged("non_existent_decimal")).toBe(false);
  });

  it("attributes not backed by database columns are always initialized", async () => {
    await OverloadedType.create();
    const model = (await OverloadedType.last())!;

    expect(model.non_existent_decimal).toBeNull();
    model.non_existent_decimal = "123";
    expect(model.non_existent_decimal).toEqual(new BigDecimal(123));
  });

  it("attributes not backed by database columns return the default on models loaded from database", async () => {
    class Child extends OverloadedType {
      static {
        this.attribute("non_existent_decimal", "decimal", { default: 123 });
      }
    }
    await Child.create();
    const model = (await Child.last())!;

    expect(model.non_existent_decimal).toEqual(new BigDecimal(123));
  });

  it("attributes not backed by database columns keep their type when a default value is configured separately", () => {
    class Child extends OverloadedType {
      static {
        this.attribute("non_existent_decimal", { default: "123" });
      }
    }

    expect(Child.typeForAttribute("non_existent_decimal")).toEqual(
      OverloadedType.typeForAttribute("non_existent_decimal"),
    );
    expect(new Child().non_existent_decimal).toEqual(new BigDecimal(123));
  });

  it("attributes not backed by database columns properly interact with mutation and dirty", async () => {
    class Child extends Base {
      static {
        this.tableName = "topics";
        this.attribute("foo", "string", { default: "lol" });
        registerModel(this);
      }
    }
    await Child.create();
    const model = (await Child.last())!;

    expect((model as any).foo).toBe("lol");

    (model as any).foo = (model as any).foo + "asdf";
    expect((model as any).foo).toBe("lolasdf");
    expect((model as any).fooChanged()).toBe(true);

    await model.reload();
    expect((model as any).foo).toBe("lol");

    (model as any).foo = "lol";
    expect(model.isChanged).toBe(false);
  });

  it("attributes not backed by database columns appear in inspect", () => {
    const inspection = (new OverloadedType() as any).fullInspect() as string;

    expect(inspection).toContain("non_existent_decimal");
  });

  it("attributes do not require a type", () => {
    class Klass extends OverloadedType {
      static {
        this.attribute("no_type", new ValueType());
      }
    }
    expect((new Klass({ no_type: 1 } as any) as any).no_type).toBe(1);
    expect((new Klass({ no_type: "foo" } as any) as any).no_type).toBe("foo");
  });

  it("attributes do not require a connection is established", () => {
    class Klass extends OverloadedType {
      static {
        this.attribute("foo", "string");
      }
    }
    expect(Klass).toBeDefined();
  });

  it("unknown type error is raised", () => {
    expect(() => OverloadedType.attribute("foo", "unknown")).toThrow();
  });

  it("immutable_strings_by_default changes schema inference for string columns", async () => {
    await withImmutableStrings(() => {
      const immutableStringType = typeRegistry.lookup("immutable_string").constructor;
      expect(OverloadedType.typeForAttribute("inferred_string")!.constructor).toBe(
        immutableStringType,
      );
    });
  });

  it("immutable_strings_by_default retains limit information", async () => {
    await withImmutableStrings(() => {
      expect(OverloadedType.typeForAttribute("inferred_string")!.limit).toBe(255);
    });
  });

  it("immutable_strings_by_default does not affect `attribute :foo, :string`", async () => {
    await withImmutableStrings(() => {
      const defaultStringType = typeRegistry.lookup("string").constructor;
      expect(OverloadedType.typeForAttribute("string_with_default")!.constructor).toBe(
        defaultStringType,
      );
    });
  });

  it("serialize boolean for both string types", () => {
    const defaultStringType = typeRegistry.lookup("string");
    const immutableStringType = typeRegistry.lookup("immutable_string");
    expect(defaultStringType.serialize(true)).toBe(immutableStringType.serialize(true));
    expect(defaultStringType.serialize(false)).toBe(immutableStringType.serialize(false));
  });
});

describe("DefineAttributeTest", () => {
  it("define_attribute registers a type object directly", () => {
    const intType = typeRegistry.lookup("integer");
    class Post extends Base {
      declare status: string;
      static {
        this.defineAttribute("score", intType);
      }
    }
    const p = new Post({ score: "42" });
    expect(p.readAttribute("score")).toBe(42);
  });

  it("define_attribute with default value", () => {
    const intType = typeRegistry.lookup("integer");
    class Post extends Base {
      declare status: string;
      static {
        this.defineAttribute("rating", intType, { default: 5 });
      }
    }
    const p = new Post({});
    expect(p.readAttribute("rating")).toBe(5);
  });

  it("define_attribute preserves existing default when no default given", () => {
    const strType = typeRegistry.lookup("string");
    const intType = typeRegistry.lookup("integer");
    class Post extends Base {
      declare status: string;
      static {
        this.defineAttribute("score", strType, { default: "10" });
        this.defineAttribute("score", intType);
      }
    }
    const p = new Post({});
    expect(p.readAttribute("score")).toBe(10);
  });

  it("define_attribute with userProvidedDefault false uses database cast", () => {
    const intType = typeRegistry.lookup("integer");
    class Post extends Base {
      declare status: string;
      static {
        this.defineAttribute("views", intType, { default: "0", userProvidedDefault: false });
      }
    }
    const p = new Post({});
    expect(p.readAttribute("views")).toBe(0);
  });

  it("define_attribute builds a UserProvidedDefault when the default is user-provided", () => {
    const intType = typeRegistry.lookup("integer");
    class Post extends Base {
      declare status: string;
      static {
        this.defineAttribute("score", intType, { default: "5" });
      }
    }
    expect(Post._defaultAttributes().getAttribute("score")).toBeInstanceOf(UserProvidedDefault);
    expect(Post._defaultAttributes().getAttribute("score").originalAttribute).toBeNull();
  });

  it("define_attribute writes into the memoized _defaultAttributes", () => {
    const strType = typeRegistry.lookup("string");
    const intType = typeRegistry.lookup("integer");
    class Post extends Base {
      declare status: string;
      static {
        this.defineAttribute("score", strType);
      }
    }
    const before = Post._defaultAttributes();
    Post.defineAttribute("score", intType);
    expect(Post._defaultAttributes()).toBe(before);
    expect(before.getAttribute("score").type!.type()).toBe("integer");
    expect(Post.typeForAttribute("score")!.type()).toBe("integer");
  });
});

describe("DefaultAttributesTest", () => {
  it("_default_attributes returns an AttributeSet", () => {
    class Post extends Base {
      declare status: string;
      static {
        this.attribute("title", "string");
      }
    }
    const defaults = Post._defaultAttributes();
    expect(typeof defaults.fetchValue).toBe("function");
  });

  it("_default_attributes includes declared attributes", () => {
    class Post extends Base {
      declare status: string;
      static {
        this.attribute("title", "string", { default: "Untitled" });
      }
    }
    const defaults = Post._defaultAttributes();
    expect(defaults.fetchValue("title")).toBe("Untitled");
  });

  it("_default_attributes is cached", () => {
    class Post extends Base {
      declare status: string;
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post._defaultAttributes()).toBe(Post._defaultAttributes());
  });

  it("_default_attributes cache is invalidated when attribute is defined", () => {
    class Post extends Base {
      declare status: string;
      static {
        this.attribute("title", "string");
      }
    }
    const first = Post._defaultAttributes();
    Post.attribute("body", "string");
    const second = Post._defaultAttributes();
    expect(first).not.toBe(second);
    expect(second.fetchValue("body")).toBeNull();
  });

  it("new record attributes are seeded from _default_attributes", () => {
    class Post extends Base {
      declare status: string;
      static {
        this.attribute("status", "string", { default: "draft" });
      }
    }
    const p = new Post({});
    expect(p.status).toBe("draft");
  });

  it("_defaultAttributes seeds schema columns via fromDatabase then replays user pending queue", () => {
    class Post extends Base {
      declare status: string;
    }
    Post.attribute("title", "string", { default: "untitled" });
    (Post as unknown as { _columnsHash?: Record<string, unknown> })._columnsHash = {
      views: { name: "views", default: 0 },
    };

    const defaults = Post._defaultAttributes();
    expect(defaults.getAttribute("views").value).toBe(0);
    expect(defaults.getAttribute("title").value).toBe("untitled");
  });

  it("user attribute() declaration overrides schema column type via pending queue", () => {
    class Post extends Base {
      declare status: string;
    }
    Post.attribute("score", "string");
    (Post as unknown as { _columnsHash?: Record<string, unknown> })._columnsHash = {
      score: { name: "score", default: 0 },
    };

    const defaults = Post._defaultAttributes();
    expect(defaults.getAttribute("score").type!.type()).toBe("string");
  });

  it("resetDefaultAttributes reloads the schema from cache", () => {
    class Post extends Base {
      declare status: string;
    }
    (Post as unknown as { _columnsHash?: Record<string, unknown> })._columnsHash = {
      score: { name: "score", default: 5 },
    };
    (Post as unknown as { _schemaLoaded?: boolean })._schemaLoaded = true;

    Post.resetDefaultAttributes();

    expect((Post as unknown as { _columnsHash?: unknown })._columnsHash).toBeUndefined();
    expect((Post as unknown as { _schemaLoaded?: boolean })._schemaLoaded).toBe(false);
  });

  it("attribute() overriding only type preserves the schema default", () => {
    class Post extends Base {
      declare status: string;
    }
    Post.attribute("score", "string");
    (Post as unknown as { _columnsHash?: Record<string, unknown> })._columnsHash = {
      score: { name: "score", default: 5 },
    };

    const defaults = Post._defaultAttributes();
    expect(defaults.getAttribute("score").type!.type()).toBe("string");
    expect(defaults.getAttribute("score").value).toBe("5");
  });
});

describe("DefineAttributeSTITest", () => {
  it("defineAttribute on STI subclass stays on the subclass", () => {
    const intType = typeRegistry.lookup("integer");
    class Animal extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("type", "string");
        (this as any)._inheritanceColumn = "type";
      }
    }
    class Dog extends (Animal as any) {}
    (Dog as any).defineAttribute("legs", intType, { default: 4 });
    expect((Dog as any)._defaultAttributes().isKey("legs")).toBe(true);
    expect((Animal as any)._defaultAttributes().isKey("legs")).toBe(false);
    const d = new (Dog as any)({});
    expect(d.readAttribute("legs")).toBe(4);
  });

  it("_defaultAttributes is memoized per class, not shared with the STI base", () => {
    class Vehicle extends Base {
      static {
        this.attribute("speed", "integer", { default: 60 });
      }
    }
    class Car extends (Vehicle as any) {}
    const baseDefaults = (Vehicle as any)._defaultAttributes();
    const subDefaults = (Car as any)._defaultAttributes();
    expect(subDefaults).not.toBe(baseDefaults);
    expect(subDefaults.keys()).toEqual(baseDefaults.keys());
    expect(subDefaults.fetchValue("speed")).toBe(60);
  });

  it("defineAttribute for id does not install an accessor", () => {
    const strType = typeRegistry.lookup("string");
    class Post extends Base {
      declare status: string;
      static {
        this.attribute("title", "string");
      }
    }
    Post.defineAttribute("id", strType);
    const ownDesc = Object.getOwnPropertyDescriptor(Post.prototype, "id");
    expect(ownDesc).toBeUndefined();
  });
});

describe("ResetDefaultAttributesCascadeTest", () => {
  it("adding an attribute to a superclass invalidates an AR subclass _defaultAttributes cache", () => {
    class Post extends Base {
      declare status: string;
      static {
        this.attribute("title", "string");
      }
    }
    class SpecialPost extends (Post as any) {}

    const before = (SpecialPost as any)._defaultAttributes();
    expect(before.keys()).toContain("title");
    expect(before.keys()).not.toContain("score");

    Post.attribute("score", "integer", { default: 0 });

    const after = (SpecialPost as any)._defaultAttributes();
    expect(after.keys()).toContain("score");
    expect(after.getAttribute("score").value).toBe(0);
  });
});
