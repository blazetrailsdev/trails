/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect, afterEach } from "vitest";
import { Model, I18n } from "../index.js";
import { resetI18n } from "../test-helpers/i18n.js";
import { assertPredicate } from "@blazetrails/activesupport";
import { Topic } from "../test-helpers/models/topic.js";
import { Person } from "../test-helpers/models/person.js";

declare module "../test-helpers/models/topic.js" {
  interface Topic {
    titleConfirmation: unknown;
    approvedConfirmation: unknown;
  }
}
declare module "../test-helpers/models/person.js" {
  interface Person {
    karmaConfirmation: unknown;
  }
}

describe("ConfirmationValidationTest", () => {
  afterEach(() => {
    Topic.clearValidatorsBang();
  });

  it("no title confirmation", async () => {
    Topic.validatesConfirmationOf("title");

    const t = new Topic({ authorName: "Plutarch" });
    assertPredicate(await t.isValid(), (valid) => valid);

    t.titleConfirmation = "Parallel Lives";
    assertPredicate(await t.isInvalid(), (invalid) => invalid);

    t.titleConfirmation = null;
    t.title = "Parallel Lives";
    assertPredicate(await t.isValid(), (valid) => valid);

    t.titleConfirmation = "Parallel Lives";
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("title confirmation", async () => {
    Topic.validatesConfirmationOf("title");

    const t = new Topic({ title: "We should be confirmed", titleConfirmation: "" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);

    t.titleConfirmation = "We should be confirmed";
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("validates confirmation of with boolean attribute", async () => {
    Topic.validatesConfirmationOf("approved");

    const t = new Topic({ approved: true, approvedConfirmation: null });
    assertPredicate(await t.isValid(), (valid) => valid);

    t.approvedConfirmation = false;
    assertPredicate(await t.isInvalid(), (invalid) => invalid);

    t.approvedConfirmation = true;
    assertPredicate(await t.isValid(), (valid) => valid);
  });

  it("validates confirmation of for ruby class", async () => {
    try {
      Person.validatesConfirmationOf("karma");

      const p = new Person();
      p.karmaConfirmation = "None";
      assertPredicate(await p.isInvalid(), (invalid) => invalid);

      expect(p.errors.messagesFor("karmaConfirmation")).toEqual(["doesn't match Karma"]);

      p.karma = "None";
      assertPredicate(await p.isValid(), (valid) => valid);
    } finally {
      Person.clearValidatorsBang();
    }
  });

  it("title confirmation with i18n attribute", async () => {
    try {
      I18n.backend().storeTranslations("en", {
        errors: { messages: { confirmation: "doesn't match %{attribute}" } },
        activemodel: { attributes: { topic: { title: "Test Title" } } },
      });

      Topic.validatesConfirmationOf("title");

      const t = new Topic({ title: "We should be confirmed", titleConfirmation: "" });
      assertPredicate(await t.isInvalid(), (invalid) => invalid);
      expect(t.errors.messagesFor("titleConfirmation")).toEqual(["doesn't match Test Title"]);
    } finally {
      resetI18n();
    }
  });

  it("does not override confirmation reader if present", () => {
    class Klass extends Model {
      get titleConfirmation(): string {
        return "expected title";
      }

      static {
        this.validatesConfirmationOf("title");
      }
    }

    expect(new Klass().titleConfirmation).toEqual("expected title");
  });

  it("does not override confirmation writer if present", () => {
    class Klass extends Model {
      set titleConfirmation(value: string) {
        (this as { _titleConfirmation?: string })._titleConfirmation = "expected title";
      }

      static {
        this.validatesConfirmationOf("title");
      }
    }
    interface Klass {
      get titleConfirmation(): string;
    }

    const model = new Klass();
    model.titleConfirmation = "new title";
    expect(model.titleConfirmation).toEqual("expected title");
  });

  it("title confirmation with case sensitive option true", async () => {
    Topic.validatesConfirmationOf("title", { caseSensitive: true });

    const t = new Topic({ title: "title", titleConfirmation: "Title" });
    assertPredicate(await t.isInvalid(), (invalid) => invalid);
  });

  it("title confirmation with case sensitive option false", async () => {
    Topic.validatesConfirmationOf("title", { caseSensitive: false });

    const t = new Topic({ title: "title", titleConfirmation: "Title" });
    assertPredicate(await t.isValid(), (valid) => valid);
  });
});
