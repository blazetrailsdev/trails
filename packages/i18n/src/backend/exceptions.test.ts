/**
 * Mirrors: i18n/test/backend/exceptions_test.rb
 *
 * The `MissingInterpolationArgument` case stays measured as missing rather
 * than faked: it passes the String `'key'` and expects `key.inspect` to render
 * `"key"` (i18n/lib/i18n/exceptions.rb:102), while the message renders every
 * key as a Symbol (`:key`) — which is what `i18n/test/i18n/exceptions_test.rb:59`
 * (ported in `../exceptions.trails.test.ts`) needs, since interpolation keys
 * reach it as bare strings rather than the colon-prefixed spelling. Converging
 * that representation is the `i18n-interpolation-key-symbol-spelling` story.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { MissingTranslationData } from "../exceptions.js";
import { config, l, resetConfig, setBackend, t } from "../i18n.js";
import { resetClassConfig } from "../config.js";
import { catchException } from "../throw-catch.js";
import { Simple } from "./simple.js";

/**
 * Stands in for `Time.now`: `localize` duck-types its object off `strftime`
 * and `sec`, and this case raises at the format lookup before `strftime` runs.
 */
const timeNow = {
  sec: 0,
  strftime(format: string): string {
    return format;
  },
};

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
  it("exceptions: MissingTranslationData message from #localize includes the given scope and full key", () => {
    let exception: MissingTranslationData | undefined;
    try {
      l(timeNow, { format: ":foo" });
    } catch (error) {
      if (!(error instanceof MissingTranslationData)) throw error;
      exception = error;
    }
    expect(exception!.message).toBe("Translation missing: en.time.formats.foo");
  });
});
