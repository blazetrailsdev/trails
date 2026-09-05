/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Serialization` in its class body, the way the
   Rails test model it mirrors does; the empty class/interface merge beside it is how
   `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { include } from "@blazetrails/activesupport";
import { Serialization } from "../serialization.js";
import { Model } from "../index.js";
import { Attributes, type AttributesClassHalf } from "../attributes.js";
import { LazilyDefineAttributes } from "./acceptance.js";

describe("AcceptanceValidationTest", () => {
  it("eula", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("eula", "string");
        this.validates("eula", { acceptance: true });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ eula: "0" });
    expect(await p.isValid()).toBe(false);
    const p2 = new Person({ eula: "1" });
    expect(await p2.isValid()).toBe(true);
  });

  it("lazy attribute module included only once", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("terms", "boolean");
        this.validates("terms", { acceptance: true });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ terms: true });
    expect(await p.isValid()).toBe(true);
  });

  it("lazy attributes module included again if needed", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("terms", "boolean");
        this.validates("terms", { acceptance: true });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ terms: false });
    await p.isValid();
    expect(p.errors.count).toBeGreaterThan(0);
  });

  it("lazy attributes respond to?", () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("terms", "boolean");
        this.validates("terms", { acceptance: true });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    expect(p._attributes.isKey("terms")).toBe(true);
  });

  it("terms of service agreement no acceptance", async () => {
    class Terms extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("terms", "string");
        this.validates("terms", { acceptance: true });
      }
    }
    interface Terms extends Attributes {}

    expect(await new Terms({ terms: "0" }).isValid()).toBe(false);
  });

  it("terms of service agreement", async () => {
    class Terms extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("terms", "string");
        this.validates("terms", { acceptance: true });
      }
    }
    interface Terms extends Attributes {}

    expect(await new Terms({ terms: "1" }).isValid()).toBe(true);
  });

  it("terms of service agreement with accept value", async () => {
    class Terms extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("terms", "string");
        this.validates("terms", { acceptance: { accept: ["yes", "I agree"] } });
      }
    }
    interface Terms extends Attributes {}

    expect(await new Terms({ terms: "yes" }).isValid()).toBe(true);
    expect(await new Terms({ terms: "no" }).isValid()).toBe(false);
  });

  it("terms of service agreement with multiple accept values", async () => {
    class Terms extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("terms", "string");
        this.validates("terms", { acceptance: { accept: ["1", "yes", "true"] } });
      }
    }
    interface Terms extends Attributes {}

    expect(await new Terms({ terms: "1" }).isValid()).toBe(true);
    expect(await new Terms({ terms: "yes" }).isValid()).toBe(true);
    expect(await new Terms({ terms: "true" }).isValid()).toBe(true);
    expect(await new Terms({ terms: "no" }).isValid()).toBe(false);
  });

  it("validates acceptance of true", async () => {
    class Terms extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("terms", "boolean");
        this.validates("terms", { acceptance: true });
      }
    }
    interface Terms extends Attributes {}

    expect(await new Terms({ terms: true }).isValid()).toBe(true);
  });

  it("validates acceptance of for ruby class", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
      }
    }
    interface Person extends Attributes {}
    Person.attribute("terms", "string");
    Person.validates("terms", { acceptance: true });
    const p = new Person({ terms: "no" });
    expect(await p.isValid()).toBe(false);
    const p2 = new Person({ terms: "1" });
    expect(await p2.isValid()).toBe(true);
  });

  it("validates acceptance with a scalar accept option", async () => {
    class Terms extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("terms", "string");
        this.validates("terms", { acceptance: { accept: "yes" } });
      }
    }
    interface Terms extends Attributes {}

    expect(await new Terms({ terms: "yes" }).isValid()).toBe(true);
    expect(await new Terms({ terms: "y" }).isValid()).toBe(false);
  });

  it("validates acceptance with an iterable (Set) accept option", async () => {
    class Terms extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("terms", "string");
        this.validates("terms", { acceptance: { accept: new Set(["yes", "ok"]) } });
      }
    }
    interface Terms extends Attributes {}

    expect(await new Terms({ terms: "yes" }).isValid()).toBe(true);
    expect(await new Terms({ terms: "ok" }).isValid()).toBe(true);
    expect(await new Terms({ terms: "no" }).isValid()).toBe(false);
  });

  it("setup! auto-defines attribute when not explicitly declared", async () => {
    class Agreement extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeNames: AttributesClassHalf["attributeNames"];
      declare static attributeTypes: AttributesClassHalf["attributeTypes"];

      static {
        this.validates("terms", { acceptance: true });
      }
    }
    expect(Agreement.isAttributeMethod("terms=")).toBe(true);
    const a = new Agreement({ terms: "1" });
    expect(await a.isValid()).toBe(true);
    expect((a as unknown as { terms: unknown }).terms).toBe("1");
  });

  it("setup! virtual attribute excluded from attributeNames and serialization", () => {
    class Agreement extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeNames: AttributesClassHalf["attributeNames"];

      static {
        include(this, Attributes);
        include(this, Serialization);
        this.attribute("name", "string");
        this.validates("terms", { acceptance: true });
      }
    }
    interface Agreement extends Attributes, Serialization {}

    expect(Agreement.attributeNames()).toContain("name");
    expect(Agreement.attributeNames()).not.toContain("terms");
    const a = new Agreement({ name: "test", terms: "1" });
    const hash = a.serializableHash();
    expect(hash).toHaveProperty("name");
    expect(hash).not.toHaveProperty("terms");
  });

  it("setup! does not override explicitly declared attribute", () => {
    class Agreement extends Model {
      declare static attribute: AttributesClassHalf["attribute"];
      declare static attributeTypes: AttributesClassHalf["attributeTypes"];

      static {
        include(this, Attributes);
        this.attribute("terms", "boolean");
        this.validates("terms", { acceptance: true });
      }
    }
    interface Agreement extends Attributes {}

    expect(Agreement.attributeTypes()["terms"]!.type()).toBe("boolean");
  });
});
describe("LazilyDefineAttributes#matches?", () => {
  it("matches the writer name as well as the reader", () => {
    const mod = new LazilyDefineAttributes(["terms"]);

    expect(mod.matches("terms")).toBe(true);
    expect(mod.matches("terms=")).toBe(true);
    expect(mod.matches("other")).toBe(false);
    expect(mod.matches("other=")).toBe(false);
  });
});

describe("acceptance skips nil", () => {
  it("skips nil by default", async () => {
    class Terms extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("terms", "string");
        this.validates("terms", { acceptance: true });
      }
    }
    interface Terms extends Attributes {}

    expect(await new Terms({}).isValid()).toBe(true);
  });
});

describe("acceptance options pass-through", () => {
  it("passes custom interpolation vars through to errors.add", async () => {
    class Terms extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("terms", "string");
        this.validates("terms", {
          acceptance: { accept: "yes", message: "must be %{kind}", kind: "accepted" },
        });
      }
    }
    interface Terms extends Attributes {}

    const t = new Terms({ terms: "no" });
    await t.isValid();
    expect(t.errors.messagesFor("terms")).toContain("must be accepted");
  });

  it("reserved key accept does not appear in error options", async () => {
    class Terms extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("terms", "string");
        this.validates("terms", { acceptance: { accept: "yes" } });
      }
    }
    interface Terms extends Attributes {}

    const t = new Terms({ terms: "no" });
    await t.isValid();
    expect(t.errors.count).toBeGreaterThan(0);
    expect(t.errors.objects.find((d) => d.attribute === "terms")?.options?.accept).toBeUndefined();
  });
});
