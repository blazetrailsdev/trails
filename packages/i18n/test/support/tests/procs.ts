import { expect, it } from "vitest";
import { Hash, rbInspect } from "@blazetrails/ruby-compat";
import { config, t } from "../../../lib/i18n.js";

export function testsProcs(): void {
  it("lookup: given a translation is a proc it calls the proc with the key and interpolation values", () => {
    config().backend.storeTranslations("en", {
      a_lambda: (...args: unknown[]) => filterArgs(...args),
    });
    expect(t(":a_lambda", { foo: "foo" })).toBe(`[:a_lambda, ${rbInspect({ foo: "foo" })}]`);
  });

  it("lookup: given a translation is a proc it passes the interpolation values as keyword arguments", () => {
    config().backend.storeTranslations("en", {
      a_lambda: (key: unknown, { foo }: { foo: unknown }) => filterArgs(key, { foo }),
    });
    expect(t(":a_lambda", { foo: "foo" })).toBe(`[:a_lambda, ${rbInspect({ foo: "foo" })}]`);
  });

  it("defaults: given a default is a Proc it calls it with the key and interpolation values", () => {
    const proc = (...args: unknown[]) => filterArgs(...args);
    expect(t(null, { default: proc, foo: "foo" })).toBe(`[nil, ${rbInspect({ foo: "foo" })}]`);
  });

  it("defaults: given a default is a key that resolves to a Proc it calls it with the key and interpolation values", () => {
    const theLambda = (...args: unknown[]) => filterArgs(...args);
    config().backend.storeTranslations("en", { a_lambda: theLambda });
    expect(t(null, { default: ":a_lambda", foo: "foo" })).toBe(
      `[:a_lambda, ${rbInspect({ foo: "foo" })}]`,
    );
    expect(t(null, { default: [null, ":a_lambda"], foo: "foo" })).toBe(
      `[:a_lambda, ${rbInspect({ foo: "foo" })}]`,
    );
  });

  it("interpolation: given an interpolation value is a lambda it calls it with key and values before interpolating it", () => {
    const proc = (...args: unknown[]) => filterArgs(...args);
    expect(t(null, { default: "%{foo}", foo: proc })).toMatch(/\[\{"foo"=>#<Proc.*>\}\]/);
  });

  it("interpolation: given a key resolves to a Proc that returns a string then interpolation still works", () => {
    const proc = (...args: unknown[]) => "%{foo}: " + filterArgs(...args);
    expect(t(null, { default: proc, foo: "foo" })).toBe(
      `foo: ${`[nil, ${rbInspect({ foo: "foo" })}]`}`,
    );
  });

  it("pluralization: given a key resolves to a Proc that returns valid data then pluralization still works", () => {
    const proc = (..._args: unknown[]) =>
      new Hash().set(":zero", "zero").set(":one", "one").set(":other", "other");
    expect(t(null, { default: proc, count: 0 })).toBe("zero");
    expect(t(null, { default: proc, count: 1 })).toBe("one");
    expect(t(null, { default: proc, count: 2 })).toBe("other");
  });

  it("lookup: given the option :resolve => false was passed it does not resolve proc translations", () => {
    config().backend.storeTranslations("en", {
      a_lambda: (...args: unknown[]) => filterArgs(...args),
    });
    expect(typeof t(":a_lambda", { resolve: false })).toBe("function");
  });

  it("lookup: given the option :resolve => false was passed it does not resolve proc default", () => {
    expect(
      typeof t(null, { default: (...args: unknown[]) => filterArgs(...args), resolve: false }),
    ).toBe("function");
  });
}

export function filterArgs(...args: unknown[]): string {
  return rbInspect(
    args.map((arg) => {
      if (arg != null && typeof arg === "object" && !Array.isArray(arg)) {
        const hash = arg as Record<string, unknown>;
        delete hash.fallbackInProgress;
        delete hash.fallbackOriginalLocale;
        delete hash.skipInterpolation;
      }
      return arg;
    }),
  );
}
