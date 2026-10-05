import { hashAref } from "@blazetrails/ruby-compat";
/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body; the empty
   class/interface merge beside it is how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { include } from "@blazetrails/activesupport";
import { Serialization } from "../serialization.js";
import { Model } from "../index.js";
import { Attributes, type AttributesClassHalf } from "../attributes.js";
import { LazilyDefineAttributes } from "./acceptance.js";

describe("AcceptanceValidationTest (trails-only)", () => {
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

    expect((hashAref(Agreement.attributeTypes(), "terms") as { type(): string }).type()).toBe(
      "boolean",
    );
  });
});

describe("LazilyDefineAttributes#matches?", () => {
  it("setup! leaves a class field and a prototype method of the attribute's name alone", async () => {
    class Agreement extends Model {
      terms: unknown = "1";
      eula(): string {
        return "1";
      }

      static {
        this.validates("terms", { acceptance: true });
        this.validates("eula", { acceptance: true });
      }
    }

    const agreement = new Agreement();
    expect(agreement.terms).toBe("1");
    expect(agreement.eula()).toBe("1");
    agreement.terms = "0";
    expect(agreement.terms).toBe("0");
    expect(await agreement.isValid()).toBe(false);
  });

  it("matches the writer name as well as the reader", () => {
    const mod = new LazilyDefineAttributes(["terms"]);

    expect(mod.matches("terms")).toBe(true);
    expect(mod.matches("terms=")).toBe(true);
    expect(mod.matches("other")).toBe(false);
    expect(mod.matches("other=")).toBe(false);
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
