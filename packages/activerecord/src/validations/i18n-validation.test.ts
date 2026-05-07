import { describe, it } from "vitest";

describe("I18nValidationTest", () => {
  it.skip("validates_uniqueness_of on generated message ", () => {
    // BLOCKED: i18n — translation / message generation gap in i18n-validation
    // ROOT-CAUSE: translation.ts missing Rails parity
    // SCOPE: ~30–100 LOC fix in translation.ts; affects ~4–11 tests in i18n-validation.test.ts
  });
  it.skip("validates_associated on generated message ", () => {
    // BLOCKED: i18n — translation / message generation gap in i18n-validation
    // ROOT-CAUSE: translation.ts missing Rails parity
    // SCOPE: ~30–100 LOC fix in translation.ts; affects ~4–11 tests in i18n-validation.test.ts
  });
  it.skip("validates associated finds custom model key translation", () => {
    // BLOCKED: i18n — translation / message generation gap in i18n-validation
    // ROOT-CAUSE: translation.ts missing Rails parity
    // SCOPE: ~30–100 LOC fix in translation.ts; affects ~4–11 tests in i18n-validation.test.ts
  });
  it.skip("validates associated finds global default translation", () => {
    // BLOCKED: i18n — translation / message generation gap in i18n-validation
    // ROOT-CAUSE: translation.ts missing Rails parity
    // SCOPE: ~30–100 LOC fix in translation.ts; affects ~4–11 tests in i18n-validation.test.ts
  });
});
