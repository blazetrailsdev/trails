import { beforeEach, describe, expect, it } from "vitest";
import { MissingInterpolationArgument, MissingTranslationData, inspect } from "../exceptions.js";
import { config, l, resetConfig, setBackend, t } from "../i18n.js";
import { resetClassConfig } from "../config.js";
import { catchException } from "../throw-catch.js";
import { Simple } from "./simple.js";

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

  it("exceptions: MissingInterpolationArgument message includes missing key, provided keys and full string", () => {
    const exception = new MissingInterpolationArgument("key", { this: "was given" }, "string");
    expect(exception.message).toBe(
      `missing interpolation argument "key" in "string" (${inspect({ this: "was given" })} given)`,
    );
  });
});
