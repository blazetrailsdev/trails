import { include } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Cascade } from "../../lib/backend/cascade.js";
import { Simple } from "../../lib/backend/simple.js";
import { MissingTranslationData } from "../../lib/exceptions.js";
import { backend, setBackend, t } from "../../lib/i18n.js";
import * as TestCase from "../support/test-case.js";

class Backend extends Simple {}
include(Backend, Cascade);

describe("I18nBackendCascadeTest", () => {
  let cascadeOptions: Record<string, unknown>;

  function storeTranslations(locale: string, data: Record<string, unknown>): void {
    backend().storeTranslations(locale, data);
  }

  function lookup(key: unknown, options: Record<string, unknown> = {}): unknown {
    return t(key as string, { ...options, cascade: cascadeOptions });
  }

  beforeEach(async () => {
    await TestCase.setup();
    setBackend(new Backend());
    storeTranslations("en", { foo: "foo", bar: { baz: "baz" } });
    cascadeOptions = { step: 1, offset: 1, skipRoot: false };
  });

  afterEach(async () => {
    await TestCase.teardown();
  });

  it("still returns an existing translation as usual", () => {
    expect(lookup(":foo")).toBe("foo");
    expect(lookup(":bar.baz")).toBe("baz");
  });

  it("falls back by cutting keys off the end of the scope", () => {
    expect(lookup(":foo", { scope: ":missing" })).toBe("foo");
    expect(lookup(":foo", { scope: ":missing.missing" })).toBe("foo");
    expect(lookup(":baz", { scope: ":bar.missing" })).toBe("baz");
    expect(lookup(":baz", { scope: ":bar.missing.missing" })).toBe("baz");
  });

  it("raises I18n::MissingTranslationData exception when no translation was found", () => {
    expect(() => lookup(":foo.missing", { raise: true })).toThrow(MissingTranslationData);
    expect(() => lookup(":bar.baz.missing", { raise: true })).toThrow(MissingTranslationData);
    expect(() => lookup(":missing.bar.baz", { raise: true })).toThrow(MissingTranslationData);
  });

  it("cascades before evaluating the default", () => {
    expect(lookup(":foo", { scope: ":missing", default: "default" })).toBe("foo");
  });

  it("cascades defaults, too", () => {
    expect(lookup(null, { default: [":missing.missing", ":missing.foo"] })).toBe("foo");
  });

  it("works with :offset => 2 and a single key", () => {
    cascadeOptions.offset = 2;
    lookup(":foo");
  });

  it("assemble required fallbacks for ActiveRecord validation messages", () => {
    storeTranslations("en", {
      errors: {
        odd: "errors.odd",
        reply: { title: { blank: "errors.reply.title.blank" }, taken: "errors.reply.taken" },
        topic: { title: { format: "errors.topic.title.format" }, length: "errors.topic.length" },
      },
    });
    expect(lookup(":errors.reply.title.blank", { default: ":errors.topic.title.blank" })).toBe(
      "errors.reply.title.blank",
    );
    expect(lookup(":errors.reply.title.taken", { default: ":errors.topic.title.taken" })).toBe(
      "errors.reply.taken",
    );
    expect(lookup(":errors.reply.title.format", { default: ":errors.topic.title.format" })).toBe(
      "errors.topic.title.format",
    );
    expect(lookup(":errors.reply.title.length", { default: ":errors.topic.title.length" })).toBe(
      "errors.topic.length",
    );
    expect(lookup(":errors.reply.title.odd", { default: ":errors.topic.title.odd" })).toBe(
      "errors.odd",
    );
  });

  it("assemble action view translation helper lookup cascade", () => {
    cascadeOptions.offset = 2;

    storeTranslations("en", {
      menu: { show: "menu.show" },
      namespace: {
        menu: { new: "namespace.menu.new" },
        controller: {
          menu: { edit: "namespace.controller.menu.edit" },
          action: {
            menu: { destroy: "namespace.controller.action.menu.destroy" },
          },
        },
      },
    });

    expect(lookup(":namespace.controller.action.menu.show")).toBe("menu.show");
    expect(lookup(":namespace.controller.action.menu.new")).toBe("namespace.menu.new");
    expect(lookup(":namespace.controller.action.menu.edit")).toBe("namespace.controller.menu.edit");
    expect(lookup(":namespace.controller.action.menu.destroy")).toBe(
      "namespace.controller.action.menu.destroy",
    );
  });
});
