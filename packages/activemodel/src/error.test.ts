import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertNotRespondTo, assertNothingRaised } from "@blazetrails/activesupport";
import { Errors } from "./errors.js";
import { I18n } from "./i18n.js";
import { ModelName } from "./naming.js";
import { Error as ModelError } from "./error.js";
import { resetI18n } from "./test-helpers/i18n.js";

class Person {
  errors: Errors;
  name: string | null = null;
  age: number | null = null;

  constructor() {
    this.errors = new Errors(this);
  }

  readAttributeForValidation(attr: string): unknown {
    return (this as unknown as Record<string, unknown>)[attr];
  }

  static humanAttributeName(attr: string, _options: object = {}): string {
    return attr;
  }

  static lookupAncestors(): unknown[] {
    return [this];
  }
}

class Manager extends Person {
  static moduleName = "ErrorTest";
  static modelName = new ModelName(Manager as never);

  override readAttributeForValidation(attr: string): unknown {
    return (this as unknown as Record<string, unknown>)[attr];
  }

  static i18nScope = "activemodel";

  static override lookupAncestors(): unknown[] {
    return [this];
  }
}

describe("ErrorTest", () => {
  let enforceAvailableLocales: boolean;

  beforeEach(() => {
    resetI18n();
    enforceAvailableLocales = I18n.config().enforceAvailableLocales;
    I18n.config().enforceAvailableLocales = false;
  });

  afterEach(() => {
    I18n.config().enforceAvailableLocales = enforceAvailableLocales;
    resetI18n();
  });

  it("initialize", () => {
    const base = new Person();
    const error = new ModelError(base, "name", ":too_long", { foo: ":bar" });
    expect(error.base).toBe(base);
    expect(error.attribute).toBe("name");
    expect(error.type).toBe(":too_long");
    expect(error.options).toEqual({ foo: ":bar" });
  });

  it("initialize without type", () => {
    const error = new ModelError(new Person(), "name");
    expect(error.type).toBe(":invalid");
    expect(error.options).toEqual({});
  });

  it("initialize without type but with options", () => {
    const options = { message: "bar" };
    const error = new ModelError(new Person(), "name", undefined, options);
    expect(error.options).toEqual(options);
  });

  it("match? handles mixed condition", () => {
    const subject = new ModelError(new Person(), "mineral", ":not_enough", { count: 2 });
    expect(subject.match("mineral", ":too_coarse")).toBeFalsy();
    expect(subject.match("mineral", ":not_enough")).toBeTruthy();
    expect(subject.match("mineral", ":not_enough", { count: 2 })).toBeTruthy();
    expect(subject.match("mineral", ":not_enough", { count: 1 })).toBeFalsy();
  });

  it("match? handles attribute match", () => {
    const subject = new ModelError(new Person(), "mineral", ":not_enough", { count: 2 });
    expect(subject.match("foo")).toBeFalsy();
    expect(subject.match("mineral")).toBeTruthy();
  });

  it("match? handles error type match", () => {
    const subject = new ModelError(new Person(), "mineral", ":not_enough", { count: 2 });
    expect(subject.match("mineral", ":too_coarse")).toBeFalsy();
    expect(subject.match("mineral", ":not_enough")).toBeTruthy();
  });

  it("match? handles extra options match", () => {
    const subject = new ModelError(new Person(), "mineral", ":not_enough", { count: 2 });
    expect(subject.match("mineral", ":not_enough", { count: 1 })).toBeFalsy();
    expect(subject.match("mineral", ":not_enough", { count: 2 })).toBeTruthy();
  });

  it("message with type as a symbol", () => {
    const error = new ModelError(new Person(), "name", ":blank");
    expect(error.message).toBe("can't be blank");
  });

  it("message with custom interpolation", () => {
    const subject = new ModelError(new Person(), "name", ":inclusion", {
      message: "custom message %{value}",
      value: "name",
    });
    expect(subject.message).toBe("custom message name");
  });

  it("message returns plural interpolation", () => {
    const subject = new ModelError(new Person(), "name", ":too_long", { count: 10 });
    expect(subject.message).toBe("is too long (maximum is 10 characters)");
  });

  it("message returns singular interpolation", () => {
    const subject = new ModelError(new Person(), "name", ":too_long", { count: 1 });
    expect(subject.message).toBe("is too long (maximum is 1 character)");
  });

  it("message returns count interpolation", () => {
    const subject = new ModelError(new Person(), "name", ":too_long", {
      message: "custom message %{count}",
      count: 10,
    });
    expect(subject.message).toBe("custom message 10");
  });

  it("message handles lambda in messages and option values, and i18n interpolation", () => {
    const subject = new ModelError(new Person(), "name", ":invalid", {
      foo: "foo",
      bar: "bar",
      baz: () => "baz",
      message: (_model: unknown, options: Record<string, unknown>) =>
        `%{attribute} %{foo} ${options.bar as string} %{baz}`,
    });
    expect(subject.message).toBe("name foo bar baz");
  });

  it("generate_message works without i18n_scope", async () => {
    const person = new Person();
    const error = new ModelError(person, "name", ":blank");
    assertNotRespondTo(Person, "i18nScope");
    await assertNothingRaised(() => {
      return error.message;
    });
  });

  it("message with type as custom message", () => {
    const error = new ModelError(new Person(), "name", undefined, {
      message: "cannot be blank",
    });
    expect(error.message).toBe("cannot be blank");
  });

  it("message with options[:message] as custom message", () => {
    const error = new ModelError(new Person(), "name", ":blank", {
      message: "cannot be blank",
    });
    expect(error.message).toBe("cannot be blank");
  });

  it("message renders lazily using current locale", () => {
    let error: ModelError | null = null;

    I18n.backend().storeTranslations("pl", {
      errors: { messages: { invalid: "jest nieprawidłowe" } },
    });

    I18n.withLocale("en", () => {
      error = new ModelError(new Person(), "name", ":invalid");
    });
    I18n.withLocale("pl", () => {
      expect(error!.message).toBe("jest nieprawidłowe");
    });
  });

  it("message with type as a symbol and indexed attribute can lookup without index in attribute key", () => {
    I18n.backend().storeTranslations("en", {
      activemodel: {
        errors: {
          models: {
            "error_test/manager": {
              attributes: { reports: { name: { presence: "must be present" } } },
            },
          },
        },
      },
    });

    const error = new ModelError(new Manager(), "reports[123].name", ":presence");

    expect(error.message).toBe("must be present");
  });

  it("message uses current locale", () => {
    I18n.backend().storeTranslations("en", {
      errors: { messages: { inadequate: "Inadequate %{attribute} found!" } },
    });
    const error = new ModelError(new Person(), "name", ":inadequate");
    expect(error.message).toBe("Inadequate name found!");
  });

  it("full_message returns the given message when attribute is :base", () => {
    const error = new ModelError(new Person(), "base", undefined, {
      message: "press the button",
    });
    expect(error.fullMessage).toBe("press the button");
  });

  it("full_message returns the given message with the attribute name included", () => {
    const error = new ModelError(new Person(), "name", ":blank");
    expect(error.fullMessage).toBe("name can't be blank");
  });

  it("full_message uses default format", () => {
    const error = new ModelError(new Person(), "name", undefined, {
      message: "can't be blank",
    });

    I18n.withLocale("unknown", () => {
      expect(error.fullMessage).toBe("name can't be blank");
    });
  });

  it("equality by base attribute, type and options", () => {
    const person = new Person();

    const e1 = new ModelError(person, "name", undefined, { foo: ":bar" });
    const e2 = new ModelError(person, "name", undefined, { foo: ":bar" });
    (e2 as unknown as Record<string, unknown>)._humanizedAttribute = "Name";

    expect(e1.equals(e2)).toBe(true);
  });

  it("inequality", () => {
    const person = new Person();
    const error = new ModelError(person, "name", undefined, { foo: ":bar" });

    expect(!error.equals(new ModelError(person, "name", undefined, { foo: ":baz" }))).toBeTruthy();
    expect(!error.equals(new ModelError(person, "name"))).toBeTruthy();
    expect(!error.equals(new ModelError(person, "title", undefined, { foo: ":bar" }))).toBeTruthy();
    expect(
      !error.equals(new ModelError(new Person(), "name", undefined, { foo: ":bar" })),
    ).toBeTruthy();
  });

  it("comparing against different class would not raise error", () => {
    const person = new Person();
    const error = new ModelError(person, "name", undefined, { foo: ":bar" });

    expect(error).not.toEqual(person);
  });

  it("full_message returns the given message when the attribute contains base", () => {
    const error = new ModelError(new Person(), "foo.base", "press the button");
    expect(error.fullMessage).toBe("foo.base press the button");
  });

  it("details which ignores callback and message options", () => {
    const person = new Person();
    const error = new ModelError(person, "name", ":too_short", {
      foo: ":bar",
      if: ":foo",
      unless: ":bar",
      on: ":baz",
      allow_nil: false,
      allow_blank: false,
      strict: true,
      message: "message",
    });

    expect(error.details).toEqual({ error: ":too_short", foo: ":bar" });
  });

  it("details which has no raw_type", () => {
    const person = new Person();
    const error = new ModelError(person, "name", undefined, { foo: ":bar" });

    expect(error.details).toEqual({ error: ":invalid", foo: ":bar" });
  });
});
