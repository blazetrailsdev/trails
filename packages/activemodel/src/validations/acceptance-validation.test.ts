import { describe, it, expect } from "vitest";
import { assert, assertDifference, assertPredicate } from "@blazetrails/activesupport";
import { includedModules, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Model } from "../index.js";
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
});
