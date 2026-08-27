/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { Model } from "../index.js";
import { Attributes, type AttributesClassHalf } from "../attributes.js";
import { include } from "@blazetrails/activesupport";

describe("ExclusionValidationTest", () => {
  it("validates exclusion of with lambda without arguments", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("role", "string");
        this.validates("role", { exclusion: { in: () => ["banned"] } });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({ role: "admin" }).isValid()).toBe(true);
    expect(await new Person({ role: "banned" }).isValid()).toBe(false);
  });

  it("validates exclusion of beginless numeric range", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("role", "string");
        this.validates("role", { exclusion: { in: ["banned"] } });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ role: "user" });
    expect(await p.isValid()).toBe(true);
  });

  it("validates exclusion of endless numeric range", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("role", "string");
        this.validates("role", { exclusion: { in: ["banned"] } });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ role: "admin" });
    expect(await p.isValid()).toBe(true);
  });

  it("validates exclusion of with time range", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("status", "string");
        this.validates("status", { exclusion: { in: ["deleted", "archived"] } });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ status: "active" });
    expect(await p.isValid()).toBe(true);
  });

  it("validates exclusion of", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("karma", "string");
        this.validates("karma", { exclusion: { in: ["ow", "ar"] } });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({ karma: "ow" }).isValid()).toBe(false);
    expect(await new Person({ karma: "other" }).isValid()).toBe(true);
  });

  it("validates exclusion of with formatted message", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("karma", "string");
        this.validates("karma", { exclusion: { in: ["ow"], message: "is not allowed" } });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ karma: "ow" });
    await p.isValid();
    expect(p.errors.messagesFor("karma")).toContain("is not allowed");
  });

  it("validates exclusion of with lambda", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("status", "string");
        this.validates("status", { exclusion: { in: () => ["banned", "suspended"] } });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ status: "banned" });
    expect(await p.isValid()).toBe(false);
    const p2 = new Person({ status: "active" });
    expect(await p2.isValid()).toBe(true);
  });

  it("validates exclusion of with within option", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("status", "string");
        this.validates("status", { exclusion: { within: ["banned", "suspended"] } });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({ status: "active" }).isValid()).toBe(true);
    expect(await new Person({ status: "banned" }).isValid()).toBe(false);
  });

  it("validates exclusion of for ruby class", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
      }
    }
    interface Person extends Attributes {}
    Person.attribute("username", "string");
    Person.validates("username", { exclusion: { in: ["admin", "root"] } });
    expect(await new Person({ username: "dean" }).isValid()).toBe(true);
    expect(await new Person({ username: "admin" }).isValid()).toBe(false);
  });

  it("validates exclusion of with range", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("status", "string");
        this.validates("status", { exclusion: { in: ["deleted", "banned", "suspended"] } });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({ status: "active" }).isValid()).toBe(true);
    expect(await new Person({ status: "deleted" }).isValid()).toBe(false);
  });

  it("validates inclusion of with symbol", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("status", "string");
        this.validates("status", { exclusion: { in: () => ["banned"] } });
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({ status: "active" }).isValid()).toBe(true);
    expect(await new Person({ status: "banned" }).isValid()).toBe(false);
  });
});
describe("exclusion allowNil", () => {
  it("skips nil by default", async () => {
    class WithNil extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("role", "string");
        this.validates("role", { exclusion: { in: ["admin"] } });
      }
    }
    interface WithNil extends Attributes {}

    expect(await new WithNil({}).isValid()).toBe(true);
  });
});
