import { expect, it } from "vitest";
import { MissingInterpolationArgument, ReservedInterpolationKey } from "../../../lib/exceptions.js";
import { config } from "../../../lib/i18n.js";

export function testsInterpolation(): void {
  it("interpolation: given no values it does not alter the string", () => {
    expect(interpolate({ default: "Hi %{name}!" })).toBe("Hi %{name}!");
  });

  it("interpolation: given values it interpolates them into the string", () => {
    expect(interpolate({ default: "Hi %{name}!", name: "David" })).toBe("Hi David!");
  });

  it("interpolation: works with a pipe", () => {
    expect(interpolate({ default: "Hi %{name|lowercase}!", "name|lowercase": "david" })).toBe(
      "Hi david!",
    );
  });

  it("interpolation: given a nil value it still interpolates it into the string", () => {
    expect(interpolate({ default: "Hi %{name}!", name: null })).toBe("Hi !");
  });

  it("interpolation: given a lambda as a value it calls it if the string contains the key", () => {
    expect(interpolate({ default: "Hi %{name}!", name: (..._args: unknown[]) => "David" })).toBe(
      "Hi David!",
    );
  });

  it("interpolation: given a lambda as a value it does not call it if the string does not contain the key", () => {
    expect(() =>
      interpolate({
        default: "Hi!",
        name: (..._args: unknown[]) => {
          throw new Error("fail");
        },
      }),
    ).not.toThrow();
  });

  it("interpolation: given values but missing a key it raises I18n::MissingInterpolationArgument", () => {
    expect(() => interpolate({ default: "%{foo}", bar: "bar" })).toThrow(
      MissingInterpolationArgument,
    );
  });

  it("interpolation: it does not raise I18n::MissingInterpolationArgument for escaped variables", () => {
    expect(() => {
      expect(interpolate({ default: "%{bar} %%{foo}", bar: "Barr" })).toBe("Barr %{foo}");
    }).not.toThrow();
  });

  it("interpolation: it does not change the original, stored translation string", () => {
    config().backend.storeTranslations("en", { interpolate: "Hi %{name}!" });
    expect(interpolate(":interpolate", { name: "David" })).toBe("Hi David!");
    expect(interpolate(":interpolate", { name: "Yehuda" })).toBe("Hi Yehuda!");
  });

  it("interpolation: given an array interpolates each element", () => {
    config().backend.storeTranslations("en", {
      array_interpolate: ["Hi", "Mr. %{name}", "or sir %{name}"],
    });
    expect(interpolate(":array_interpolate", { name: "Bartuz" })).toEqual([
      "Hi",
      "Mr. Bartuz",
      "or sir Bartuz",
    ]);
  });

  it("interpolation: given the translation is in utf-8 it still works", () => {
    expect(interpolate({ default: "Häi %{name}!", name: "David" })).toBe("Häi David!");
  });

  it("interpolation: given the value is in utf-8 it still works", () => {
    expect(interpolate({ default: "Hi %{name}!", name: "ゆきひろ" })).toBe("Hi ゆきひろ!");
  });

  it("interpolation: given the translation and the value are in utf-8 it still works", () => {
    expect(interpolate({ default: "こんにちは、%{name}さん!", name: "ゆきひろ" })).toBe(
      "こんにちは、ゆきひろさん!",
    );
  });

  // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
  it.skip("interpolation: given a euc-jp translation and a utf-8 value it raises Encoding::CompatibilityError", () => {});

  // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
  it.skip("interpolation: given a utf-8 translation and a euc-jp value it raises Encoding::CompatibilityError", () => {});

  // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
  it.skip("interpolation: ASCII strings in the backend should be encoded to UTF8 if interpolation options are in UTF8", () => {});

  // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
  it.skip("interpolation: UTF8 strings in the backend are still returned as UTF8 with ASCII interpolation", () => {});

  // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either".
  it.skip("interpolation: UTF8 strings in the backend are still returned as UTF8 even with numbers interpolation", () => {});

  it("interpolation: given a translations containing a reserved key it raises I18n::ReservedInterpolationKey", () => {
    expect(() => interpolate({ foo: ":bar", default: "%{exception_handler}" })).toThrow(
      ReservedInterpolationKey,
    );
    expect(() => interpolate({ foo: ":bar", default: "%{default}" })).toThrow(
      ReservedInterpolationKey,
    );
    expect(() => interpolate({ foo: ":bar", default: "%{separator}" })).toThrow(
      ReservedInterpolationKey,
    );
    expect(() => interpolate({ foo: ":bar", default: "%{scope}" })).toThrow(
      ReservedInterpolationKey,
    );
    expect(() => interpolate({ default: "%{scope}" })).toThrow(ReservedInterpolationKey);

    config().backend.storeTranslations("en", { interpolate: "Hi %{scope}!" });
    expect(() => interpolate(":interpolate")).toThrow(ReservedInterpolationKey);
  });

  it("interpolation: it does not raise I18n::ReservedInterpolationKey for escaped variables", () => {
    expect(() => {
      expect(interpolate({ foo: ":bar", default: "%%{separator}" })).toBe("%{separator}");
    }).not.toThrow();

    expect(() => {
      expect(interpolate({ default: "%%{scope}" })).toBe("%%{scope}");
    }).not.toThrow();

    config().backend.storeTranslations("en", { interpolate: "Hi %%{scope}!" });
    expect(() => {
      expect(interpolate(":interpolate")).toBe("Hi %%{scope}!");
    }).not.toThrow();
  });

  it("interpolation: deep interpolation for default string", () => {
    expect(interpolate({ default: "Hi %{name}!", deepInterpolation: true })).toBe("Hi %{name}!");
  });

  it("interpolation: deep interpolation for interpolated string", () => {
    expect(interpolate({ default: "Hi %{name}!", name: "Ann", deepInterpolation: true })).toBe(
      "Hi Ann!",
    );
  });

  it("interpolation: deep interpolation for Hash", () => {
    const people = { people: { ann: "Ann is %{ann}", john: "John is %{john}" } };
    const interpolatedPeople = { people: { ann: "Ann is good", john: "John is big" } };
    expect(
      interpolate({ default: people, ann: "good", john: "big", deepInterpolation: true }),
    ).toEqual(interpolatedPeople);
  });

  it("interpolation: deep interpolation for Array", () => {
    const people = { people: ["Ann is %{ann}", "John is %{john}"] };
    const interpolatedPeople = { people: ["Ann is good", "John is big"] };
    expect(
      interpolate({ default: people, ann: "good", john: "big", deepInterpolation: true }),
    ).toEqual(interpolatedPeople);
  });
}

function interpolate(...args: unknown[]): unknown {
  const options = (
    args.at(-1) != null && typeof args.at(-1) === "object" ? args.pop() : {}
  ) as Record<string, unknown>;
  const key = (args.pop() ?? null) as string | null;
  return config().backend.translate("en", key, options);
}
