/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Serialization` in its class body, the way the
   Rails test model it mirrors does; the empty class/interface merge beside it is how
   `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { assert, assertDifference, assertPredicate, include } from "@blazetrails/activesupport";
import { includedModules, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Serialization } from "../serialization.js";
import { Model } from "../index.js";
import { Attributes, type AttributesClassHalf } from "../attributes.js";
import { LazilyDefineAttributes } from "./acceptance.js";
import { Topic } from "../test-helpers/models/topic.js";
import { Person } from "../test-helpers/models/person.js";

type Accepting = Topic & Record<string, unknown>;

describe("AcceptanceValidationTest", () => {
  function defineTestClass<T extends typeof Topic | typeof Person>(parent: T): T {
    return class TestClass extends (parent as typeof Model) {} as T;
  }

  it("terms of service agreement no acceptance", async () => {
    const klass = defineTestClass(Topic);
    klass.validatesAcceptanceOf("termsOfService");

    const t = new klass({ title: "We should not be confirmed" });
    assertPredicate(await t.isValid(), (v) => v);
  });

  it("terms of service agreement", async () => {
    const klass = defineTestClass(Topic);
    klass.validatesAcceptanceOf("termsOfService");

    const t = new klass({ title: "We should be confirmed", termsOfService: "" }) as Accepting;
    assertPredicate(await t.isInvalid(), (v) => v);
    expect(t.errors.get("termsOfService")).toEqual(["must be accepted"]);

    t.termsOfService = "1";
    assertPredicate(await t.isValid(), (v) => v);
  });

  it("eula", async () => {
    const klass = defineTestClass(Topic);
    klass.validatesAcceptanceOf("eula", { message: "must be abided" });

    const t = new klass({ title: "We should be confirmed", eula: "" }) as Accepting;
    assertPredicate(await t.isInvalid(), (v) => v);
    expect(t.errors.get("eula")).toEqual(["must be abided"]);

    t.eula = "1";
    assertPredicate(await t.isValid(), (v) => v);
  });

  it("terms of service agreement with accept value", async () => {
    const klass = defineTestClass(Topic);
    klass.validatesAcceptanceOf("termsOfService", { accept: "I agree." });

    const t = new klass({ title: "We should be confirmed", termsOfService: "" }) as Accepting;
    assertPredicate(await t.isInvalid(), (v) => v);
    expect(t.errors.get("termsOfService")).toEqual(["must be accepted"]);

    t.termsOfService = "I agree.";
    assertPredicate(await t.isValid(), (v) => v);
  });

  it("terms of service agreement with multiple accept values", async () => {
    const klass = defineTestClass(Topic);
    klass.validatesAcceptanceOf("termsOfService", { accept: [1, "I concur."] });

    const t = new klass({ title: "We should be confirmed", termsOfService: "" }) as Accepting;
    assertPredicate(await t.isInvalid(), (v) => v);
    expect(t.errors.get("termsOfService")).toEqual(["must be accepted"]);

    t.termsOfService = 1;
    assertPredicate(await t.isValid(), (v) => v);

    t.termsOfService = "I concur.";
    assertPredicate(await t.isValid(), (v) => v);
  });

  it("validates acceptance of for ruby class", async () => {
    const klass = defineTestClass(Person);
    klass.validatesAcceptanceOf("karma");

    const p = new klass();
    p.karma = "";

    assertPredicate(await p.isInvalid(), (v) => v);
    expect(p.errors.get("karma")).toEqual(["must be accepted"]);

    p.karma = "1";
    assertPredicate(await p.isValid(), (v) => v);
  });

  it("validates acceptance of true", async () => {
    const klass = defineTestClass(Topic);
    klass.validatesAcceptanceOf("termsOfService");

    assertPredicate(await new klass({ termsOfService: true }).isValid(), (v) => v);
  });

  it("lazy attribute module included only once", async () => {
    const klass = defineTestClass(Topic);
    await assertDifference(
      () => includedModules(klass).length,
      2,
      null,
      () => {
        for (let i = 0; i < 2; i++) {
          klass.validatesAcceptanceOf("somethingToAccept");
          assert(rbObjRespondTo(new klass(), "somethingToAccept"));
        }
        for (let i = 0; i < 2; i++) {
          klass.validatesAcceptanceOf("somethingElseToAccept");
          assert(rbObjRespondTo(new klass(), "somethingElseToAccept"));
        }
      },
    );
  });

  it("lazy attributes module included again if needed", async () => {
    const klass = defineTestClass(Topic);
    await assertDifference(
      () => includedModules(klass).length,
      1,
      null,
      () => {
        klass.validatesAcceptanceOf("somethingToAccept");
      },
    );
    const topic = new klass() as Accepting;
    void topic.somethingToAccept;
    await assertDifference(
      () => includedModules(klass).length,
      1,
      null,
      () => {
        klass.validatesAcceptanceOf("somethingElseToAccept");
      },
    );
    assert(rbObjRespondTo(topic, "somethingElseToAccept"));
  });

  it("lazy attributes respond to?", async () => {
    const klass = defineTestClass(Topic);
    klass.validatesAcceptanceOf("termsOfService");
    const topic = new klass();
    const threads: Promise<void>[] = [];
    for (let i = 0; i < 2; i++) {
      threads.push(
        (async () => {
          assert(rbObjRespondTo(topic, "termsOfService"));
        })(),
      );
    }
    await Promise.all(threads);
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
