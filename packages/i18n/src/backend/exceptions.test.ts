/**
 * Mirrors: i18n/test/backend/exceptions_test.rb
 *
 * Two cases stay measured as missing rather than being faked:
 *
 * - the `#localize` case, since `Backend::Base#localize`
 *   (i18n/lib/i18n/backend/base.rb:78) lands with the `i18n-backend-localize`
 *   story;
 * - the `MissingInterpolationArgument` case, which passes the String `'key'`
 *   and expects `key.inspect` to render `"key"`
 *   (i18n/lib/i18n/exceptions.rb:102). Ruby Symbols have no JS analogue, so a
 *   trails interpolation key is a plain string and the message renders it as a
 *   Symbol — which is what the every-day path and
 *   `i18n/test/i18n/exceptions_test.rb:59` (ported in
 *   `../exceptions.trails.test.ts`) require. The two Rails cases cannot both
 *   hold off one representation.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { MissingTranslationData } from "../exceptions.js";
import { config, resetConfig, setBackend, t } from "../i18n.js";
import { resetClassConfig } from "../config.js";
import { catchException } from "../throw-catch.js";
import { Simple } from "./simple.js";

describe("I18nBackendExceptionsTest", () => {
  beforeEach(() => {
    resetConfig();
    resetClassConfig();
    setBackend(new Simple());
    config().enforceAvailableLocales = false;
  });

  it("throw message: MissingTranslation message from #translate includes the given scope and full key", () => {
    const exception = catchException(() => t("baz.missing", { scope: "foo.bar", throw: true }));
    expect((exception as Error).message).toBe("Translation missing: en.foo.bar.baz.missing");
  });

  it("exceptions: MissingTranslationData message from #translate includes the given scope and full key", () => {
    let exception: MissingTranslationData | undefined;
    try {
      t("baz.missing", { scope: "foo.bar", raise: true });
    } catch (error) {
      if (!(error instanceof MissingTranslationData)) throw error;
      exception = error;
    }
    expect(exception!.message).toBe("Translation missing: en.foo.bar.baz.missing");
  });
});
