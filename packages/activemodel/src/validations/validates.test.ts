/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { Model } from "../index.js";
import { Attributes, type AttributesClassHalf } from "../attributes.js";
import { include } from "@blazetrails/activesupport";

describe("ValidatesTest", () => {
  it("validates with messages empty", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "test" });
    await p.isValid();
    expect(p.errors.count).toBe(0);
  });

  it("validates with attribute specified as string", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    await p.isValid();
    expect(p.errors.count).toBeGreaterThan(0);
  });

  it("validates with unless shared conditions", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validates("name", {
          presence: true,
          unless: () => true,
        });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    expect(await p.isValid()).toBe(true);
  });

  it("validates with regexp", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("email", "string");
        this.validates("email", { format: { with: /@/ } });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ email: "invalid" });
    await p.isValid();
    expect(p.errors.count).toBeGreaterThan(0);
  });

  it("validates with array", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("role", "string");
        this.validates("role", { inclusion: { in: ["admin", "user"] } });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ role: "admin" });
    expect(await p.isValid()).toBe(true);
  });

  it("validates with range", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("age", "integer");
        this.validates("age", { numericality: { greaterThan: 0, lessThan: 150 } });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ age: 25 });
    expect(await p.isValid()).toBe(true);
  });

  it("validates with included validator", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }
    }
    interface Person extends Attributes {}

    expect(Person.validators().length).toBeGreaterThan(0);
  });

  it("validates with included validator and options", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validates("name", { length: { minimum: 2 } });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "A" });
    await p.isValid();
    expect(p.errors.count).toBeGreaterThan(0);
  });

  it("validates with included validator and wildcard shortcut", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }
    }
    interface Person extends Attributes {}

    expect(Person.validators().length).toBeGreaterThan(0);
  });

  it("defining extra default keys for validates", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validates("name", { presence: true, on: "create" });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    expect(await p.isValid()).toBe(true);
  });

  it("validates with built in validation", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("title", "string");
        this.validates("title", { presence: true });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({}).isValid()).toBe(false);
    expect(await new Person({ title: "Hello" }).isValid()).toBe(true);
  });

  it("validates with built in validation and options", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("title", "string");
        this.validates("title", { presence: true, length: { minimum: 3 } });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({}).isValid()).toBe(false);
    expect(await new Person({ title: "ab" }).isValid()).toBe(false);
    expect(await new Person({ title: "abc" }).isValid()).toBe(true);
  });

  it("validates with if as local conditions", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attribute("active", "boolean");
        this.validates("name", {
          presence: true,
          if: (r: any) => r._readAttribute("active") === true,
        });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({ active: false }).isValid()).toBe(true);
    expect(await new Person({ active: true }).isValid()).toBe(false);
  });

  it("validates with unless as local conditions", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attribute("skip", "boolean");
        this.validates("name", {
          presence: true,
          unless: (r: any) => r._readAttribute("skip") === true,
        });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({ skip: true }).isValid()).toBe(true);
    expect(await new Person({ skip: false }).isValid()).toBe(false);
  });

  it("validates with validator class", async () => {
    class MyValidator {
      validate(record: any) {
        if (!record._readAttribute("name")) {
          record.errors.add("name", ":blank", { message: "must be present" });
        }
      }
    }
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validatesWith(MyValidator);
      }
    }
    interface Person extends Attributes {}

    const p = new Person();
    expect(await p.isValid()).toBe(false);
    expect(p.errors.messagesFor("name")).toEqual(["must be present"]);
  });

  it("validates with namespaced validator class", async () => {
    const Validators = {
      NameValidator: class {
        validate(record: any) {
          if (!record._readAttribute("name")) {
            record.errors.add("name", ":blank", { message: "is required" });
          }
        }
      },
    };
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validatesWith(Validators.NameValidator);
      }
    }
    interface Person extends Attributes {}

    const p = new Person();
    expect(await p.isValid()).toBe(false);
    expect(p.errors.messagesFor("name")).toEqual(["is required"]);
  });

  it("validates with unknown validator", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    expect(() => Person.validates("name", { unknown: true } as any)).toThrow(
      "Unknown validator: 'UnknownValidator'",
    );
  });

  it("validates with disabled unknown validator", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    expect(() => Person.validates("name", { unknown: false } as any)).toThrow(
      "Unknown validator: 'UnknownValidator'",
    );
  });

  it("validates with if as shared conditions", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attribute("active", "boolean");
        this.validates("name", {
          presence: true,
          length: { minimum: 3 },
          if: (r: any) => r._readAttribute("active") === true,
        });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({ active: false }).isValid()).toBe(true);
    expect(await new Person({ active: true }).isValid()).toBe(false);
    expect(await new Person({ active: true, name: "abc" }).isValid()).toBe(true);
  });

  it("validates with allow nil shared conditions", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("value", "string");
        this.validates("value", {
          numericality: true,
          allowNil: true,
        });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({}).isValid()).toBe(true);
    expect(await new Person({ value: "42" }).isValid()).toBe(true);
    expect(await new Person({ value: "abc" }).isValid()).toBe(false);
  });

  it("validates with validator class and options", async () => {
    class CustomValidator {
      private min: number;
      constructor(options: any = {}) {
        this.min = options.minimum ?? 0;
      }
      validate(record: any) {
        const val = record._readAttribute("name");
        if (typeof val === "string" && val.length < this.min) {
          record.errors.add("name", ":too_short", { message: "is too short" });
        }
      }
    }
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validatesWith(CustomValidator, { minimum: 5 });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({ name: "ab" }).isValid()).toBe(false);
    expect(await new Person({ name: "alice" }).isValid()).toBe(true);
  });
});
