import { describe, it, expect } from "vitest";
import { Model } from "../index.js";

describe("AcceptanceValidationTest", () => {
  it("eula", async () => {
    class Person extends Model {
      static {
        this.attribute("eula", "string");
        this.validates("eula", { acceptance: true });
      }
    }
    const p = new Person({ eula: "0" });
    expect(await p.isValid()).toBe(false);
    const p2 = new Person({ eula: "1" });
    expect(await p2.isValid()).toBe(true);
  });

  it("lazy attribute module included only once", async () => {
    class Person extends Model {
      static {
        this.attribute("terms", "boolean");
        this.validates("terms", { acceptance: true });
      }
    }
    const p = new Person({ terms: true });
    expect(await p.isValid()).toBe(true);
  });

  it("lazy attributes module included again if needed", async () => {
    class Person extends Model {
      static {
        this.attribute("terms", "boolean");
        this.validates("terms", { acceptance: true });
      }
    }
    const p = new Person({ terms: false });
    await p.isValid();
    expect(p.errors.count).toBeGreaterThan(0);
  });

  it("lazy attributes respond to?", () => {
    class Person extends Model {
      static {
        this.attribute("terms", "boolean");
        this.validates("terms", { acceptance: true });
      }
    }
    const p = new Person({});
    expect(p.hasAttribute("terms")).toBe(true);
  });

  it("terms of service agreement no acceptance", async () => {
    class Terms extends Model {
      static {
        this.attribute("terms", "string");
        this.validates("terms", { acceptance: true });
      }
    }
    expect(await new Terms({ terms: "0" }).isValid()).toBe(false);
  });

  it("terms of service agreement", async () => {
    class Terms extends Model {
      static {
        this.attribute("terms", "string");
        this.validates("terms", { acceptance: true });
      }
    }
    expect(await new Terms({ terms: "1" }).isValid()).toBe(true);
  });

  it("terms of service agreement with accept value", async () => {
    class Terms extends Model {
      static {
        this.attribute("terms", "string");
        this.validates("terms", { acceptance: { accept: ["yes", "I agree"] } });
      }
    }
    expect(await new Terms({ terms: "yes" }).isValid()).toBe(true);
    expect(await new Terms({ terms: "no" }).isValid()).toBe(false);
  });

  it("terms of service agreement with multiple accept values", async () => {
    class Terms extends Model {
      static {
        this.attribute("terms", "string");
        this.validates("terms", { acceptance: { accept: ["1", "yes", "true"] } });
      }
    }
    expect(await new Terms({ terms: "1" }).isValid()).toBe(true);
    expect(await new Terms({ terms: "yes" }).isValid()).toBe(true);
    expect(await new Terms({ terms: "true" }).isValid()).toBe(true);
    expect(await new Terms({ terms: "no" }).isValid()).toBe(false);
  });

  it("validates acceptance of true", async () => {
    // Rails' Topic uses `attr_accessor :terms_of_service`, preserving the
    // assigned value without casting; its tests rely on `true` matching the
    // default accept list `["1", true]`. Our Model requires a declared
    // attribute, so use `boolean` here — `true` round-trips through cast.
    // A `string`-typed attribute would cast `true` to "t" (per
    // type/immutable_string.rb) and rightly not match the default list.
    class Terms extends Model {
      static {
        this.attribute("terms", "boolean");
        this.validates("terms", { acceptance: true });
      }
    }
    expect(await new Terms({ terms: true }).isValid()).toBe(true);
  });

  it("validates acceptance of for ruby class", async () => {
    class Person extends Model {}
    Person.attribute("terms", "string");
    Person.validates("terms", { acceptance: true });
    const p = new Person({ terms: "no" });
    expect(await p.isValid()).toBe(false);
    const p2 = new Person({ terms: "1" });
    expect(await p2.isValid()).toBe(true);
  });

  it("validates acceptance with a scalar accept option", async () => {
    // Rails' `acceptable_option?` does `Array(options[:accept]).include?(value)`,
    // so a non-array `accept:` is normalized to a one-element list.
    class Terms extends Model {
      static {
        this.attribute("terms", "string");
        this.validates("terms", { acceptance: { accept: "yes" } });
      }
    }
    expect(await new Terms({ terms: "yes" }).isValid()).toBe(true);
    expect(await new Terms({ terms: "y" }).isValid()).toBe(false);
  });

  it("validates acceptance with an iterable (Set) accept option", async () => {
    // Rails' `Array(options[:accept])` coerces via `to_a`, so a Set/Enumerator
    // should be spread into the list of accepted values.
    class Terms extends Model {
      static {
        this.attribute("terms", "string");
        this.validates("terms", { acceptance: { accept: new Set(["yes", "ok"]) } });
      }
    }
    expect(await new Terms({ terms: "yes" }).isValid()).toBe(true);
    expect(await new Terms({ terms: "ok" }).isValid()).toBe(true);
    expect(await new Terms({ terms: "no" }).isValid()).toBe(false);
  });

  it("setup! auto-defines attribute when not explicitly declared", async () => {
    class Agreement extends Model {
      static {
        this.validates("terms", { acceptance: true });
      }
    }
    // setup! installs a prototype accessor (Rails attr_reader/attr_writer),
    // not a declared attribute definition.
    expect(Object.getOwnPropertyDescriptor(Agreement.prototype, "terms")?.set).toBeTypeOf(
      "function",
    );
    const a = new Agreement({ terms: "1" });
    expect(await a.isValid()).toBe(true);
    // The value lives in the accessor slot (attr_accessor), not @attributes.
    expect((a as unknown as { terms: unknown }).terms).toBe("1");
  });

  it("setup! virtual attribute excluded from attributeNames and serialization", () => {
    class Agreement extends Model {
      static {
        this.attribute("name", "string");
        this.validates("terms", { acceptance: true });
      }
    }
    expect(Agreement.attributeNames()).toContain("name");
    expect(Agreement.attributeNames()).not.toContain("terms");
    const a = new Agreement({ name: "test", terms: "1" });
    const hash = a.serializableHash();
    expect(hash).toHaveProperty("name");
    expect(hash).not.toHaveProperty("terms");
  });

  it("setup! does not override explicitly declared attribute", () => {
    class Agreement extends Model {
      static {
        this.attribute("terms", "boolean");
        this.validates("terms", { acceptance: true });
      }
    }
    expect(Agreement._attributeDefinitions.get("terms")!.type.name).toBe("boolean");
    expect(Agreement._attributeDefinitions.get("terms")!.virtual).toBeUndefined();
  });
});
describe("acceptance skips nil", () => {
  it("skips nil by default", async () => {
    class Terms extends Model {
      static {
        this.attribute("terms", "string");
        this.validates("terms", { acceptance: true });
      }
    }
    expect(await new Terms({}).isValid()).toBe(true);
  });
});

describe("acceptance options pass-through", () => {
  it("passes custom interpolation vars through to errors.add", async () => {
    class Terms extends Model {
      static {
        this.attribute("terms", "string");
        this.validates("terms", {
          acceptance: { accept: "yes", message: "must be %{kind}", kind: "accepted" },
        });
      }
    }
    const t = new Terms({ terms: "no" });
    await t.isValid();
    expect(t.errors.get("terms")).toContain("must be accepted");
  });

  it("reserved key accept does not appear in error options", async () => {
    class Terms extends Model {
      static {
        this.attribute("terms", "string");
        this.validates("terms", { acceptance: { accept: "yes" } });
      }
    }
    const t = new Terms({ terms: "no" });
    await t.isValid();
    expect(t.errors.count).toBeGreaterThan(0);
    expect(t.errors.objects.find((d) => d.attribute === "terms")?.options?.accept).toBeUndefined();
  });
});
