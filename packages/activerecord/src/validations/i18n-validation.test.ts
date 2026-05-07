import { describe, it } from "vitest";

describe("I18nValidationTest", () => {
  it.skip("validates_uniqueness_of on generated message ", () => {
    // BLOCKED: validation — validator behavior gap in i18n-validation
    // ROOT-CAUSE: validations/i18n-validation.ts or translation.ts missing Rails parity
    // SCOPE: ~30–100 LOC fix in validations/; affects ~4–11 tests in i18n-validation.test.ts
  });
  it.skip("validates_associated on generated message ", () => {
    // BLOCKED: validation — validator behavior gap in i18n-validation
    // ROOT-CAUSE: validations/i18n-validation.ts or translation.ts missing Rails parity
    // SCOPE: ~30–100 LOC fix in validations/; affects ~4–11 tests in i18n-validation.test.ts
  });
  it.skip("validates associated finds custom model key translation", () => {
    // BLOCKED: validation — validator behavior gap in i18n-validation
    // ROOT-CAUSE: validations/i18n-validation.ts or translation.ts missing Rails parity
    // SCOPE: ~30–100 LOC fix in validations/; affects ~4–11 tests in i18n-validation.test.ts
  });
  it.skip("validates associated finds global default translation", () => {
    // BLOCKED: validation — validator behavior gap in i18n-validation
    // ROOT-CAUSE: validations/i18n-validation.ts or translation.ts missing Rails parity
    // SCOPE: ~30–100 LOC fix in validations/; affects ~4–11 tests in i18n-validation.test.ts
  });
});
