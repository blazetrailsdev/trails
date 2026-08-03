import { describe, it, expect } from "vitest";

import { MissingTranslation, MissingTranslationData } from "./exceptions.js";

/**
 * Ported from i18n/test/i18n/exceptions_test.rb. Only the two cases that do not
 * route through `I18n.translate` are here; the rest exercise the backend and
 * land with the translate story. Trails-only coverage of the message and
 * accessor shapes lives in exceptions.trails.test.ts.
 */
describe("I18nExceptionsTest", () => {
  it("MissingTranslation can be initialized without options", () => {
    const exception = new MissingTranslation("en", "foo");
    expect(exception.options).toEqual({});
  });

  it("MissingTranslationData#new can be initialized with just two arguments", () => {
    expect(new MissingTranslationData("en", "key")).toBeTruthy();
  });
});
