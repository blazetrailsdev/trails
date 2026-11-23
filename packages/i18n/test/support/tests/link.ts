import { expect, it } from "vitest";
import { config, t } from "../../../lib/i18n.js";

export function testsLink(): void {
  it("linked lookup: if a key resolves to a symbol it looks up the symbol", () => {
    config().backend.storeTranslations("en", {
      link: ":linked",
      linked: "linked",
    });
    expect(config().backend.translate("en", ":link")).toBe("linked");
  });

  it("linked lookup: if a key resolves to a dot-separated symbol it looks up the symbol", () => {
    config().backend.storeTranslations("en", {
      link: ":foo.linked",
      foo: { linked: "linked" },
    });
    expect(config().backend.translate("en", ":link")).toBe("linked");
  });

  it("linked lookup: if a dot-separated key resolves to a symbol it looks up the symbol", () => {
    config().backend.storeTranslations("en", {
      foo: { link: ":linked" },
      linked: "linked",
    });
    expect(config().backend.translate("en", ":foo.link")).toBe("linked");
  });

  it("linked lookup: if a dot-separated key resolves to a dot-separated symbol it looks up the symbol", () => {
    config().backend.storeTranslations("en", {
      foo: { link: ":bar.linked" },
      bar: { linked: "linked" },
    });
    expect(config().backend.translate("en", ":foo.link")).toBe("linked");
  });

  it("linked lookup: links always refer to the absolute key", () => {
    config().backend.storeTranslations("en", {
      foo: { link: ":linked", linked: "linked in foo" },
      linked: "linked absolutely",
    });
    expect(config().backend.translate("en", ":link", { scope: ":foo" })).toBe("linked absolutely");
  });

  it("linked lookup: a link can resolve to a namespace in the middle of a dot-separated key", () => {
    config().backend.storeTranslations("en", {
      activemodel: { errors: { messages: { blank: "can't be blank" } } },
      activerecord: { errors: { messages: ":activemodel.errors.messages" } },
    });
    expect(t(":activerecord.errors.messages.blank")).toBe("can't be blank");
    expect(t(":activerecord.errors.messages.blank")).toBe("can't be blank");
  });

  it("linked lookup: a link can resolve with option :count", () => {
    config().backend.storeTranslations("en", {
      counter: ":counted",
      counted: { foo: { one: "one", other: "other" }, bar: "bar" },
    });
    expect(t(":counter.foo", { count: 1 })).toBe("one");
    expect(t(":counter.foo", { count: 2 })).toBe("other");
    expect(t(":counter.bar", { count: 3 })).toBe("bar");
  });
}
