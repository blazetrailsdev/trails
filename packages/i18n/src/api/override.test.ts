/**
 * Mirrors: i18n/test/api/override_test.rb
 *
 * `I18n.dup` duplicates the module object; an ESM namespace is not
 * duplicable, so the copy below is the object spread of its exports, and
 * `extend` is the assignment of a module's methods onto it. `@I18n.backend =`
 * still reaches the one process-wide config, which is what `I18n.config` is
 * here (i18n.ts:92-93).
 *
 * Only "make sure modules can overwrite I18n signature" is ported.
 * "make sure modules can overwrite I18n methods" needs `translate!` to reach
 * the overriding `translate` through `self`, and trails' `translateBang` calls
 * the module-level `translate` directly (i18n.ts:261-267) because a module of
 * top-level functions has no receiver to dispatch on — filed as
 * `i18n-base-receiver-dispatch`.
 */

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

const OverrideSignature = {
  translate(...args: unknown[]): unknown {
    return (args[0] as string) + (args[1] as string);
  },
} as const;

describe("I18nOverrideTest", () => {
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

    Object.assign(dupI18n, OverrideSignature, { t: OverrideSignature.translate });
    // tr8n example
    expect(dupI18n.translate("Hello", "Welcome message on home page", { tokenize: true })).toBe(
      "HelloWelcome message on home page",
    );
  });
});
