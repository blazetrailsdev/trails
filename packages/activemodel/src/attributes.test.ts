/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side, and a generated attribute member is an
   accessor pair (CLAUDE.md § "Generated attribute readers are properties"). */
import { describe, it, expect } from "vitest";
import {
  BigDecimal,
  assertNothingRaised,
  assertRaise,
  include,
  assertNil,
} from "@blazetrails/activesupport";
import { Date as RubyDate, type Temporal } from "@blazetrails/date";
import { ArgumentError, FrozenError } from "@blazetrails/ruby-compat";
import { Model } from "./index.js";
import { UnknownAttributeError } from "./errors.js";
import {
  Attributes,
  type AttributeMethodsClassHalf,
  type AttributesClassHalf,
} from "./attributes.js";
import { AttributeMethods } from "./attribute-methods.js";
import { StringType } from "./type/string.js";

describe("AttributesTest", () => {
  class ModelForAttributesTest extends Model {
    declare static aliasAttribute: AttributesClassHalf["aliasAttribute"];
    declare static attribute: AttributesClassHalf["attribute"];
    declare static attributeNames: AttributesClassHalf["attributeNames"];
    declare static attributeTypes: AttributesClassHalf["attributeTypes"];
    declare static typeForAttribute: AttributesClassHalf["typeForAttribute"];

    static {
      include(this, Attributes);
      this.attribute("integer_field", "integer");
      this.attribute("string_field", "string");
      this.attribute("decimal_field", "decimal");
      this.attribute("string_with_default", "string", { default: "default string" });
      this.attribute("date_field", "date", { default: () => new RubyDate(2016, 1, 1) });
      this.attribute("boolean_field", "boolean");
    }
  }
  interface ModelForAttributesTest extends Attributes {
    get integer_field(): number | null;
    set integer_field(value: unknown);
    get string_field(): string | null;
    set string_field(value: unknown);
    get decimal_field(): BigDecimal | null;
    set decimal_field(value: unknown);
    get string_with_default(): string | null;
    set string_with_default(value: unknown);
    get date_field(): Temporal.PlainDate | null;
    set date_field(value: unknown);
    get boolean_field(): boolean | null;
    set boolean_field(value: unknown);
  }

  class ChildModelForAttributesTest extends ModelForAttributesTest {}

  class GrandchildModelForAttributesTest extends ChildModelForAttributesTest {
    static {
      this.attribute("integer_field", "string");
      this.attribute("string_field", { default: "default string" });
    }
  }

  class ModelWithGeneratedAttributeMethods {
    declare static attribute: AttributesClassHalf["attribute"];

    static {
      include(this, Attributes);
      this.attribute("foo");
    }
  }
  interface ModelWithGeneratedAttributeMethods extends Attributes {}

  class ModelWithProxiedAttributeMethods {
    declare static attributeMethodSuffix: AttributeMethodsClassHalf["attributeMethodSuffix"];
    declare static defineAttributeMethod: AttributeMethodsClassHalf["defineAttributeMethod"];

    static {
      include(this, AttributeMethods);

      this.attributeMethodSuffix("=");

      this.defineAttributeMethod("foo");
    }

    "attribute="(_: string, __: unknown): void {}
  }
  interface ModelWithProxiedAttributeMethods {
    set foo(value: unknown);
  }

  it("models that proxy attributes do not conflict with models with generated methods", async () => {
    new ModelWithGeneratedAttributeMethods();

    const model = new ModelWithProxiedAttributeMethods();

    await assertNothingRaised(() => {
      model.foo = "foo";
    });
  });

  it("properties assignment", () => {
    const data = new ModelForAttributesTest({
      integer_field: "2.3",
      string_field: "Rails FTW",
      decimal_field: "12.3",
      boolean_field: "0",
    });

    expect(data.integer_field).toEqual(2);
    expect(data.string_field).toEqual("Rails FTW");
    expect(data.decimal_field).toEqual(new BigDecimal("12.3"));
    expect(data.string_with_default).toEqual("default string");
    expect(data.date_field).toEqual(new RubyDate(2016, 1, 1));
    expect(data.boolean_field).toEqual(false);

    data.integer_field = 10;
    data.string_with_default = null;
    data.boolean_field = "1";

    expect(data.integer_field).toEqual(10);
    assertNil(data.string_with_default);
    expect(data.boolean_field).toEqual(true);
  });

  it("reading attributes", () => {
    const data = new ModelForAttributesTest({
      integer_field: 1.1,
      string_field: 1.1,
      decimal_field: 1.1,
      boolean_field: 1.1,
    });

    const expectedAttributes = {
      integer_field: 1,
      string_field: "1.1",
      decimal_field: new BigDecimal("1.1"),
      string_with_default: "default string",
      date_field: new RubyDate(2016, 1, 1),
      boolean_field: true,
    };

    expect(data.attributes).toEqual(expectedAttributes);
  });

  it("reading attribute names", () => {
    const names = [
      "integer_field",
      "string_field",
      "decimal_field",
      "string_with_default",
      "date_field",
      "boolean_field",
    ];

    expect(ModelForAttributesTest.attributeNames()).toEqual(names);
    expect(new ModelForAttributesTest().attributeNames()).toEqual(names);
  });

  it("nonexistent attribute", async () => {
    await assertRaise([UnknownAttributeError], {}, () => {
      new ModelForAttributesTest({ nonexistent: "nonexistent" });
    });
  });

  it("children inherit attributes", () => {
    const data = new ChildModelForAttributesTest({ integer_field: "4.4" });

    expect(data.integer_field).toEqual(4);
  });

  it("children can override parents", () => {
    const klass = GrandchildModelForAttributesTest;

    expect(klass.attributeTypes()["integer_field"]).toBeInstanceOf(StringType);
    expect(klass.attributeTypes()["string_field"]).toBeInstanceOf(StringType);

    const data = new GrandchildModelForAttributesTest({ integer_field: "4.4" });

    expect(data.integer_field).toEqual("4.4");
    expect(data.string_field).toEqual("default string");
  });

  it.skip("attributes with proc defaults can be marshalled", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/parity/unported-files/unscoped.ts) — marshal
  });

  it("attributes can be dup-ed", () => {
    const data = new ModelForAttributesTest();
    data.integer_field = 1;

    const duped = (data as unknown as { dup(): ModelForAttributesTest }).dup();

    expect(data.integer_field).toEqual(1);
    expect(duped.integer_field).toEqual(1);

    duped.integer_field = 2;

    expect(data.integer_field).toEqual(1);
    expect(duped.integer_field).toEqual(2);
  });

  it("can't modify attributes if frozen", async () => {
    const data = new ModelForAttributesTest();
    data.freeze();
    expect(Object.isFrozen(data)).toBeTruthy();
    await assertRaise([FrozenError], {}, () => {
      data.integer_field = 1;
    });
  });

  it("attributes can be frozen again", async () => {
    const data = new ModelForAttributesTest();
    data.freeze();
    await assertNothingRaised(() => data.freeze());
  });

  it("unknown type error is raised", async () => {
    await assertRaise([ArgumentError], {}, () => {
      ModelForAttributesTest.attribute("foo", "unknown");
    });
  });

  it(".type_for_attribute supports attribute aliases", () => {
    const withAlias = class extends ModelForAttributesTest {
      static {
        this.aliasAttribute("integer_field", "x");
      }
    };

    expect(withAlias.typeForAttribute("integer_field")).toEqual(withAlias.typeForAttribute("x"));
  });
});
