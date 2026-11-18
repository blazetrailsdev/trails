import { Thread } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { locale, setDefaultLocale, setLocale } from "../lib/i18n.js";
import { Middleware } from "../lib/middleware.js";
import * as TestCase from "./support/test-case.js";

class DummyRackApp {
  call(_env: unknown): unknown {
    setLocale("es");
    return undefined;
  }
}

describe("I18nMiddlewareTest", () => {
  let app: DummyRackApp;
  let middleware: Middleware;

  beforeEach(async () => {
    await TestCase.setup();
    setDefaultLocale("fr");
    app = new DummyRackApp();
    middleware = new Middleware(app);
  });

  afterEach(async () => {
    await TestCase.teardown();
  });

  it("middleware initializes new config object after request", async () => {
    const oldI18nConfigObject = Thread.current().threadVariableGet(":i18n_config");
    await middleware.call({});

    const updatedI18nConfigObject = Thread.current().threadVariableGet(":i18n_config");
    expect(updatedI18nConfigObject).not.toBe(oldI18nConfigObject);
  });

  it("successfully resets i18n locale to default locale by defining new config", async () => {
    await middleware.call({});

    expect(locale()).toBe("fr");
  });
});
