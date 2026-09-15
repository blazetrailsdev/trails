import { kernelCatch } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";

import { Simple } from "../backend/simple.js";
import { resetClassConfig } from "../config.js";
import * as I18n from "../i18n.js";
import { config, resetConfig } from "../i18n.js";
import type { MissingTranslation } from "../exceptions.js";

type I18nModule = Omit<typeof I18n, "translate" | "t"> & {
  translate(...args: unknown[]): unknown;
  t(...args: unknown[]): unknown;
};

describe("I18nOverrideTest", () => {
  const OverrideSignature = {
    translate(...args: unknown[]): unknown {
      return (args[0] as string) + (args[1] as string);
    },
  } as { translate(...args: unknown[]): unknown; t(...args: unknown[]): unknown };
  OverrideSignature.t = OverrideSignature.translate;

  let dupI18n: I18nModule;

  beforeEach(() => {
    resetConfig();
    resetClassConfig();
    config().enforceAvailableLocales = false;
    dupI18n = { ...I18n } as unknown as I18nModule;
    config().backend = new Simple();
  });

  it("make sure modules can overwrite I18n methods", () => {
    const OverrideInverse = {
      translate(key: string, options: Record<string, unknown>): unknown {
        return [...(super.translate(key, options) as string)].reverse().join("");
      },
    } as { translate(...args: unknown[]): unknown; t(...args: unknown[]): unknown };
    OverrideInverse.t = OverrideInverse.translate;

    dupI18n = Object.setPrototypeOf(OverrideInverse, dupI18n) as I18nModule;
    config().backend.storeTranslations("en", { foo: "bar" });

    expect(dupI18n.translate(":foo", { locale: "en" })).toBe("rab");
    expect(dupI18n.t(":foo", { locale: "en" })).toBe("rab");
    expect(dupI18n.translateBang(":foo", { locale: "en" })).toBe("rab");
    expect(dupI18n.tBang(":foo", { locale: "en" })).toBe("rab");
  });

  it("make sure modules can overwrite I18n signature", () => {
    const exception = kernelCatch(":exception", () =>
      dupI18n.t("Hello", { tokenize: true, throw: true }),
    ) as MissingTranslation;
    expect(exception.message).toBeTruthy();

    Object.assign(dupI18n, OverrideSignature);
    expect(dupI18n.translate("Hello", "Welcome message on home page", { tokenize: true })).toBe(
      "HelloWelcome message on home page",
    );
  });
});
