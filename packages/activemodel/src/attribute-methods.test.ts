/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::AttributeMethods` in its class body, the way the
   Rails test model it mirrors does (attribute_methods_test.rb:5-104); the class/interface merge
   beside it is how `include()` surfaces those members and the generated methods on the type side. */
import { describe, it, expect } from "vitest";
import {
  assertNotRespondTo,
  assertRaises,
  assertRespondTo,
  include,
} from "@blazetrails/activesupport";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import { NoMethodError } from "./attribute-assignment.js";
import {
  AttributeMethods,
  type AttributeMethodHost,
  type InstanceMethodsHost,
} from "./attribute-methods.js";
import type { AttributeMethodsClassHalf } from "./attributes.js";

type Host = Omit<InstanceMethodsHost, "attributes" | "constructor">;

class ModelWithAttributes {
  declare static aliasAttribute: AttributeMethodsClassHalf["aliasAttribute"];
  declare static attributeAliases: AttributeMethodHost["attributeAliases"];
  declare static attributeMethodPatterns: AttributeMethodHost["attributeMethodPatterns"];
  declare static defineAttributeMethod: AttributeMethodsClassHalf["defineAttributeMethod"];
  declare static defineAttributeMethods: AttributeMethodsClassHalf["defineAttributeMethods"];
  declare static generatedAttributeMethods: AttributeMethodsClassHalf["generatedAttributeMethods"];
  declare static undefineAttributeMethods: AttributeMethodsClassHalf["undefineAttributeMethods"];

  static {
    include(this, AttributeMethods);
  }

  static bar(): string {
    return "original bar";
  }

  attributes(): Record<string, unknown> {
    return { foo: "value of foo", baz: "value of baz" };
  }

  private attribute(name: string): unknown {
    return this.attributes()[name];
  }
}
interface ModelWithAttributes extends Host {
  foo(): unknown;
  baz(): unknown;
}

class ModelWithAttributes2 {
  declare static attributeMethodPatterns: AttributeMethodHost["attributeMethodPatterns"];
  declare static attributeMethodSuffix: AttributeMethodsClassHalf["attributeMethodSuffix"];
  declare static defineAttributeMethods: AttributeMethodsClassHalf["defineAttributeMethods"];
  declare static undefineAttributeMethods: AttributeMethodsClassHalf["undefineAttributeMethods"];

  static {
    include(this, AttributeMethods);
    this.attributeMethodSuffix("_test", "_kw");
  }

  attributes: Record<string, unknown> = {};

  private attribute(name: string): unknown {
    return this.attributes[name];
  }

  private attribute_test(name: string, attrs: Record<string, unknown> = {}): unknown {
    return (attrs[name] = this.attribute(name));
  }

  private attribute_kw(name: string, { kw: _kw = 1 }: { kw?: number } = {}): unknown {
    return this.attribute(name);
  }

  private private_method(): string {
    return "<3 <3";
  }

  protected protected_method(): string {
    return "O_o O_o";
  }
}
interface ModelWithAttributes2 extends Host {
  foo(): unknown;
  foo_kw(options?: { kw?: number }): unknown;
  foo_test(attrs?: Record<string, unknown>): unknown;
}

class ModelWithAttributesWithSpaces {
  declare static aliasAttribute: AttributeMethodsClassHalf["aliasAttribute"];
  declare static defineAttributeMethods: AttributeMethodsClassHalf["defineAttributeMethods"];
  declare static undefineAttributeMethods: AttributeMethodsClassHalf["undefineAttributeMethods"];

  static {
    include(this, AttributeMethods);
  }

  attributes(): Record<string, unknown> {
    return { "foo bar": "value of foo bar" };
  }

  private attribute(name: string): unknown {
    return this.attributes()[name];
  }
}
interface ModelWithAttributesWithSpaces extends Host {
  "foo bar"(): unknown;
  foo_bar(): unknown;
}

class ModelWithWeirdNamesAttributes {
  declare static defineAttributeMethod: AttributeMethodsClassHalf["defineAttributeMethod"];
  declare static undefineAttributeMethods: AttributeMethodsClassHalf["undefineAttributeMethods"];

  static {
    include(this, AttributeMethods);
  }

  static "c?d"(): string {
    return "original c?d";
  }

  attributes(): Record<string, unknown> {
    return { "a?b": "value of a?b" };
  }

  private attribute(name: string): unknown {
    return this.attributes()[name];
  }
}
interface ModelWithWeirdNamesAttributes extends Host {
  "a?b"(): unknown;
}

class ModelWithRubyKeywordNamedAttributes {
  declare static aliasAttribute: AttributeMethodsClassHalf["aliasAttribute"];
  declare static defineAttributeMethods: AttributeMethodsClassHalf["defineAttributeMethods"];
  declare static undefineAttributeMethods: AttributeMethodsClassHalf["undefineAttributeMethods"];

  static {
    include(this, AttributeMethods);
  }

  attributes(): Record<string, unknown> {
    return { begin: "value of begin", end: "value of end" };
  }

  private attribute(name: string): unknown {
    return this.attributes()[name];
  }
}
interface ModelWithRubyKeywordNamedAttributes extends Host {
  from(): unknown;
  to(): unknown;
}

class ModelWithoutAttributesMethod {
  static {
    include(this, AttributeMethods);
  }
}
interface ModelWithoutAttributesMethod extends Host {}

describe("AttributeMethodsTest", () => {
  it("method missing works correctly even if attributes method is not defined", async () => {
    await assertRaises([NoMethodError], {}, () =>
      new ModelWithoutAttributesMethod().methodMissing("foo"),
    );
  });

  it("unrelated classes should not share attribute method matchers", () => {
    expect(ModelWithAttributes.attributeMethodPatterns).not.toEqual(
      ModelWithAttributes2.attributeMethodPatterns,
    );
  });

  it("#define_attribute_method generates attribute method", () => {
    try {
      ModelWithAttributes.defineAttributeMethod("foo");

      assertRespondTo(new ModelWithAttributes(), "foo");
      expect(new ModelWithAttributes().foo()).toEqual("value of foo");
    } finally {
      ModelWithAttributes.undefineAttributeMethods();
    }
  });

  it("#define_attribute_methods defines alias attribute methods after undefining", () => {
    class topic_class {
      declare static aliasAttribute: AttributeMethodsClassHalf["aliasAttribute"];
      declare static defineAttributeMethods: AttributeMethodsClassHalf["defineAttributeMethods"];
      declare static undefineAttributeMethods: AttributeMethodsClassHalf["undefineAttributeMethods"];

      static {
        include(this, AttributeMethods);
        this.defineAttributeMethods("title");
        this.aliasAttribute("aliased_title_to_be_redefined", "title");
      }

      attributes(): Record<string, unknown> {
        return { title: "Active Model Topic" };
      }

      private attribute(name: string): unknown {
        return this.attributes()[name];
      }
    }
    interface topic_class extends Host {
      aliased_title_to_be_redefined(): unknown;
    }

    const topic = new topic_class();
    expect(topic.aliased_title_to_be_redefined()).toEqual("Active Model Topic");
    topic_class.undefineAttributeMethods();

    assertNotRespondTo(topic, "aliased_title_to_be_redefined");

    topic_class.defineAttributeMethods("title");

    assertRespondTo(topic, "aliased_title_to_be_redefined");
    expect(topic.aliased_title_to_be_redefined()).toEqual("Active Model Topic");
  });

  it("#define_attribute_method does not generate attribute method if already defined in attribute module", () => {
    class klass extends ModelWithAttributes {}
    klass.generatedAttributeMethods().moduleEval((mod) => {
      Object.defineProperty(mod, "foo", {
        value: () => "<3",
        writable: true,
        configurable: true,
      });
    });
    klass.defineAttributeMethod("foo");

    expect(new klass().foo()).toEqual("<3");
  });

  it("#define_attribute_method generates a method that is already defined on the host", () => {
    class klass extends ModelWithAttributes {
      override foo(): unknown {
        return super.foo();
      }
    }
    klass.defineAttributeMethod("foo");

    expect(new klass().foo()).toEqual("value of foo");
  });

  it("#define_attribute_method generates attribute method with invalid identifier characters", () => {
    try {
      ModelWithWeirdNamesAttributes.defineAttributeMethod("a?b");

      assertRespondTo(new ModelWithWeirdNamesAttributes(), "a?b");
      expect(new ModelWithWeirdNamesAttributes()["a?b"]()).toEqual("value of a?b");
    } finally {
      ModelWithWeirdNamesAttributes.undefineAttributeMethods();
    }
  });

  it("#define_attribute_methods works passing multiple arguments", () => {
    try {
      ModelWithAttributes.defineAttributeMethods("foo", "baz");

      expect(new ModelWithAttributes().foo()).toEqual("value of foo");
      expect(new ModelWithAttributes().baz()).toEqual("value of baz");
    } finally {
      ModelWithAttributes.undefineAttributeMethods();
    }
  });

  it("#define_attribute_methods generates attribute methods", () => {
    try {
      ModelWithAttributes.defineAttributeMethods("foo");

      assertRespondTo(new ModelWithAttributes(), "foo");
      expect(new ModelWithAttributes().foo()).toEqual("value of foo");
    } finally {
      ModelWithAttributes.undefineAttributeMethods();
    }
  });

  it("#alias_attribute generates attribute_aliases lookup hash", () => {
    class klass extends ModelWithAttributes {
      static {
        this.defineAttributeMethods("foo");
        this.aliasAttribute("bar", "foo");
      }
    }

    expect(klass.attributeAliases).toEqual({ bar: "foo" });
  });

  it("#define_attribute_methods generates attribute methods with spaces in their names", () => {
    try {
      ModelWithAttributesWithSpaces.defineAttributeMethods("foo bar");

      assertRespondTo(new ModelWithAttributesWithSpaces(), "foo bar");
      expect(new ModelWithAttributesWithSpaces()["foo bar"]()).toEqual("value of foo bar");
    } finally {
      ModelWithAttributesWithSpaces.undefineAttributeMethods();
    }
  });

  it("#alias_attribute works with attributes with spaces in their names", () => {
    try {
      ModelWithAttributesWithSpaces.defineAttributeMethods("foo bar");
      ModelWithAttributesWithSpaces.aliasAttribute("foo_bar", "foo bar");

      expect(new ModelWithAttributesWithSpaces().foo_bar()).toEqual("value of foo bar");
    } finally {
      ModelWithAttributesWithSpaces.undefineAttributeMethods();
    }
  });

  it("#alias_attribute works with attributes named as a ruby keyword", () => {
    try {
      ModelWithRubyKeywordNamedAttributes.defineAttributeMethods("begin", "end");
      ModelWithRubyKeywordNamedAttributes.aliasAttribute("from", "begin");
      ModelWithRubyKeywordNamedAttributes.aliasAttribute("to", "end");

      expect(new ModelWithRubyKeywordNamedAttributes().from()).toEqual("value of begin");
      expect(new ModelWithRubyKeywordNamedAttributes().to()).toEqual("value of end");
    } finally {
      ModelWithRubyKeywordNamedAttributes.undefineAttributeMethods();
    }
  });

  it("#undefine_attribute_methods removes attribute methods", async () => {
    ModelWithAttributes.defineAttributeMethods("foo");
    ModelWithAttributes.undefineAttributeMethods();

    assertNotRespondTo(new ModelWithAttributes(), "foo");
    await assertRaises([NoMethodError], {}, () => new ModelWithAttributes().methodMissing("foo"));
  });

  it("#undefine_attribute_methods undefines alias attribute methods", async () => {
    class topic_class {
      declare static aliasAttribute: AttributeMethodsClassHalf["aliasAttribute"];
      declare static defineAttributeMethods: AttributeMethodsClassHalf["defineAttributeMethods"];
      declare static undefineAttributeMethods: AttributeMethodsClassHalf["undefineAttributeMethods"];

      static {
        include(this, AttributeMethods);
        this.defineAttributeMethods("title");
        this.aliasAttribute("subject_to_be_undefined", "title");
      }

      attributes(): Record<string, unknown> {
        return { title: "Active Model Topic" };
      }

      private attribute(name: string): unknown {
        return this.attributes()[name];
      }
    }
    interface topic_class extends Host {
      subject_to_be_undefined(): unknown;
    }

    expect(new topic_class().subject_to_be_undefined()).toEqual("Active Model Topic");
    topic_class.undefineAttributeMethods();

    await assertRaises(
      [NoMethodError],
      { match: /undefined method [`']subject_to_be_undefined'/ },
      () => new topic_class().methodMissing("subject_to_be_undefined"),
    );
  });

  it("accessing a suffixed attribute", () => {
    const m = new ModelWithAttributes2();
    m.attributes = { foo: "bar" };
    const attrs: Record<string, unknown> = {};

    expect(m.methodMissing("foo")).toEqual("bar");
    expect(m.methodMissing("foo_kw", { kw: 2 })).toEqual("bar");
    expect(m.methodMissing("foo_test", attrs)).toEqual("bar");
    expect(attrs["foo"]).toEqual("bar");
  });

  it("defined attribute doesn't expand positional hash argument", () => {
    try {
      ModelWithAttributes2.defineAttributeMethods("foo");

      const m = new ModelWithAttributes2();
      m.attributes = { foo: "bar" };
      const attrs: Record<string, unknown> = {};

      expect(m.foo()).toEqual("bar");
      expect(m.foo_kw({ kw: 2 })).toEqual("bar");
      expect(m.foo_test(attrs)).toEqual("bar");
      expect(attrs["foo"]).toEqual("bar");
    } finally {
      ModelWithAttributes2.undefineAttributeMethods();
    }
  });

  it("should not interfere with method_missing if the attr has a private/protected method", async () => {
    const m = new ModelWithAttributes2();
    m.attributes = { private_method: "<3", protected_method: "O_o" };

    expect(m["private_method"]()).toEqual("<3 <3");
    expect(m["protected_method"]()).toEqual("O_o O_o");

    await assertRaises([NoMethodError], {}, () => m.methodMissing("private_method"));
    await assertRaises([NoMethodError], {}, () => m.methodMissing("protected_method"));
  });

  class ClassWithProtected {
    protected protected_method(): void {}
  }

  it.skip("should not interfere with respond_to? if the attribute has a private/protected method", () => {
    // BLOCKED: activemodel-respond-to-cannot-hide-private-methods
    const m = new ModelWithAttributes2();
    m.attributes = { private_method: "<3", protected_method: "O_o" };

    assertNotRespondTo(m, "private_method");
    expect(m.respondTo("private_method", true)).toBeTruthy();

    const c = new ClassWithProtected();

    expect(m.respondTo("protected_method")).toEqual(rbObjRespondTo(c, "protected_method"));
    expect(m.respondTo("protected_method", true)).toBeTruthy();
  });

  it("should use attribute_missing to dispatch a missing attribute", () => {
    const m = new ModelWithAttributes2();
    m.attributes = { foo: "bar" };

    m.attributeMissing = (match) => match;

    const match = m.methodMissing("foo_test") as { attrName: string; proxyTarget: string };

    expect(match.attrName).toEqual("foo");
    expect(match.proxyTarget).toEqual("attribute_test");
  });

  class Model1 {
    declare static attributeMethodSuffix: AttributeMethodsClassHalf["attributeMethodSuffix"];
    declare static defineAttributeMethods: AttributeMethodsClassHalf["defineAttributeMethods"];

    static {
      include(this, AttributeMethods);
      this.attributeMethodSuffix("_changed?");
      this.defineAttributeMethods("x");
    }

    x: unknown;

    private "attribute_changed?"(_name: string): string {
      return ":model_1";
    }
  }
  interface Model1 extends Host {
    "x_changed?"(): unknown;
  }

  class Model2 {
    declare static attributeMethodSuffix: AttributeMethodsClassHalf["attributeMethodSuffix"];
    declare static defineAttributeMethods: AttributeMethodsClassHalf["defineAttributeMethods"];

    static {
      include(this, AttributeMethods);
      this.attributeMethodSuffix("?");
      this.defineAttributeMethods("x_changed");
    }

    x_changed: unknown;

    private "attribute?"(_name: string): string {
      return ":model_2";
    }
  }
  interface Model2 extends Host {
    "x_changed?"(): unknown;
  }

  it("name clashes are handled", () => {
    expect(new Model1()["x_changed?"]()).toEqual(":model_1");
    expect(new Model2()["x_changed?"]()).toEqual(":model_2");
  });

  it("alias attribute respects user defined method", () => {
    class model {
      declare static aliasAttribute: AttributeMethodsClassHalf["aliasAttribute"];
      declare static defineAttributeMethods: AttributeMethodsClassHalf["defineAttributeMethods"];

      static {
        include(this, AttributeMethods);
        this.defineAttributeMethods("name");
        this.aliasAttribute("nickname", "name");
      }

      name: unknown;

      constructor(name: unknown) {
        this.name = name;
      }
    }
    interface model extends Host {
      nickname(): unknown;
    }

    const instance = new model("George");
    expect(instance.name).toEqual("George");
    expect(instance.nickname()).toEqual("George");
  });

  it("alias attribute respects user defined method in parent classes", () => {
    class model {
      declare static aliasAttribute: AttributeMethodsClassHalf["aliasAttribute"];
      declare static defineAttributeMethods: AttributeMethodsClassHalf["defineAttributeMethods"];

      static {
        include(this, AttributeMethods);
        this.defineAttributeMethods("name");
      }

      name: unknown;

      constructor(name: unknown) {
        this.name = name;
      }
    }

    class subclass extends model {
      static {
        this.aliasAttribute("nickname", "name");
      }
    }
    interface subclass extends Host {
      nickname(): unknown;
    }

    const instance = new subclass("George");
    expect(instance.name).toEqual("George");
    expect(instance.nickname()).toEqual("George");
  });
});
