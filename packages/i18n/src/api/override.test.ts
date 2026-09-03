import { beforeEach, describe, expect, it } from "vitest";

import { Simple } from "../backend/simple.js";
import { resetClassConfig } from "../config.js";
import * as I18n from "../i18n.js";
import { config, resetConfig } from "../i18n.js";
import { catchException } from "../throw-catch.js";
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

  it("make sure modules can overwrite I18n signature", () => {
    const exception = catchException(() =>
      dupI18n.t("Hello", { tokenize: true, throw: true }),
    ) as MissingTranslation;
    expect(exception.message).toBeTruthy();

    Object.assign(dupI18n, OverrideSignature);
    expect(dupI18n.translate("Hello", "Welcome message on home page", { tokenize: true })).toBe(
      "HelloWelcome message on home page",
    );
  });
});
