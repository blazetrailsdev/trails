/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect, afterEach } from "vitest";
import {
  assertEmpty,
  assertNothingRaised,
  assertPredicate,
  assertRaise,
  include,
} from "@blazetrails/activesupport";
import { Model } from "../index.js";
import { Attributes, type AttributesClassHalf } from "../attributes.js";
import { ArgumentError } from "../attribute-assignment.js";
import { Topic } from "../test-helpers/models/topic.js";
import { Person } from "../test-helpers/models/person.js";

const A = "(?<![\\s\\S])";
const Z = "(?![\\s\\S])";

describe("FormatValidationTest", () => {
  afterEach(() => {
    Topic.clearValidatorsBang();
  });

  it("validate format", async () => {
    Topic.validatesFormatOf("title", "content", {
      with: new RegExp(`${A}Validation\\smacros \\w+!${Z}`),
      message: "is bad data",
    });

    const t = new Topic({ title: "i'm incorrect", content: "Validation macros rule!" });
    assertPredicate(await t.isInvalid(), (v) => v, "Shouldn't be valid");
    expect(t.errors.get("title")).toEqual(["is bad data"]);
    assertEmpty(t.errors.get("content"));

    t.title = "Validation macros rule!";

    assertPredicate(await t.isValid(), (v) => v);
    assertEmpty(t.errors.get("title"));

    await assertRaise([ArgumentError], {}, () => Topic.validatesFormatOf("title", "content"));
  });

  it("validate format with allow blank", async () => {
    Topic.validatesFormatOf("title", {
      with: new RegExp(`${A}Validation\\smacros \\w+!${Z}`),
      allowBlank: true,
    });
    assertPredicate(await new Topic({ title: "Shouldn't be valid" }).isInvalid(), (v) => v);
    assertPredicate(await new Topic({ title: "" }).isValid(), (v) => v);
    assertPredicate(await new Topic({ title: null }).isValid(), (v) => v);
    assertPredicate(await new Topic({ title: "Validation macros rule!" }).isValid(), (v) => v);
  });

  it("validate format numeric", async () => {
    Topic.validatesFormatOf("title", "content", {
      with: new RegExp(`${A}[1-9][0-9]*${Z}`),
      message: "is bad data",
    });

    const t = new Topic({ title: "72x", content: "6789" });
    assertPredicate(await t.isInvalid(), (v) => v, "Shouldn't be valid");

    expect(t.errors.get("title")).toEqual(["is bad data"]);
    assertEmpty(t.errors.get("content"));

    t.title = "-11";
    assertPredicate(await t.isInvalid(), (v) => v, "Shouldn't be valid");

    t.title = "03";
    assertPredicate(await t.isInvalid(), (v) => v, "Shouldn't be valid");

    t.title = "z44";
    assertPredicate(await t.isInvalid(), (v) => v, "Shouldn't be valid");

    t.title = "5v7";
    assertPredicate(await t.isInvalid(), (v) => v, "Shouldn't be valid");

    t.title = "1";

    assertPredicate(await t.isValid(), (v) => v);
    assertEmpty(t.errors.get("title"));
  });

  it("validate format with formatted message", async () => {
    Topic.validatesFormatOf("title", {
      with: new RegExp(`${A}Valid Title${Z}`),
      message: "can't be %{value}",
    });
    const t = new Topic({ title: "Invalid title" });
    assertPredicate(await t.isInvalid(), (v) => v);
    expect(t.errors.get("title")).toEqual(["can't be Invalid title"]);
  });

  it("validate format of with multiline regexp should raise error", async () => {
    await assertRaise([ArgumentError], {}, () =>
      Topic.validatesFormatOf("title", { with: /^Valid Title$/m }),
    );
  });

  it("validate format of with multiline regexp and option", async () => {
    await assertNothingRaised(() => {
      Topic.validatesFormatOf("title", { with: /^Valid Title$/m, multiline: true });
    });
  });

  it("validate format with not option", async () => {
    Topic.validatesFormatOf("title", { without: /foo/, message: "should not contain foo" });
    const t = new Topic();

    t.title = "foobar";
    await t.isValid();
    expect(t.errors.get("title")).toEqual(["should not contain foo"]);

    t.title = "something else";
    await t.isValid();
    expect(t.errors.get("title")).toEqual([]);
  });

  it("validate format of without any regexp should raise error", async () => {
    await assertRaise([ArgumentError], {}, () => Topic.validatesFormatOf("title"));
  });

  it("validates format of with both regexps should raise error", async () => {
    await assertRaise([ArgumentError], {}, () =>
      Topic.validatesFormatOf("title", { with: /this/, without: /that/ }),
    );
  });

  it("validates format of when with isnt a regexp should raise error", async () => {
    await assertRaise([ArgumentError], {}, () =>
      Topic.validatesFormatOf("title", { with: "clearly not a regexp" }),
    );
  });

  it("validates format of when not isnt a regexp should raise error", async () => {
    await assertRaise([ArgumentError], {}, () =>
      Topic.validatesFormatOf("title", { without: "clearly not a regexp" }),
    );
  });

  it("validates format of with lambda", async () => {
    Topic.validatesFormatOf("content", {
      with: (topic: Topic) =>
        topic.title === "digit" ? new RegExp(`${A}\\d+${Z}`) : new RegExp(`${A}\\S+${Z}`),
    });

    const t = new Topic();
    t.title = "digit";
    t.content = "Pixies";
    assertPredicate(await t.isInvalid(), (v) => v);

    t.content = "1234";
    assertPredicate(await t.isValid(), (v) => v);
  });

  it("validates format of with lambda without arguments", async () => {
    Topic.validatesFormatOf("title", { with: () => new RegExp(`${A}[A-Z]`) });

    const t = new Topic();
    t.title = "lowercase";
    assertPredicate(await t.isInvalid(), (v) => v);

    t.title = "Titleized";
    assertPredicate(await t.isValid(), (v) => v);
  });

  it("validates format of without lambda", async () => {
    Topic.validatesFormatOf("content", {
      without: (topic: Topic) =>
        topic.title === "characters" ? new RegExp(`${A}\\d+${Z}`) : new RegExp(`${A}\\S+${Z}`),
    });

    const t = new Topic();
    t.title = "characters";
    t.content = "1234";
    assertPredicate(await t.isInvalid(), (v) => v);

    t.content = "Pixies";
    assertPredicate(await t.isValid(), (v) => v);
  });

  it("validates format of without lambda without arguments", async () => {
    Topic.validatesFormatOf("title", { without: () => /\d/ });

    const t = new Topic();
    t.title = "With number 123";
    assertPredicate(await t.isInvalid(), (v) => v);

    t.title = "Without number";
    assertPredicate(await t.isValid(), (v) => v);
  });

  it("validates format of for ruby class", async () => {
    try {
      Person.validatesFormatOf("karma", { with: new RegExp(`${A}\\d+${Z}`) });

      const p = new Person();
      p.karma = "Pixies";
      assertPredicate(await p.isInvalid(), (v) => v);

      expect(p.errors.get("karma")).toEqual(["is invalid"]);

      p.karma = "1234";
      assertPredicate(await p.isValid(), (v) => v);
    } finally {
      Person.clearValidatorsBang();
    }
  });
});
describe("format with 'without' option", () => {
  class NoNumbers extends Model {
    declare static attribute: AttributesClassHalf["attribute"];

    static {
      include(this, Attributes);
      this.attribute("name", "string");
      this.validates("name", { format: { without: /\d/ } });
    }
  }
  interface NoNumbers extends Attributes {}

  it("accepts values not matching 'without'", async () => {
    expect(await new NoNumbers({ name: "dean" }).isValid()).toBe(true);
  });

  it("rejects values matching 'without'", async () => {
    const n = new NoNumbers({ name: "dean123" });
    expect(await n.isValid()).toBe(false);
    expect(n.errors.messagesFor("name")).toContain("is invalid");
  });

  it("validate format does not mutate regex lastIndex across calls (g flag)", async () => {
    const sharedRe = /\d+/g;
    class P extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("code", "string");
        this.validates("code", { format: { with: sharedRe } });
      }
    }
    interface P extends Attributes {}

    expect(await new P({ code: "abc123" }).isValid()).toBe(true);
    expect(await new P({ code: "abc123" }).isValid()).toBe(true);
    expect(await new P({ code: "abc123" }).isValid()).toBe(true);
    expect(sharedRe.lastIndex).toBe(0);
  });
});
